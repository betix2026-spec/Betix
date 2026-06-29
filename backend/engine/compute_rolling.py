"""
BETIX — compute_rolling.py
Calcule les statistiques rolling L5 pour chaque équipe, à chaque date de match.
0 appel API — tout est calculé depuis les données en base.

Usage :
    python compute_rolling.py                  # Calcul complet
    python compute_rolling.py --football-only  # Football uniquement
    python compute_rolling.py --basketball-only
    python compute_rolling.py --dry-run        # Preview sans écriture
"""

import argparse
import logging
import time
from collections import defaultdict
from statistics import mean

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST

logger = logging.getLogger("betix.compute_rolling")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")

WINDOW = 5  # L5


# =============================================================================
# HELPERS
# =============================================================================

def paginated_fetch(db, table, query_base):
    """Récupère toutes les lignes d'une table avec pagination."""
    all_rows = []
    offset = 0
    while True:
        sep = "&" if "?" not in query_base else "&"
        query = f"{query_base}&limit=1000&offset={offset}"
        rows = db.select_raw(table, query)
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < 1000:
            break
        offset += 1000
    return all_rows


def compute_streak(results: list[str]) -> str:
    """Calcule la série en cours depuis le dernier match. Ex: ['W','D','L','W','W'] → '2W'"""
    if not results:
        return ""
    current = results[-1]
    count = 0
    for r in reversed(results):
        if r == current:
            count += 1
        else:
            break
    return f"{count}{current}"


def safe_mean(values: list, default=None):
    """Moyenne en ignorant les None."""
    clean = [v for v in values if v is not None]
    if not clean:
        return default
    return round(mean(clean), 1)


def safe_pct(num_true: int, total: int):
    """Pourcentage arrondi."""
    if total == 0:
        return None
    return round(num_true / total * 100, 1)


# =============================================================================
# FOOTBALL ROLLING
# =============================================================================

