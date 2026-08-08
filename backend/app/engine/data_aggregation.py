
import asyncio
import logging
import json
from typing import Dict, Any, Optional, List
from datetime import datetime

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

# Configure logging
logger = logging.getLogger(__name__)

NEUTRAL_VENUE_LEAGUE_IDS = {87, 93, 97, 98, 101, 104, 109, 118}


class DataAggregator:
    def __init__(self):
        self.settings = get_settings()
        # Initialize SupabaseREST for 'analytics' schema
        self.db = SupabaseREST(
            self.settings.SUPABASE_URL,
            self.settings.SUPABASE_SERVICE_ROLE_KEY,
            schema="analytics"
        )

    async def get_match_raw_context(self, sport: str, match_id: int) -> Dict[str, Any]:
        """
        Aggregates all raw data into a dictionary.
        Required for archiving and specific filtering.
        """
        if sport == "tennis":
            return await self._fetch_tennis_raw(match_id)
        else:
            return await self._fetch_team_sport_raw(sport, match_id)

    async def get_match_context(self, sport: str, match_id: int) -> str:
        """
        Returns a structured TEXT context optimized for AI (CAR Method).
        """
        raw = await self.get_match_raw_context(sport, match_id)
        return self.format_context(sport, raw)

    def format_context(self, sport: str, raw_context: Dict[str, Any]) -> str:
        """
        Formats a raw data dictionary into a textual report.
        """
        start_time = datetime.now()
        if sport == "tennis":
            return self._format_tennis_report(raw_context, start_time)
        else:
            return self._format_team_sport_report(sport, raw_context, start_time)

    # =========================================================================
    # INTERNAL RAW FETCHERS
    # =========================================================================

    async def _fetch_team_sport_raw(self, sport: str, match_id: int) -> Dict[str, Any]:
        results = await asyncio.gather(
            self.fetch_match_details(sport, match_id),
            self.fetch_team_details(sport, match_id),
            self.fetch_h2h(sport, match_id),
            self.fetch_rolling_stats(sport, match_id),
            self.fetch_odds(sport, match_id),
            self.fetch_elo(sport, match_id),
            self.fetch_injuries(sport, match_id),
            return_exceptions=True
        )
        return {
            "match": self._handle_result(results[0], "match", {}),
            "teams": self._handle_result(results[1], "teams", {}),
            "h2h": self._handle_result(results[2], "h2h", {}),
            "form": self._handle_result(results[3], "form", {}),
            "odds": self._handle_result(results[4], "odds", None),
            "elo": self._handle_result(results[5], "elo", None),
            "injuries": self._handle_result(results[6], "injuries", {"home": [], "away": []})
        }

    async def _fetch_tennis_raw(self, match_id: int) -> Dict[str, Any]:
        results = await asyncio.gather(
            self.fetch_tennis_match_details(match_id),
            self.fetch_tennis_players(match_id),
            self.fetch_tennis_h2h(match_id),
            self.fetch_tennis_rolling(match_id),
            self.fetch_odds("tennis", match_id),
            return_exceptions=True
        )
        return {
            "match": self._handle_result(results[0], "match", {}),
            "players": self._handle_result(results[1], "players", {}),
            "h2h": self._handle_result(results[2], "h2h", {}),
            "rolling": self._handle_result(results[3], "rolling", {}),
            "odds": self._handle_result(results[4], "odds", None)
        }

    # =========================================================================
    # TEAM SPORTS (Football / Basketball)
    # =========================================================================

    def _format_team_sport_report(self, sport: str, raw: Dict[str, Any], start_time) -> str:
        """Text formatter for team-based sports."""
        match_raw = raw.get("match", {})
        team_raw = raw.get("teams", {})
        h2h_raw = raw.get("h2h", {})
        form_raw = raw.get("form", {})
        odds_raw = raw.get("odds")
        elo_raw = raw.get("elo")
        injuries_raw = raw.get("injuries", {"home": [], "away": []})

        # --- TEXTUAL FORMATTING (Optimized for Tokens) ---
        sections = []
        
        # Extract team info
        home_info = team_raw.get("home", {})
        away_info = team_raw.get("away", {})
        home_name = home_info.get("name", "Unknown Home")
        away_name = away_info.get("name", "Unknown Away")
        home_id = home_info.get("id")

        league_id = match_raw.get("league_id")
        is_neutral = league_id in NEUTRAL_VENUE_LEAGUE_IDS

        # 1. Match (with team names)
        sections.append(self._format_match(sport, match_raw, home_name, away_name, is_neutral=is_neutral))
        
        # 1b. Data Legend (helps AI interpret abbreviations correctly)
        if sport == "football":
            sections.append(
                "[LÉGENDE DONNÉES]\n"
                "Chaque ligne de forme = MOYENNE PAR MATCH calculée sur une fenêtre glissante de 5 matchs (rolling L5), PAS un match individuel.\n"
                "• G(F:x, A:y) = Buts Marqués (For) / Encaissés (Against) — moyenne par match\n"
                "• xG(F:x, A:y, D:z) = Buts Attendus (Expected Goals) For/Against/Différence\n"
                "• CS = Nombre de CLEAN SHEETS (matchs à 0 but encaissé) dans la fenêtre de 5 matchs (ex: CS:2 = 2 matchs sans encaisser sur 5)\n"
                "• BTTS = % de matchs où LES DEUX équipes ont marqué (Both Teams To Score)\n"
                "• O2.5 = % de matchs avec plus de 2.5 buts AU TOTAL dans le match (pas par équipe)\n"
                "• WR = Taux de victoire • PPM = Points Par Match • Poss = Possession moyenne\n"
                "• Stk = Série en cours (ex: 3W = 3 victoires consécutives, 1D = 1 nul)"
            )
        elif sport == "basketball":
            sections.append(
                "[LÉGENDE DONNÉES]\n"
                "Chaque ligne de forme = MOYENNE PAR MATCH calculée sur une fenêtre glissante (L5 = 5 matchs, L10 = 10 matchs, SEAS = saison).\n"
                "• RTG(O:x, D:y, N:z) = Offensive/Defensive/Net Rating (points pour 100 possessions). O élevé = attaque forte, D BAS = défense forte, N = différence\n"
                "• Pace = Nombre de possessions par match (rythme de jeu)\n"
                "• eFG% = Effective Field Goal % (tirs réussis pondérés par les 3pts)\n"
                "• TOV% = Turnover % (pertes de balle) • ORB% = Offensive Rebound %\n"
                "• FTR = Free Throw Rate (ratio lancers francs / tirs tentés)\n"
                "• 3P% = 3-Point % • WR = Taux de victoire • Marg = Marge de victoire moyenne\n"
                "• Rest = Jours de repos • B2B = Back-to-Back (2 matchs consécutifs) • G7 = Matchs joués en 7 jours\n"
                "• Stk = Série en cours (ex: 3W = 3 victoires consécutives)"
            )
        
        # 2. Neutral venue context
        if is_neutral:
            sections.append(
                "[CONTEXTE TERRAIN NEUTRE]\n"
                "Ce match se joue sur terrain neutre (compétition internationale type Coupe du Monde, Euro, Copa America, etc.). "
                "Les labels 'Home' et 'Away' sont des désignations ADMINISTRATIVES, pas un avantage de terrain. "
                "Les statistiques 'Home' et 'Away' dans les sections suivantes reflètent les performances de l'équipe dans CE rôle lors de matchs PRÉCÉDENTS "
                "(certains à domicile, d'autres non). Privilégie les statistiques GLOBALES pour ton analyse."
            )

        # 3. Teams & Form
        sections.append(self._format_team_form(sport, home_name, form_raw.get("home", {}), injuries_raw.get("home", []), is_home=True))
        sections.append(self._format_team_form(sport, away_name, form_raw.get("away", {}), injuries_raw.get("away", []), is_home=False))

        # 4. H2H (with team identity for correct mapping)
        sections.append(self._format_h2h(sport, h2h_raw, home_name=home_name, away_name=away_name, home_team_id=home_id))

        # 5. Odds (with team names for label replacement)
        sections.append(self._format_odds(sport, odds_raw, home_name, away_name))

        # 6. Elo
        sections.append(self._format_elo(sport, elo_raw))

        # 7. Cross-Analysis (pre-computed cross-team stats for key markets)
        sections.append(self._format_cross_analysis(sport, form_raw, home_name, away_name, is_neutral=is_neutral))

        context_text = "\n\n".join(sections)

        duration = (datetime.now() - start_time).total_seconds()
        logger.info(f"Report built for {sport} match {match_raw.get('id')} in {duration:.3f}s")
        return context_text

    # =========================================================================
    # TENNIS
    # =========================================================================

    def _format_tennis_report(self, raw: Dict[str, Any], start_time) -> str:
        """Text formatter for tennis."""
        match_raw = raw.get("match", {})
        players_raw = raw.get("players", {})
        h2h_raw = raw.get("h2h", {})
        rolling_raw = raw.get("rolling", {})
        odds_raw = raw.get("odds")

        # --- TEXTUAL FORMATTING ---
        sections = []
        
        # Extract player names
        p1 = players_raw.get("player1", {})
        p2 = players_raw.get("player2", {})
        p1_name = p1.get("name", "Player 1")
        p2_name = p2.get("name", "Player 2")
        
        # 1. Match (with player names)
        sections.append(self._format_match("tennis", match_raw, p1_name, p2_name))
        
        # 1b. Data Legend for tennis
        sections.append(
            "[LÉGENDE DONNÉES]\n"
            "Chaque ligne de forme = MOYENNE PAR MATCH calculée sur une fenêtre glissante de 5 ou 10 matchs.\n"
            "• WR(L5, L10, S) = Taux de Victoire sur 5 derniers / 10 derniers / Saison\n"
            "• 1stSrv = % de 1ers services réussis (Won = % de points gagnés sur 1er service)\n"
            "• Aces = Nombre moyen d'aces par match\n"
            "• RetWon = % de points gagnés en retour de service\n"
            "• BP(Save, Conv) = Balles de Break : Save = % sauvées / Conv = % converties\n"
            "• Rest = Jours depuis le dernier match • Fatig = Score de fatigue (0=frais, 100=épuisé)\n"
            "• L7(Sets, Mins) = Sets et Minutes joués dans les 7 derniers jours"
        )
        
        # 2. Players & Form
        sections.append(self._format_tennis_player(p1, rolling_raw.get("player1", {}), 1))
        sections.append(self._format_tennis_player(p2, rolling_raw.get("player2", {}), 2))
        
        # 3. H2H
        sections.append(self._format_h2h("tennis", h2h_raw))
        
        # 4. Odds (with player names for label replacement)
        sections.append(self._format_odds("tennis", odds_raw, p1_name, p2_name))
        
        context_text = "\n\n".join(sections)
        
        duration = (datetime.now() - start_time).total_seconds()
        logger.info(f"Report built for TENNIS match {match_raw.get('id')} in {duration:.3f}s")
        return context_text

    # =========================================================================
    # COMMON HELPERS
    # =========================================================================

    def _handle_result(self, result, name, default):
        if isinstance(result, Exception):
            logger.error(f"Error fetching {name}: {str(result)}")
            return default
        return result

    # ─────────────────────────────────────────────────────────────────────────
    # CROSS-ANALYSIS (Pre-computed cross-team stats for key markets)
    # ─────────────────────────────────────────────────────────────────────────

    def _format_cross_analysis(self, sport: str, form_raw: Dict[str, Any], home_name: str, away_name: str, is_neutral: bool = False) -> str:
        """Pre-computes cross-team comparisons for key betting markets.

        This section helps the AI by presenting both teams' stats side-by-side
        for specific markets, eliminating the need to cross-reference manually
        across separate text blocks.
        """
        if is_neutral:
            lines = ["[CROSS-ANALYSIS: Key Markets — Both Teams Combined (TERRAIN NEUTRE: stats GLOBALES utilisées)]"]
        else:
            lines = ["[CROSS-ANALYSIS: Key Markets — Both Teams Combined]"]

        home_form = form_raw.get("home", {})
        away_form = form_raw.get("away", {})

        home_global = home_form.get("global", [])
        away_global = away_form.get("global", [])

        if is_neutral:
            h_venue = home_global[0] if home_global else {}
            a_venue = away_global[0] if away_global else {}
        else:
            home_venue = home_form.get("home", [])
            away_venue = away_form.get("away", [])
            h_venue = home_venue[0] if home_venue else {}
            a_venue = away_venue[0] if away_venue else {}

        h_global = home_global[0] if home_global else {}
        a_global = away_global[0] if away_global else {}

        vl = "GLOBAL" if is_neutral else "HOME"
        al = "GLOBAL" if is_neutral else "AWAY"

        if sport == "football":
            # --- BTTS ---
            h_btts_home = h_venue.get("l5_btts_rate", "?")
            a_btts_away = a_venue.get("l5_btts_rate", "?")
            h_btts_global = h_global.get("l5_btts_rate", "?")
            a_btts_global = a_global.get("l5_btts_rate", "?")
            h_cs_home = h_venue.get("l5_clean_sheets", "?")
            a_cs_away = a_venue.get("l5_clean_sheets", "?")
            if is_neutral:
                lines.append(
                    f"BTTS: {home_name} GLOBAL BTTS {h_btts_home}% (CS: {h_cs_home}/5) | "
                    f"{away_name} GLOBAL BTTS {a_btts_away}% (CS: {a_cs_away}/5)"
                )
            else:
                lines.append(
                    f"BTTS: {home_name} HOME BTTS {h_btts_home}% (Global {h_btts_global}%, CS home: {h_cs_home}/5) | "
                    f"{away_name} AWAY BTTS {a_btts_away}% (Global {a_btts_global}%, CS away: {a_cs_away}/5)"
                )

            # --- Over/Under 2.5 ---
            h_o25_home = h_venue.get("l5_over25_rate", "?")
            a_o25_away = a_venue.get("l5_over25_rate", "?")
            lines.append(
                f"O2.5: {home_name} {vl} O2.5 {h_o25_home}% | {away_name} {al} O2.5 {a_o25_away}%"
            )

            # --- Total goals average ---
            h_gf_home = h_venue.get("l5_goals_for", 0)
            h_ga_home = h_venue.get("l5_goals_against", 0)
            a_gf_away = a_venue.get("l5_goals_for", 0)
            a_ga_away = a_venue.get("l5_goals_against", 0)
            h_total = round(h_gf_home + h_ga_home, 1) if isinstance(h_gf_home, (int, float)) and isinstance(h_ga_home, (int, float)) else "?"
            a_total = round(a_gf_away + a_ga_away, 1) if isinstance(a_gf_away, (int, float)) and isinstance(a_ga_away, (int, float)) else "?"
            lines.append(
                f"Avg Total Goals: {home_name} {vl} {h_total}/match (F:{h_gf_home} A:{h_ga_home}) | "
                f"{away_name} {al} {a_total}/match (F:{a_gf_away} A:{a_ga_away})"
            )

            # --- xG comparison ---
            h_xgf = h_venue.get("l5_xg_for", "?")
            h_xga = h_venue.get("l5_xg_against", "?")
            a_xgf = a_venue.get("l5_xg_for", "?")
            a_xga = a_venue.get("l5_xg_against", "?")
            lines.append(
                f"xG: {home_name} {vl} xG(F:{h_xgf} A:{h_xga}) | {away_name} {al} xG(F:{a_xgf} A:{a_xga})"
            )

        elif sport == "basketball":
            # --- Offensive/Defensive Rating ---
            h_ortg = h_venue.get("l5_ortg", "?")
            h_drtg = h_venue.get("l5_drtg", "?")
            a_ortg = a_venue.get("l5_ortg", "?")
            a_drtg = a_venue.get("l5_drtg", "?")
            lines.append(
                f"Ratings: {home_name} {vl} RTG(O:{h_ortg} D:{h_drtg}) | {away_name} {al} RTG(O:{a_ortg} D:{a_drtg})"
            )

            # --- Pace (tempo) ---
            h_pace = h_venue.get("l5_pace", "?")
            a_pace = a_venue.get("l5_pace", "?")
            lines.append(f"Pace: {home_name} {vl} {h_pace} | {away_name} {al} {a_pace}")

            # --- Win rate & margin ---
            h_wr = h_venue.get("l5_win_rate", "?")
            a_wr = a_venue.get("l5_win_rate", "?")
            h_margin = h_venue.get("l5_avg_margin", "?")
            a_margin = a_venue.get("l5_avg_margin", "?")
            lines.append(
                f"Form: {home_name} HOME WR {h_wr}% (Margin:{h_margin}) | {away_name} AWAY WR {a_wr}% (Margin:{a_margin})"
            )

            # --- Fatigue ---
            h_rest = h_global.get("rest_days", "?")
            a_rest = a_global.get("rest_days", "?")
            h_b2b = h_global.get("is_b2b", "?")
            a_b2b = a_global.get("is_b2b", "?")
            lines.append(
                f"Fatigue: {home_name} Rest:{h_rest}d (B2B:{h_b2b}) | {away_name} Rest:{a_rest}d (B2B:{a_b2b})"
            )

        return "\n".join(lines)

    # ─────────────────────────────────────────────────────────────────────────
    # TEXTUAL FORMATTERS (The CAR Optimizers)
    # ─────────────────────────────────────────────────────────────────────────

    def _format_match(self, sport: str, data: Dict[str, Any], home_name: str = "?", away_name: str = "?", is_neutral: bool = False) -> str:
        dt = data.get("date_time", "Unknown Date")
        venue = data.get("venue") or "Unknown Venue"
        if sport == "tennis":
            rnd = data.get("round", "Unknown Round")
            return f"[MATCH: {home_name} vs {away_name}] {dt} | {rnd} | {data.get('status', 'scheduled')}"
        elif sport == "football":
            rnd = data.get("round", "Unknown Round")
            ref = data.get("referee_name", "N/A")
            if is_neutral:
                return f"[MATCH: {home_name} vs {away_name}] {dt} | {venue} (TERRAIN NEUTRE) | {rnd} | Ref: {ref}"
            return f"[MATCH: {home_name} (DOM) vs {away_name} (EXT)] {dt} | {venue} | {rnd} | Ref: {ref}"
        else:
            if is_neutral:
                return f"[MATCH: {home_name} vs {away_name}] {dt} | {venue} (TERRAIN NEUTRE) | {data.get('status', 'scheduled')}"
            return f"[MATCH: {home_name} (DOM) vs {away_name} (EXT)] {dt} | {venue} | {data.get('status', 'scheduled')}"

    def _format_team_form(self, sport: str, team_name: str, form_data: Dict[str, Any], injuries: List[Any], is_home: bool) -> str:
        label = "HOME" if is_home else "AWAY"
        lines = [f"[{label} TEAM: {team_name}]"]
        
        for pool in ["global", "home", "away"]:
            history = form_data.get(pool, [])
            if not history:
                continue
            
            lines.append(f"Form {pool.capitalize()} (Last 5):")
            for entry in history[:5]:
                d = entry.get("date", "Unknown")
                if sport == "football":
                    xf, xa, xd = entry.get("l5_xg_for", 0), entry.get("l5_xg_against", 0), entry.get("l5_xg_diff", 0)
                    gf, ga = entry.get("l5_goals_for", 0), entry.get("l5_goals_against", 0)
                    pts, ppm = entry.get("l5_points", 0), entry.get("l5_ppm", 0)
                    wr, btts, o25 = entry.get("l5_win_rate", 0), entry.get("l5_btts_rate", 0), entry.get("l5_over25_rate", 0)
                    poss, shot, cor, crd = entry.get("l5_possession_avg", 0), entry.get("l5_shots_avg", 0), entry.get("l5_corners_avg", 0), entry.get("l5_cards_avg", 0)
                    cs, pass_acc = entry.get("l5_clean_sheets", 0), entry.get("l5_pass_accuracy", 0)
                    stk = entry.get("l5_streak", "N/A")
                    lines.append(f"- {d} | Pts:{pts} (PPM:{ppm}) | xG(F:{xf}, A:{xa}, D:{xd}) | G(F:{gf}, A:{ga}) | WR:{wr}% | BTTS:{btts}% | O2.5:{o25}% | Poss:{poss}% | Shots:{shot} | Cor:{cor} | Crd:{crd} | CS:{cs} | Pass:{pass_acc}% | Stk:{stk}")
                elif sport == "basketball":
                    of, df, net = entry.get("l5_ortg", 0), entry.get("l5_drtg", 0), entry.get("l5_net_rtg", 0)
                    of10, df10, net10 = entry.get("l10_ortg", 0), entry.get("l10_drtg", 0), entry.get("l10_net_rtg", 0)
                    ofs, dfs = entry.get("season_ortg", 0), entry.get("season_drtg", 0)
                    pace, efg, tov, orb, ftr, p3 = entry.get("l5_pace", 0), entry.get("l5_efg_pct", 0), entry.get("l5_tov_pct", 0), entry.get("l5_orb_pct", 0), entry.get("l5_ftr", 0), entry.get("l5_3pt_pct", 0)
                    wr, margin = entry.get("l5_win_rate", 0), entry.get("l5_avg_margin", 0)
                    rest, b2b, g7 = entry.get("rest_days", "?"), entry.get("is_b2b", False), entry.get("games_in_7_days", 0)
                    stk = entry.get("l5_streak", "N/A")
                    lines.append(f"- {d} | L5_RTG(O:{of}, D:{df}, N:{net}) | L10_RTG(O:{of10}, D:{df10}, N:{net10}) | SEAS_RTG(O:{ofs}, D:{dfs}) | Pace:{pace} | WR:{wr}% | Marg:{margin} | eFG:{efg}% | TOV:{tov}% | ORB:{orb}% | FTR:{ftr} | 3P:{p3}% | Rest:{rest}d (B2B:{b2b}, G7:{g7}) | Stk:{stk}")
        
        lines.append(f"Injuries: {', '.join(injuries) if injuries else 'None'}")
        return "\n".join(lines)

    def _format_tennis_player(self, player_data: Dict[str, Any], rolling_data: Dict[str, Any], num: int) -> str:
        name = player_data.get("name", "Unknown")
        country = player_data.get("country", "Unknown")
        lines = [f"[PLAYER {num}: {name} ({country})]"]
        
        def v(val, suffix=""):
            """Format a value, replacing None with '-'."""
            return f"{val}{suffix}" if val is not None else "-"
        
        for pool in ["overall", "on_surface"]:
            history = rolling_data.get(pool, [])
            if not history:
                if pool == "on_surface": lines.append("Form Surface: [No data]")
                continue
            
            lines.append(f"Form {pool.capitalize()} (Last 5 snapshots):")
            for entry in history[:5]:
                d = entry.get("date", "Unknown")
                w5, w10, ws = entry.get("l5_win_pct"), entry.get("l10_win_pct"), entry.get("season_win_pct")
                fs, fsw = entry.get("l10_first_serve_pct"), entry.get("l10_first_serve_won")
                aces, rwon = entry.get("l10_aces_avg"), entry.get("l10_return_won_pct")
                bps, bpc = entry.get("l10_bp_saved_pct"), entry.get("l10_bp_converted_pct")
                rest = entry.get("days_since_last_match")
                fatigue = entry.get("fatigue_score", 0)
                s7, m7 = entry.get("sets_played_l7"), entry.get("minutes_played_l7")
                lines.append(
                    f"- {d} | WR(L5:{v(w5,'%')}, L10:{v(w10,'%')}, S:{v(ws,'%')}) | "
                    f"1stSrv:{v(fs,'%')} (Won {v(fsw,'%')}) | Aces:{v(aces)} | RetWon:{v(rwon,'%')} | "
                    f"BP(Save:{v(bps,'%')}, Conv:{v(bpc,'%')}) | Rest:{v(rest,'d')} | Fatig:{fatigue} | "
                    f"L7(Sets:{v(s7)}, Mins:{v(m7)})"
                )
        
        return "\n".join(lines)

    def _format_h2h(self, sport: str, data: Dict[str, Any], home_name: str = "Home", away_name: str = "Away", home_team_id: int = None) -> str:
        if not data or data.get("summary") == "No H2H found":
            return "[H2H]\nNo recent meetings found."
            
        if sport == "tennis":
            meetings = data.get("last_5_meetings", [])
            if not meetings:
                return "[H2H]\nNo individual meetings found."
            lines = ["[H2H] Last 5 meetings:"]
            for m in meetings:
                lines.append(f"- {m.get('date_time')} | Score: {m.get('score')} | Surface: {m.get('surface')}")
            return "\n".join(lines)
        else:
            # CRITICAL: Remap team_a/team_b to match actual Home/Away
            team_a_id = data.get("team_a_id")
            team_a_wins = data.get("team_a_wins", 0)
            team_b_wins = data.get("team_b_wins", 0)
            avg_goals_a = data.get("avg_goals_a", 0)
            avg_goals_b = data.get("avg_goals_b", 0)
            draws = data.get("draws", 0)
            l5_raw = data.get("last_5_results", [])
            
            # If team_a in the DB is the current AWAY team, swap everything
            if home_team_id is not None and team_a_id is not None and team_a_id != home_team_id:
                home_wins, away_wins = team_b_wins, team_a_wins
                avg_home, avg_away = avg_goals_b, avg_goals_a
                # Invert L/W in last_5 (they were from team_a's perspective)
                swap_map = {"W": "L", "L": "W", "D": "D"}
                l5 = ", ".join(swap_map.get(r, r) for r in l5_raw)
                perspective = home_name
            else:
                home_wins, away_wins = team_a_wins, team_b_wins
                avg_home, avg_away = avg_goals_a, avg_goals_b
                l5 = ", ".join(l5_raw)
                perspective = home_name
            
            return (f"[H2H: {home_name} vs {away_name}] Total: {data.get('total_matches', '?')} | "
                    f"Victoires {home_name}: {home_wins} | Nuls: {draws} | Victoires {away_name}: {away_wins}\n"
                    f"Score moyen: {avg_home} ({home_name}) - {avg_away} ({away_name}) | "
                    f"5 derniers (du point de vue de {perspective}): {l5}")

    def _format_odds(self, sport: str, odds_data: Optional[Dict[str, Any]], home_name: str = "Home", away_name: str = "Away") -> str:
        if not odds_data:
            return "[ODDS]\nNo data available."
            
        lines = ["[ODDS]"]
        # Rename generic market names
        market_renames = {
            "Home/Away": "Match Winner",
            "Home/Away (1st Set)": "Winner 1st Set",
        }
        for market, info in odds_data.items():
            raw_data = info.get("odds_data")
            if not raw_data: continue
            
            try:
                # Handle cases where odds_data is a string or a list
                if isinstance(raw_data, str):
                    selections = json.loads(raw_data)
                else:
                    selections = raw_data
                
                # Smart filtering: for high-volume markets (30+ selections),
                # keep only ~20 selections closest to the balanced odds (1.8-2.0)
                if len(selections) > 30:
                    selections = self._filter_relevant_selections(selections)
                
                # Format as "Label: Odd | Label: Odd"
                formatted_sel = []
                for s in selections:
                    label = s.get('label', '?')
                    # Replace generic Home/Away with actual team/player names
                    label = label.replace("Home", home_name).replace("Away", away_name)
                    formatted_sel.append(f"{label}: {s.get('odds')}")
                
                lines.append(f"{market_renames.get(market, market)}: {' | '.join(formatted_sel)}")
            except Exception:
                continue
        
        return "\n".join(lines)
    
    @staticmethod
    def _filter_relevant_selections(selections: list, keep: int = 20) -> list:
        """Filter high-volume markets to keep only the most relevant selections.
        
        Keeps selections closest to balanced odds (around 1.8-2.0),
        which represent the most likely outcomes for the AI to analyze.
        """
        # Sort by distance from the "balanced" odds point (1.9)
        def relevance(s):
            try:
                return abs(float(s.get('odds', 99)) - 1.9)
            except (ValueError, TypeError):
                return 999
        
        sorted_sels = sorted(selections, key=relevance)
        kept = sorted_sels[:keep]
        
        # Re-sort by label to maintain logical order (e.g., Over 220 before Over 225)
        def label_sort_key(s):
            label = s.get('label', '')
            # Extract numeric value from label for ordering
            import re
            nums = re.findall(r'[\d.]+', label)
            return (label.split()[0] if label else '', float(nums[0]) if nums else 0)
        
        return sorted(kept, key=label_sort_key)

    def _format_elo(self, sport: str, elo_raw: Optional[Dict[str, Any]]) -> str:
        if not elo_raw: return "[ELO]\nNo data available."
        
        h_history = elo_raw.get("home", [])
        a_history = elo_raw.get("away", [])
        
        h_curr = h_history[0].get("elo_rating", "?") if h_history else "?"
        h_trend = h_history[0].get("elo_change_1m", 0) if h_history else 0
        
        a_curr = a_history[0].get("elo_rating", "?") if a_history else "?"
        a_trend = a_history[0].get("elo_change_1m", 0) if a_history else 0
        
        return f"[ELO]\nHome: {h_curr} (Trend: {h_trend} 1M)\nAway: {a_curr} (Trend: {a_trend} 1M)"

    # =========================================================================
    # TEAM SPORT FETCHERS (Football / Basketball)
    # =========================================================================

    async def fetch_match_details(self, sport: str, match_id: int) -> Dict[str, Any]:
        table = f"{sport}_matches"
        columns = "date_time,venue,status,league_id"
        if sport == 'football':
            columns += ",round,referee_name,weather"
        
        rows = self.db.select(table, columns, {"id": match_id})
        if not rows:
            return {}
        return rows[0]

    async def fetch_team_details(self, sport: str, match_id: int) -> Dict[str, Any]:
        table = f"{sport}_matches"
        columns = "home_team:teams!home_team_id(id,name),away_team:teams!away_team_id(id,name)"
        
        rows = self.db.select(table, columns, {"id": match_id})
        if not rows:
            return {}
            
        data = rows[0]
        return {
            "home": data.get("home_team", {}),
            "away": data.get("away_team", {})
        }

    async def fetch_h2h(self, sport: str, match_id: int) -> Dict[str, Any]:
        match_table = f"{sport}_matches"
        rows = self.db.select(match_table, "home_team_id,away_team_id", {"id": match_id})
        if not rows:
            return {}
        
        h1, a1 = rows[0]["home_team_id"], rows[0]["away_team_id"]
        h2h_table = f"{sport}_h2h"

        res = self.db.select(h2h_table, "*", {"team_a_id": h1, "team_b_id": a1})
        if not res:
            res = self.db.select(h2h_table, "*", {"team_a_id": a1, "team_b_id": h1})

        if not res:
            return {"summary": "No H2H found"}
        # Inject home/away IDs so the frontend can map A/B → Home/Away
        result = res[0]
        result["home_team_id"] = h1
        result["away_team_id"] = a1
        return result

    async def fetch_rolling_stats(self, sport: str, match_id: int) -> Dict[str, Any]:
        match_table = f"{sport}_matches"
        m_rows = self.db.select(match_table, "date_time,home_team_id,away_team_id", {"id": match_id})
        if not m_rows:
            return {}
            
        m = m_rows[0]
        match_date = m['date_time']
        rolling_table = f"{sport}_team_rolling"
        
        def get_team_rolling_history(team_id, venue_filter, count=5):
            filters = {
                "team_id": team_id, 
                "date": ("lte", match_date),
                "venue": venue_filter
            }
            rows = self.db.select(
                rolling_table, "*", 
                filters=filters, limit=count, order="date.desc"
            )
            return rows

        home_stats = {
            "global": get_team_rolling_history(m['home_team_id'], "all"),
            "home": get_team_rolling_history(m['home_team_id'], "home"),
            "away": get_team_rolling_history(m['home_team_id'], "away")
        }

        away_stats = {
            "global": get_team_rolling_history(m['away_team_id'], "all"),
            "home": get_team_rolling_history(m['away_team_id'], "home"),
            "away": get_team_rolling_history(m['away_team_id'], "away")
        }
        
        return {"home": home_stats, "away": away_stats}

    async def fetch_odds(self, sport: str, match_id: int) -> Optional[Dict[str, Any]]:
        rows = self.db.select_raw(
            "odds_snapshots",
            f"match_id=eq.{match_id}"
            f"&sport=eq.{sport}"
            f"&select=market_name,bookmaker,snapshot_at,odds_data"
            f"&order=snapshot_at.desc"
        )
        
        if not rows:
            return None
        
        latest_by_market = {}
        for row in rows:
            mk = row["market_name"]
            if mk not in latest_by_market:
                latest_by_market[mk] = {
                    "bookmaker": row["bookmaker"],
                    "snapshot_at": row["snapshot_at"],
                    "odds_data": row["odds_data"]
                }
        return latest_by_market

    async def fetch_elo(self, sport: str, match_id: int) -> Optional[Dict[str, Any]]:
        match_table = f"{sport}_matches"
        m_rows = self.db.select(match_table, "date_time,home_team_id,away_team_id", {"id": match_id})
        if not m_rows:
            return None
            
        m = m_rows[0]
        match_date = m['date_time']
        elo_table = f"{sport}_team_elo"
        
        def get_team_elo_history(team_id, count=5):
            rows = self.db.select(
                elo_table, "*", 
                filters={"team_id": team_id, "date": ("lte", match_date)}, 
                limit=count, order="date.desc"
            )
            return rows

        home_elo = get_team_elo_history(m['home_team_id'])
        away_elo = get_team_elo_history(m['away_team_id'])
        
        if not home_elo and not away_elo:
            return None
        return {"home": home_elo, "away": away_elo}

    async def fetch_injuries(self, sport: str, match_id: int) -> Dict[str, List[Any]]:
        return {"home": [], "away": []}

    # =========================================================================
    # TENNIS FETCHERS
    # =========================================================================

    async def fetch_tennis_match_details(self, match_id: int) -> Dict[str, Any]:
        """Fetch match info: surface, indoor/outdoor, round, date, sets."""
        rows = self.db.select(
            "tennis_matches",
            "date_time,surface,indoor_outdoor,round,status,sets_played,score",
            {"id": match_id}
        )
        if not rows:
            return {}
        return rows[0]

    async def fetch_tennis_players(self, match_id: int) -> Dict[str, Any]:
        """Fetch player details for both participants via PostgREST JOIN."""
        rows = self.db.select(
            "tennis_matches",
            "player1:players!player1_id(id,name,country),player2:players!player2_id(id,name,country)",
            {"id": match_id}
        )
        if not rows:
            return {}
        
        data = rows[0]
        return {
            "player1": data.get("player1", {}),
            "player2": data.get("player2", {})
        }

    async def fetch_tennis_h2h(self, match_id: int) -> Dict[str, Any]:
        """Fetch H2H summary + last 5 meetings between the two players."""
        rows = self.db.select("tennis_matches", "player1_id,player2_id,date_time", {"id": match_id})
        if not rows:
            return {}
        
        p1 = rows[0]["player1_id"]
        p2 = rows[0]["player2_id"]
        match_date = rows[0]["date_time"]
        
        res = self.db.select("tennis_h2h", "*", {"player_a_id": p1, "player_b_id": p2})
        if not res:
            res = self.db.select("tennis_h2h", "*", {"player_a_id": p2, "player_b_id": p1})
        
        summary = res[0] if res else {}
        
        clean_date = match_date.replace("+00:00", "Z").replace("+01:00", "Z").replace("+02:00", "Z")
        try:
            meetings = self.db.select_raw(
                "tennis_matches",
                f"select=date_time,player1_id,player2_id,winner_id,score,surface,sets_played"
                f"&status=eq.finished"
                f"&date_time=lt.{clean_date}"
                f"&or=(and(player1_id.eq.{p1},player2_id.eq.{p2}),and(player1_id.eq.{p2},player2_id.eq.{p1}))"
                f"&order=date_time.desc"
                f"&limit=5"
            )
        except Exception as e:
            logger.warning(f"Could not fetch H2H meetings: {e}")
            meetings = []
        
        return {
            "summary": summary,
            "last_5_meetings": meetings,
            # IDs so the frontend can map player_a/b → home/away
            "home_player_id": p1,
            "away_player_id": p2,
        }

    async def fetch_tennis_rolling(self, match_id: int) -> Dict[str, Any]:
        """Fetch rolling stats for both players, filtered by surface and date."""
        m_rows = self.db.select(
            "tennis_matches", 
            "date_time,player1_id,player2_id,surface", 
            {"id": match_id}
        )
        if not m_rows:
            return {}
            
        m = m_rows[0]
        match_date = m["date_time"]
        surface = m.get("surface", "hard")

        def get_player_rolling(player_id, surf, count=5):
            """Get the latest rolling snapshots for a player on a given surface."""
            filters = {
                "player_id": player_id,
                "date": ("lte", match_date),
                "surface": surf
            }
            rows = self.db.select(
                "tennis_player_rolling", "*",
                filters=filters, limit=count, order="date.desc"
            )
            return rows

        p1_rolling = {
            "on_surface": get_player_rolling(m["player1_id"], surface),
            "overall": get_player_rolling(m["player1_id"], "all") if surface != "all" else []
        }
        
        p2_rolling = {
            "on_surface": get_player_rolling(m["player2_id"], surface),
            "overall": get_player_rolling(m["player2_id"], "all") if surface != "all" else []
        }

        return {
            "player1": p1_rolling,
            "player2": p2_rolling
        }