def compute_football_rolling(db, dry_run=False):
    logger.info("=" * 60)
    logger.info("  FOOTBALL — Calcul Rolling L5 (historique complet)")
    logger.info("=" * 60)

    # 1. Charger toutes les données
    logger.info("  📦 Chargement des matchs...")
    matches = paginated_fetch(db, "football_matches",
        "select=api_id,date_time,home_team_id,away_team_id,home_score,away_score,status&status=eq.finished&order=date_time.asc")
    logger.info(f"     {len(matches)} matchs chargés")

    logger.info("  📦 Chargement des stats...")
    stats_rows = paginated_fetch(db, "football_match_stats",
        "select=match_id,team_id,possession_pct,shots_on_goal,shots_total,passes_total,passes_accurate,corners,yellow_cards,red_cards,expected_goals,fouls")
    logger.info(f"     {len(stats_rows)} lignes de stats chargées")

    # 2. Indexer les stats par (match_api_id, team_id)
    stats_index = {}
    for s in stats_rows:
        stats_index[(s["match_id"], s["team_id"])] = s

    # 3. Construire la timeline par équipe
    team_matches = defaultdict(list)
    for m in matches:
        if m["home_score"] is None or m["away_score"] is None:
            continue
        home_id = m["home_team_id"]
        away_id = m["away_team_id"]

        record = {
            "api_id": m["api_id"],
            "date": m["date_time"][:10],  # YYYY-MM-DD
            "home_team_id": home_id,
            "away_team_id": away_id,
            "home_score": m["home_score"],
            "away_score": m["away_score"],
        }
        team_matches[home_id].append(record)
        team_matches[away_id].append(record)

    logger.info(f"  📊 {len(team_matches)} équipes à traiter")

    # 4. Calculer le rolling pour chaque équipe
    rows_to_insert = []

    for team_id, all_matches in team_matches.items():
        # Trier par date
        all_matches.sort(key=lambda x: x["date"])

        # Séparer par venue
        home_matches = [m for m in all_matches if m["home_team_id"] == team_id]
        away_matches = [m for m in all_matches if m["away_team_id"] == team_id]

        # Calculer rolling pour chaque venue
        for venue_label, venue_matches in [("all", all_matches), ("home", home_matches), ("away", away_matches)]:
            for i in range(WINDOW, len(venue_matches) + 1):
                window = venue_matches[i - WINDOW : i]
                current_match = venue_matches[i - 1]
                match_date = current_match["date"]

                results = []
                goals_for_list = []
                goals_against_list = []
                clean_sheets = 0
                btts_count = 0
                over25_count = 0

                xg_for_list = []
                xg_against_list = []
                possession_list = []
                pass_acc_list = []
                shots_list = []
                shots_target_list = []
                corners_list = []
                cards_list = []

                for m in window:
                    is_home = m["home_team_id"] == team_id
                    gf = m["home_score"] if is_home else m["away_score"]
                    ga = m["away_score"] if is_home else m["home_score"]
                    opp_id = m["away_team_id"] if is_home else m["home_team_id"]

                    goals_for_list.append(gf)
                    goals_against_list.append(ga)

                    if gf > ga:
                        results.append("W")
                    elif gf == ga:
                        results.append("D")
                    else:
                        results.append("L")

                    if ga == 0:
                        clean_sheets += 1
                    if gf > 0 and ga > 0:
                        btts_count += 1
                    if gf + ga >= 3:
                        over25_count += 1

                    # Stats du match
                    st = stats_index.get((m["api_id"], team_id))
                    st_opp = stats_index.get((m["api_id"], opp_id))

                    if st:
                        possession_list.append(st.get("possession_pct"))
                        shots_list.append(st.get("shots_total"))
                        shots_target_list.append(st.get("shots_on_goal"))
                        corners_list.append(st.get("corners"))
                        yc = st.get("yellow_cards") or 0
                        rc = st.get("red_cards") or 0
                        cards_list.append(yc + rc)
                        xg_for_list.append(st.get("expected_goals"))

                        if st.get("passes_total") and st["passes_total"] > 0:
                            acc = (st.get("passes_accurate") or 0) / st["passes_total"] * 100
                            pass_acc_list.append(round(acc, 1))

                    if st_opp:
                        xg_against_list.append(st_opp.get("expected_goals"))

                # Points
                points = sum(3 if r == "W" else 1 if r == "D" else 0 for r in results)

                # xG diff (positif = sous-performance, négatif = surperformance)
                avg_xg = safe_mean(xg_for_list)
                avg_gf = safe_mean(goals_for_list)
                xg_diff = None
                if avg_xg is not None and avg_gf is not None:
                    xg_diff = round(avg_xg - avg_gf, 2)

                row = {
                    "team_id": team_id,
                    "date": match_date,
                    "venue": venue_label,
                    "l5_points": points,
                    "l5_ppm": round(points / WINDOW, 2),
                    "l5_goals_for": safe_mean(goals_for_list),
                    "l5_goals_against": safe_mean(goals_against_list),
                    "l5_clean_sheets": clean_sheets,
                    "l5_xg_for": safe_mean(xg_for_list),
                    "l5_xg_against": safe_mean(xg_against_list),
                    "l5_possession_avg": safe_mean(possession_list),
                    "l5_pass_accuracy": safe_mean(pass_acc_list),
                    "l5_shots_avg": safe_mean(shots_list),
                    # Smart fields
                    "l5_form": results,
                    "l5_streak": compute_streak(results),
                    "l5_win_rate": safe_pct(results.count("W"), len(results)),
                    "l5_btts_rate": safe_pct(btts_count, WINDOW),
                    "l5_over25_rate": safe_pct(over25_count, WINDOW),
                    "l5_corners_avg": safe_mean(corners_list),
                    "l5_cards_avg": safe_mean(cards_list),
                    "l5_xg_diff": xg_diff,
                }
                rows_to_insert.append(row)

    seen = {}
    for row in rows_to_insert:
        key = (row["team_id"], row["date"], row["venue"])
        seen[key] = row
    rows_to_insert = list(seen.values())

    logger.info(f"  📝 {len(rows_to_insert)} lignes rolling à insérer")

    if not dry_run and rows_to_insert:
        # Insérer par batch de 500
        for i in range(0, len(rows_to_insert), 500):
            batch = rows_to_insert[i:i + 500]
            db.upsert("football_team_rolling", batch, on_conflict="team_id,date,venue")
            if (i + 500) % 2000 == 0:
                logger.info(f"     Progress: {min(i + 500, len(rows_to_insert))}/{len(rows_to_insert)}")
        logger.info(f"  ✅ {len(rows_to_insert)} lignes insérées")
    elif dry_run:
        logger.info(f"  [DRY RUN] {len(rows_to_insert)} lignes auraient été insérées")

    return len(rows_to_insert)


# =============================================================================
# BASKETBALL ROLLING
# =============================================================================