# Singleton instance
_aggregator = DataAggregator()

async def get_match_context(sport: str, match_id: int) -> str:
    """Returns the TEXT report (IA Ready)."""
    return await _aggregator.get_match_context(sport, match_id)

async def get_match_raw_context(sport: str, match_id: int) -> Dict[str, Any]:
    """Returns the RAW data dictionary (Archiving Ready)."""
    return await _aggregator.get_match_raw_context(sport, match_id)

def format_context(sport: str, raw_context: Dict[str, Any]) -> str:
    """Formats raw data into a text report."""
    return _aggregator.format_context(sport, raw_context)


if __name__ == "__main__":
    import argparse
    import json
    import asyncio

    parser = argparse.ArgumentParser(description="Test the BETIX data aggregator (CAR Format)")
    parser.add_argument("sport", nargs="?", choices=["football", "basketball", "tennis"],
                        help="Sport to test")
    parser.add_argument("match_id", nargs="?", type=int, help="Internal match ID")
    args = parser.parse_args()

    async def run_single(sport: str, match_id: int):
        """Aggregates and prints the full TEXT context for a given match."""
        print(f"\n🎯 Aggregating TEXT context (AI-Ready) for {sport} #{match_id}...\n")
        ctx = await get_match_context(sport, match_id)
        print(ctx)

    async def main():
        if args.sport and args.match_id:
            await run_single(args.sport, args.match_id)
        else:
            parser.print_help()

    asyncio.run(main())