def compute_basketball_rolling(db, dry_run=False):
    logger.info("=" * 60)
    logger.info("  BASKETBALL — Calcul Rolling L5 (historique complet)")
    logger.info("=" * 60)

    # 1. Charger les données
    logger.info("  📦 Chargement des matchs...")
    matches = paginated_fetch(db, "basketball_matches",
        "select=api_id,date_time,home_team_id,away_team_id,home_score,away_score,status&status=eq.finished&order=date_time.asc")
    logger.info(f"     {len(matches)} matchs chargés")

    logger.info("  📦 Chargement des stats...")
    stats_rows = paginated_fetch(db, "basketball_match_stats",
        "select=match_id,team_id,ortg,drtg,possessions,efg_pct,tov_pct,orb_pct,ftr,tpm,tpa")
    logger.info(f"     {len(stats_rows)} lignes de stats chargées")

    stats_index = {}
    for s in stats_rows:
        stats_index[(s["match_id"], s["team_id"])] = s

    # 2. Timeline par équipe
    team_matches = defaultdict(list)
    for m in matches:
        if m["home_score"] is None or m["away_score"] is None:
            continue
        record = {
            "api_id": m["api_id"],
            "date": m["date_time"][:10],
            "date_time": m["date_time"],
            "home_team_id": m["home_team_id"],
            "away_team_id": m["away_team_id"],
            "home_score": m["home_score"],
            "away_score": m["away_score"],
        }
        team_matches[m["home_team_id"]].append(record)
        team_matches[m["away_team_id"]].append(record)

    logger.info(f"  📊 {len(team_matches)} équipes à traiter")

    rows_to_insert = []

    for team_id, all_matches in team_matches.items():
        all_matches.sort(key=lambda x: x["date_time"])

        home_matches = [m for m in all_matches if m["home_team_id"] == team_id]
        away_matches = [m for m in all_matches if m["away_team_id"] == team_id]

        for venue_label, venue_matches in [("all", all_matches), ("home", home_matches), ("away", away_matches)]:
            for i in range(WINDOW, len(venue_matches) + 1):
                window_5 = venue_matches[i - WINDOW : i]
                window_10 = venue_matches[max(0, i - 10) : i] if i >= 10 else None
                current_match = venue_matches[i - 1]
                match_date = current_match["date"]

                # ---- L5 ----
                results = []
                margins = []
                ortg_list = []
                drtg_list = []
                pace_list = []
                efg_list = []
                tov_list = []
                orb_list = []
                ftr_list = []
                three_pct_list = []

                for m in window_5:
                    is_home = m["home_team_id"] == team_id
                    score_team = m["home_score"] if is_home else m["away_score"]
                    score_opp = m["away_score"] if is_home else m["home_score"]

                    margins.append(score_team - score_opp)

                    if score_team > score_opp:
                        results.append("W")
                    else:
                        results.append("L")

                    st = stats_index.get((m["api_id"], team_id))
                    if st:
                        ortg_list.append(st.get("ortg"))
                        drtg_list.append(st.get("drtg"))
                        pace_list.append(st.get("possessions"))
                        efg_list.append(st.get("efg_pct"))
                        tov_list.append(st.get("tov_pct"))
                        orb_list.append(st.get("orb_pct"))
                        ftr_list.append(st.get("ftr"))

                        tpm = st.get("tpm")
                        tpa = st.get("tpa")
                        if tpm is not None and tpa and tpa > 0:
                            three_pct_list.append(round(tpm / tpa * 100, 1))

                # ---- L10 ----
                l10_ortg_val = None
                l10_drtg_val = None
                l10_net_rtg_val = None

                if window_10:
                    l10_ortg_list = []
                    l10_drtg_list = []
                    for m in window_10:
                        st = stats_index.get((m["api_id"], team_id))
                        if st:
                            l10_ortg_list.append(st.get("ortg"))
                            l10_drtg_list.append(st.get("drtg"))
                    l10_ortg_val = safe_mean(l10_ortg_list)
                    l10_drtg_val = safe_mean(l10_drtg_list)
                    if l10_ortg_val and l10_drtg_val:
                        l10_net_rtg_val = round(l10_ortg_val - l10_drtg_val, 1)

                # Fatigue (calculé sur la timeline globale "all", pas la fenêtre venue)
                rest_days = None
                is_b2b = False
                games_in_7_days = 0

                if venue_label == "all":
                    idx_in_all = all_matches.index(current_match)
                    if idx_in_all > 0:
                        from datetime import datetime
                        prev_dt = datetime.fromisoformat(all_matches[idx_in_all - 1]["date_time"].replace("Z", "+00:00"))
                        curr_dt = datetime.fromisoformat(current_match["date_time"].replace("Z", "+00:00"))
                        rest_days = (curr_dt - prev_dt).days
                        is_b2b = rest_days <= 1

                    # Games in last 7 days
                    curr_dt = datetime.fromisoformat(current_match["date_time"].replace("Z", "+00:00"))
                    for m in all_matches[:idx_in_all]:
                        m_dt = datetime.fromisoformat(m["date_time"].replace("Z", "+00:00"))
                        if (curr_dt - m_dt).days <= 7:
                            games_in_7_days += 1

                l5_ortg = safe_mean(ortg_list)
                l5_drtg = safe_mean(drtg_list)

                # ---- SEASON (tous les matchs joués jusqu'ici) ----
                season_ortg_list = []
                season_drtg_list = []
                for m in venue_matches[:i]:  # Tous les matchs depuis le début
                    st = stats_index.get((m["api_id"], team_id))
                    if st:
                        season_ortg_list.append(st.get("ortg"))
                        season_drtg_list.append(st.get("drtg"))
                season_ortg_val = safe_mean(season_ortg_list)
                season_drtg_val = safe_mean(season_drtg_list)

                row = {
                    "team_id": team_id,
                    "date": match_date,
                    "venue": venue_label,
                    # Core L5
                    "l5_ortg": l5_ortg,
                    "l5_drtg": l5_drtg,
                    "l5_net_rtg": round(l5_ortg - l5_drtg, 1) if l5_ortg and l5_drtg else None,
                    "l5_pace": safe_mean(pace_list),
                    "l5_efg_pct": safe_mean(efg_list),
                    # L10
                    "l10_ortg": l10_ortg_val,
                    "l10_drtg": l10_drtg_val,
                    "l10_net_rtg": l10_net_rtg_val,
                    # Season
                    "season_ortg": season_ortg_val,
                    "season_drtg": season_drtg_val,
                    # Fatigue
                    "rest_days": rest_days,
                    "is_b2b": is_b2b,
                    "games_in_7_days": games_in_7_days,
                    # Smart fields
                    "l5_form": results,
                    "l5_streak": compute_streak(results),
                    "l5_win_rate": safe_pct(results.count("W"), len(results)),
                    "l5_avg_margin": safe_mean(margins),
                    "l5_tov_pct": safe_mean(tov_list),
                    "l5_orb_pct": safe_mean(orb_list),
                    "l5_ftr": safe_mean(ftr_list),
                    "l5_3pt_pct": safe_mean(three_pct_list),
                }
                rows_to_insert.append(row)

    # Dédupliquer : si 2 matchs le même jour, garder le dernier (le plus récent)
    deduped = {}
    for row in rows_to_insert:
        key = (row["team_id"], row["date"], row["venue"])
        deduped[key] = row  # Le dernier écrase le précédent
    rows_to_insert = list(deduped.values())

    logger.info(f"  📝 {len(rows_to_insert)} lignes rolling à insérer (après dédup)")

    if not dry_run and rows_to_insert:
        for i in range(0, len(rows_to_insert), 500):
            batch = rows_to_insert[i:i + 500]
            db.upsert("basketball_team_rolling", batch, on_conflict="team_id,date,venue")
            if (i + 500) % 2000 == 0:
                logger.info(f"     Progress: {min(i + 500, len(rows_to_insert))}/{len(rows_to_insert)}")
        logger.info(f"  ✅ {len(rows_to_insert)} lignes insérées")
    elif dry_run:
        logger.info(f"  [DRY RUN] {len(rows_to_insert)} lignes auraient été insérées")

    return len(rows_to_insert)


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="BETIX — Compute Rolling Stats L5")
    parser.add_argument("--football-only", action="store_true")
    parser.add_argument("--basketball-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")

    t0 = time.time()
    total = 0

    if not args.basketball_only:
        total += compute_football_rolling(db, dry_run=args.dry_run)

    if not args.football_only:
        total += compute_basketball_rolling(db, dry_run=args.dry_run)

    elapsed = time.time() - t0
    logger.info(f"\n🏁 Terminé — {total} lignes rolling calculées en {elapsed:.1f}s")


if __name__ == "__main__":
    main()
