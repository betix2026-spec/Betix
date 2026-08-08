-- ============================================================
-- BETIX — Initial Migration Script (Supabase / PostgreSQL)
-- Date: 2025-02-12
-- Description: Creates the public.* (App) and analytics.*
--               (AI Engine) schemas with indexes, constraints and triggers.
-- ============================================================

-- ============================================================
-- PART 0: EXTENSIONS & ANALYTICS SCHEMA
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS analytics;

-- ============================================================
-- PART 1: APP SCHEMA (public.*)
-- UI-driven tables for the frontend application
-- ============================================================

-- ----------------------------------------------------------
-- 1.1 Module Utilisateurs & Auth
-- ----------------------------------------------------------

CREATE TABLE public.profiles (
    id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username        text UNIQUE NOT NULL,
    avatar_url      text,
    role            text NOT NULL DEFAULT 'user'
                        CHECK (role IN ('user', 'admin', 'super_admin')),
    onboarding_completed boolean NOT NULL DEFAULT false,
    betting_style   text CHECK (betting_style IN ('casual', 'regular', 'analytical')),
    favorite_sports text[] DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz  -- Soft Delete (RGPD)
);

CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_deleted ON public.profiles(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE public.user_settings (
    user_id            uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    theme              text NOT NULL DEFAULT 'system'
                           CHECK (theme IN ('light', 'dark', 'system')),
    notifications_push boolean NOT NULL DEFAULT true,
    newsletter_opt_in  boolean NOT NULL DEFAULT false
);

-- ----------------------------------------------------------
-- 1.2 Module Gamification & Stats
-- ----------------------------------------------------------

CREATE TABLE public.user_stats (
    user_id        uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    level          int NOT NULL DEFAULT 1,
    xp_current     int NOT NULL DEFAULT 0,
    xp_next        int NOT NULL DEFAULT 100,
    total_bets     int NOT NULL DEFAULT 0,
    win_rate       real NOT NULL DEFAULT 0.0,
    roi            real NOT NULL DEFAULT 0.0,
    current_streak int NOT NULL DEFAULT 0,
    total_profit   decimal(12,2) NOT NULL DEFAULT 0.00
);

CREATE TABLE public.badges (
    id          text PRIMARY KEY,  -- slug ex: 'sharpshooter'
    name        text NOT NULL,
    description text NOT NULL,
    icon_ref    text NOT NULL,     -- Lucide icon name
    rarity      text NOT NULL DEFAULT 'common'
                    CHECK (rarity IN ('common', 'rare', 'epic', 'legendary'))
);

CREATE TABLE public.user_badges (
    user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    badge_id    text REFERENCES public.badges(id) ON DELETE CASCADE,
    unlocked_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, badge_id)
);

-- ----------------------------------------------------------
-- 1.3 Betting Engine Module (Simplified)
-- ----------------------------------------------------------

CREATE TABLE public.matches (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_sport_id    text,
    sport           text NOT NULL CHECK (sport IN ('football', 'basketball', 'tennis')),
    league_name     text NOT NULL,
    home_team       jsonb NOT NULL,   -- {"name", "logo", "code"}
    away_team       jsonb NOT NULL,
    date_time       timestamptz NOT NULL,
    status          text NOT NULL DEFAULT 'upcoming'
                        CHECK (status IN ('upcoming', 'live', 'finished')),
    score           jsonb,            -- {"home": 2, "away": 1, "mtime": "90'"}
    tournament_meta jsonb             -- {"group", "round", "neutral_ground"}
);

CREATE INDEX idx_matches_sport ON public.matches(sport);
CREATE INDEX idx_matches_status ON public.matches(status);
CREATE INDEX idx_matches_datetime ON public.matches(date_time DESC);
CREATE INDEX idx_matches_api_id ON public.matches(api_sport_id);

CREATE TABLE public.predictions (
    id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id            uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    type                text NOT NULL CHECK (type IN ('safe', 'value', 'risky')),
    confidence          int NOT NULL CHECK (confidence BETWEEN 0 AND 100),
    outcome             text NOT NULL,
    odds                real,
    analysis_short      text,
    analysis_full       text,
    generation_snapshot jsonb,        -- Integrity proof
    is_locked           boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_predictions_match ON public.predictions(match_id);
CREATE INDEX idx_predictions_type ON public.predictions(type);

-- ----------------------------------------------------------
-- 1.4 Module Abonnements
-- ----------------------------------------------------------

CREATE TABLE public.plans (
    id              text PRIMARY KEY,  -- 'free', 'premium_monthly', 'premium_annual'
    name            text NOT NULL,
    price           decimal(8,2) NOT NULL DEFAULT 0.00,
    stripe_price_id text,
    features        jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE public.subscriptions (
    user_id                uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan_id                text NOT NULL REFERENCES public.plans(id),
    status                 text NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'past_due', 'canceled')),
    current_period_end     timestamptz,
    source                 text NOT NULL DEFAULT 'stripe'
                               CHECK (source IN ('stripe', 'manual_gift')),
    stripe_subscription_id text
);

-- ----------------------------------------------------------
-- 1.5 Module Admin & Logs
-- ----------------------------------------------------------

CREATE TABLE public.system_logs (
    id         bigserial PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    level      text NOT NULL CHECK (level IN ('info', 'warning', 'error', 'critical')),
    source     text NOT NULL,  -- 'api-sports', 'stripe', 'ai-engine'
    message    text NOT NULL
);

CREATE INDEX idx_logs_level ON public.system_logs(level);
CREATE INDEX idx_logs_created ON public.system_logs(created_at DESC);

CREATE TABLE public.app_config (
    key         text PRIMARY KEY,
    value       jsonb NOT NULL,
    description text
);


-- ============================================================
-- PART 2: ANALYTICS SCHEMA (analytics.*)
-- Tables for the AI Prediction Engine
-- ============================================================

-- ----------------------------------------------------------
-- 2.1 Shared Tables (Cross-Sport)
-- ----------------------------------------------------------

CREATE TABLE analytics.leagues (
    id           serial PRIMARY KEY,
    api_id       int NOT NULL,
    sport        text NOT NULL CHECK (sport IN ('football', 'basketball', 'tennis')),
    name         text NOT NULL,
    country      text,
    tier         text NOT NULL DEFAULT 'major'
                     CHECK (tier IN ('major', 'minor', 'challenger')),
    season_start date,
    season_end   date,
    UNIQUE (api_id, sport)
);

CREATE INDEX idx_leagues_sport ON analytics.leagues(sport);

CREATE TABLE analytics.teams (
    id           serial PRIMARY KEY,
    api_id       int NOT NULL,
    sport        text NOT NULL CHECK (sport IN ('football', 'basketball')),
    name         text NOT NULL,
    short_name   text,
    logo_url     text,
    league_id    int REFERENCES analytics.leagues(id),
    stadium_city text,
    stadium_lat  decimal(9,6),
    stadium_lon  decimal(9,6),
    UNIQUE (api_id, sport)
);

CREATE INDEX idx_teams_sport ON analytics.teams(sport);
CREATE INDEX idx_teams_league ON analytics.teams(league_id);

CREATE TABLE analytics.players (
    id       serial PRIMARY KEY,
    api_id   int NOT NULL,
    sport    text NOT NULL CHECK (sport IN ('football', 'basketball', 'tennis')),
    name     text NOT NULL,
    team_id  int REFERENCES analytics.teams(id),  -- NULL for Tennis
    position text,
    UNIQUE (api_id, sport)
);

CREATE INDEX idx_players_sport ON analytics.players(sport);
CREATE INDEX idx_players_team ON analytics.players(team_id);

CREATE TABLE analytics.odds_snapshots (
    id              bigserial PRIMARY KEY,
    match_id        int NOT NULL,      -- Logical FK to the sport's match table
    sport           text NOT NULL CHECK (sport IN ('football', 'basketball', 'tennis')),
    bookmaker       text NOT NULL,
    snapshot_at     timestamptz NOT NULL DEFAULT now(),
    home_win        decimal(5,2),
    draw            decimal(5,2),      -- NULL for Tennis/Basketball
    away_win        decimal(5,2),
    over_under_line decimal(5,1),
    over_odds       decimal(5,2),
    under_odds      decimal(5,2)
);

CREATE INDEX idx_odds_sport_match ON analytics.odds_snapshots(sport, match_id);
CREATE INDEX idx_odds_snapshot_time ON analytics.odds_snapshots(snapshot_at DESC);


-- ----------------------------------------------------------
-- 2.2 Football Tables
-- ----------------------------------------------------------

CREATE TABLE analytics.football_matches (
    id            serial PRIMARY KEY,
    api_id        int UNIQUE NOT NULL,
    league_id     int REFERENCES analytics.leagues(id),
    round         text,
    date_time     timestamptz NOT NULL,
    home_team_id  int NOT NULL REFERENCES analytics.teams(id),
    away_team_id  int NOT NULL REFERENCES analytics.teams(id),
    home_score    int,           -- NULL if not yet played
    away_score    int,
    status        text NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled', 'live', 'finished', 'postponed')),
    referee_name  text,
    weather       jsonb          -- {"condition", "temp_c", "wind_ms"}
);

CREATE INDEX idx_fb_matches_date ON analytics.football_matches(date_time DESC);
CREATE INDEX idx_fb_matches_status ON analytics.football_matches(status);
CREATE INDEX idx_fb_matches_league ON analytics.football_matches(league_id);
CREATE INDEX idx_fb_matches_home ON analytics.football_matches(home_team_id);
CREATE INDEX idx_fb_matches_away ON analytics.football_matches(away_team_id);

CREATE TABLE analytics.football_match_stats (
    match_id       int NOT NULL REFERENCES analytics.football_matches(id) ON DELETE CASCADE,
    team_id        int NOT NULL REFERENCES analytics.teams(id),
    possession_pct decimal(4,1),
    shots_on_goal  int,
    shots_total    int,
    passes_total   int,
    passes_accurate int,
    fouls          int,
    corners        int,
    yellow_cards   int,
    red_cards      int,
    expected_goals decimal(4,2),  -- NULL for minor leagues
    PRIMARY KEY (match_id, team_id)
);

CREATE TABLE analytics.football_injuries (
    id          serial PRIMARY KEY,
    player_id   int NOT NULL REFERENCES analytics.players(id),
    team_id     int NOT NULL REFERENCES analytics.teams(id),
    match_id    int REFERENCES analytics.football_matches(id),  -- NULL for a training injury
    type        text NOT NULL CHECK (type IN ('injury', 'suspension', 'other')),
    reason      text,
    status      text NOT NULL CHECK (status IN ('out', 'doubtful', 'day_to_day')),
    reported_at date NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX idx_fb_injuries_team ON analytics.football_injuries(team_id);
CREATE INDEX idx_fb_injuries_status ON analytics.football_injuries(status);

CREATE TABLE analytics.football_h2h (
    team_a_id     int NOT NULL REFERENCES analytics.teams(id),
    team_b_id     int NOT NULL REFERENCES analytics.teams(id),
    total_matches int NOT NULL DEFAULT 0,
    team_a_wins   int NOT NULL DEFAULT 0,
    draws         int NOT NULL DEFAULT 0,
    team_b_wins   int NOT NULL DEFAULT 0,
    avg_goals_a   decimal(3,1),
    avg_goals_b   decimal(3,1),
    last_5_results jsonb,  -- ["W","D","L","W","W"]
    updated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (team_a_id, team_b_id),
    CHECK (team_a_id < team_b_id)  -- Convention : ID le plus petit en premier
);

CREATE TABLE analytics.football_team_rolling (
    team_id            int NOT NULL REFERENCES analytics.teams(id),
    date               date NOT NULL,
    venue              text NOT NULL CHECK (venue IN ('home', 'away', 'all')),
    l5_points          int,
    l5_ppm             decimal(3,2),
    l5_goals_for       decimal(3,1),
    l5_goals_against   decimal(3,1),
    l5_clean_sheets    int,
    l5_xg_for          decimal(3,1),    -- NULL si xG indispo
    l5_xg_against      decimal(3,1),
    l5_possession_avg  decimal(4,1),
    l5_pass_accuracy   decimal(4,1),
    l5_shots_avg       decimal(3,1),
    PRIMARY KEY (team_id, date, venue)
);

CREATE INDEX idx_fb_rolling_date ON analytics.football_team_rolling(date DESC);

CREATE TABLE analytics.football_team_elo (
    team_id       int NOT NULL REFERENCES analytics.teams(id),
    date          date NOT NULL,
    elo_rating    decimal(6,1) NOT NULL DEFAULT 1500.0,
    elo_change_1m decimal(5,1),
    PRIMARY KEY (team_id, date)
);

CREATE INDEX idx_fb_elo_date ON analytics.football_team_elo(date DESC);

CREATE TABLE analytics.football_referee_stats (
    referee_name      text NOT NULL,
    season            int NOT NULL,
    matches_officiated int NOT NULL DEFAULT 0,
    avg_yellow_cards  decimal(3,1),
    avg_red_cards     decimal(3,2),
    avg_fouls         decimal(4,1),
    avg_penalties     decimal(3,2),
    PRIMARY KEY (referee_name, season)
);


-- ----------------------------------------------------------
-- 2.3 Tables Basketball
-- ----------------------------------------------------------

CREATE TABLE analytics.basketball_matches (
    id            serial PRIMARY KEY,
    api_id        int UNIQUE NOT NULL,
    league_id     int REFERENCES analytics.leagues(id),
    date_time     timestamptz NOT NULL,
    home_team_id  int NOT NULL REFERENCES analytics.teams(id),
    away_team_id  int NOT NULL REFERENCES analytics.teams(id),
    home_score    int,
    away_score    int,
    score_q1      jsonb,   -- {"home": 28, "away": 25}
    score_q2      jsonb,
    score_q3      jsonb,
    score_q4      jsonb,
    score_ot      jsonb,   -- NULL si pas de prolongation
    status        text NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled', 'live', 'finished'))
);

CREATE INDEX idx_bb_matches_date ON analytics.basketball_matches(date_time DESC);
CREATE INDEX idx_bb_matches_status ON analytics.basketball_matches(status);
CREATE INDEX idx_bb_matches_league ON analytics.basketball_matches(league_id);
CREATE INDEX idx_bb_matches_home ON analytics.basketball_matches(home_team_id);
CREATE INDEX idx_bb_matches_away ON analytics.basketball_matches(away_team_id);

CREATE TABLE analytics.basketball_match_stats (
    match_id     int NOT NULL REFERENCES analytics.basketball_matches(id) ON DELETE CASCADE,
    team_id      int NOT NULL REFERENCES analytics.teams(id),
    -- Stats brutes API
    fga          int,   -- Field Goals Attempted
    fgm          int,   -- Field Goals Made
    tpa          int,   -- 3-Point Attempted
    tpm          int,   -- 3-Point Made
    fta          int,   -- Free Throws Attempted
    ftm          int,   -- Free Throws Made
    off_rebounds int,
    def_rebounds int,
    assists      int,
    turnovers    int,
    steals       int,
    blocks       int,
    fouls        int,
    -- Computed metrics (Dean Oliver)
    possessions  decimal(5,1),
    ortg         decimal(5,1),   -- Offensive Rating
    drtg         decimal(5,1),   -- Defensive Rating
    efg_pct      decimal(4,1),   -- Effective FG%
    tov_pct      decimal(4,1),   -- Turnover %
    orb_pct      decimal(4,1),   -- Offensive Rebound %
    ftr          decimal(4,1),   -- Free Throw Rate
    PRIMARY KEY (match_id, team_id)
);

CREATE TABLE analytics.basketball_injuries (
    id          serial PRIMARY KEY,
    player_id   int NOT NULL REFERENCES analytics.players(id),
    team_id     int NOT NULL REFERENCES analytics.teams(id),
    status      text NOT NULL CHECK (status IN ('out', 'gtd', 'probable')),
    reason      text,
    ppg_impact  decimal(4,1),   -- Points/match lost
    usg_pct     decimal(4,1),   -- Usage Rate du joueur
    reported_at date NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX idx_bb_injuries_team ON analytics.basketball_injuries(team_id);

CREATE TABLE analytics.basketball_team_rolling (
    team_id          int NOT NULL REFERENCES analytics.teams(id),
    date             date NOT NULL,
    venue            text NOT NULL CHECK (venue IN ('home', 'away', 'all')),
    -- Rolling Stats L5
    l5_ortg          decimal(5,1),
    l5_drtg          decimal(5,1),
    l5_net_rtg       decimal(5,1),
    l5_pace          decimal(5,1),
    l5_efg_pct       decimal(4,1),
    -- Rolling Stats L10
    l10_ortg         decimal(5,1),
    l10_drtg         decimal(5,1),
    l10_net_rtg      decimal(5,1),
    -- Season
    season_ortg      decimal(5,1),
    season_drtg      decimal(5,1),
    -- Fatigue
    rest_days        int,
    is_b2b           boolean NOT NULL DEFAULT false,
    games_in_7_days  int,
    PRIMARY KEY (team_id, date, venue)
);

CREATE INDEX idx_bb_rolling_date ON analytics.basketball_team_rolling(date DESC);

CREATE TABLE analytics.basketball_h2h (
    team_a_id    int NOT NULL REFERENCES analytics.teams(id),
    team_b_id    int NOT NULL REFERENCES analytics.teams(id),
    season       int NOT NULL,
    games_played int NOT NULL DEFAULT 0,
    team_a_wins  int NOT NULL DEFAULT 0,
    avg_margin   decimal(4,1),
    last_results jsonb,   -- [{"date","score","winner"}]
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (team_a_id, team_b_id, season)
);


-- ----------------------------------------------------------
-- 2.4 Tennis Tables
-- ----------------------------------------------------------

CREATE TABLE analytics.tennis_tournaments (
    id              serial PRIMARY KEY,
    api_id          int UNIQUE NOT NULL,
    name            text NOT NULL,
    category        text NOT NULL
                        CHECK (category IN ('grand_slam', 'masters_1000', 'atp_500',
                                            'atp_250', 'challenger', 'itf')),
    surface         text CHECK (surface IN ('clay', 'hard', 'grass')),
    indoor_outdoor  text CHECK (indoor_outdoor IN ('indoor', 'outdoor')),
    prize_money_usd int
);

CREATE INDEX idx_tennis_tourn_category ON analytics.tennis_tournaments(category);
CREATE INDEX idx_tennis_tourn_surface ON analytics.tennis_tournaments(surface);

CREATE TABLE analytics.tennis_matches (
    id              serial PRIMARY KEY,
    api_id          int UNIQUE NOT NULL,
    tournament_id   int NOT NULL REFERENCES analytics.tennis_tournaments(id),
    round           text,
    date_time       timestamptz NOT NULL,
    player1_id      int NOT NULL REFERENCES analytics.players(id),
    player2_id      int NOT NULL REFERENCES analytics.players(id),
    winner_id       int REFERENCES analytics.players(id),  -- NULL if not played
    score           text,              -- "6-4, 3-6, 7-6(5)"
    duration_minutes int,
    sets_played     int,
    status          text NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled', 'live', 'finished', 'retired', 'walkover')),
    surface         text,              -- Denormalized for performance
    indoor_outdoor  text
);

CREATE INDEX idx_tn_matches_date ON analytics.tennis_matches(date_time DESC);
CREATE INDEX idx_tn_matches_status ON analytics.tennis_matches(status);
CREATE INDEX idx_tn_matches_tournament ON analytics.tennis_matches(tournament_id);
CREATE INDEX idx_tn_matches_p1 ON analytics.tennis_matches(player1_id);
CREATE INDEX idx_tn_matches_p2 ON analytics.tennis_matches(player2_id);
CREATE INDEX idx_tn_matches_surface ON analytics.tennis_matches(surface);

CREATE TABLE analytics.tennis_match_stats (
    match_id             int NOT NULL REFERENCES analytics.tennis_matches(id) ON DELETE CASCADE,
    player_id            int NOT NULL REFERENCES analytics.players(id),
    aces                 int,
    double_faults        int,
    first_serve_pct      decimal(4,1),
    first_serve_won_pct  decimal(4,1),
    second_serve_won_pct decimal(4,1),
    bp_saved_pct         decimal(4,1),
    bp_converted_pct     decimal(4,1),
    total_points_won     int,
    -- Computed metrics
    return_won_pct       decimal(4,1),
    service_games_held   int,
    return_games_won     int,
    PRIMARY KEY (match_id, player_id)
);

CREATE TABLE analytics.tennis_player_rolling (
    player_id              int NOT NULL REFERENCES analytics.players(id),
    surface                text NOT NULL CHECK (surface IN ('clay', 'hard', 'grass', 'all')),
    date                   date NOT NULL,
    l5_win_pct             decimal(4,1),
    l10_win_pct            decimal(4,1),
    season_win_pct         decimal(4,1),
    l10_aces_avg           decimal(4,1),
    l10_first_serve_pct    decimal(4,1),
    l10_first_serve_won    decimal(4,1),
    l10_bp_saved_pct       decimal(4,1),
    l10_return_won_pct     decimal(4,1),
    l10_bp_converted_pct   decimal(4,1),
    -- Fatigue
    days_since_last_match  int,
    sets_played_l7         int,
    minutes_played_l7      int,
    fatigue_score          int CHECK (fatigue_score BETWEEN 0 AND 100),
    PRIMARY KEY (player_id, surface, date)
);

CREATE INDEX idx_tn_rolling_date ON analytics.tennis_player_rolling(date DESC);

CREATE TABLE analytics.tennis_h2h (
    player_a_id       int NOT NULL REFERENCES analytics.players(id),
    player_b_id       int NOT NULL REFERENCES analytics.players(id),
    total_wins_a      int NOT NULL DEFAULT 0,
    total_wins_b      int NOT NULL DEFAULT 0,
    clay_wins_a       int NOT NULL DEFAULT 0,
    clay_wins_b       int NOT NULL DEFAULT 0,
    hard_wins_a       int NOT NULL DEFAULT 0,
    hard_wins_b       int NOT NULL DEFAULT 0,
    grass_wins_a      int NOT NULL DEFAULT 0,
    grass_wins_b      int NOT NULL DEFAULT 0,
    indoor_wins_a     int NOT NULL DEFAULT 0,
    indoor_wins_b     int NOT NULL DEFAULT 0,
    last_meeting_date date,
    last_winner_id    int REFERENCES analytics.players(id),
    last_score        text,
    updated_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (player_a_id, player_b_id),
    CHECK (player_a_id < player_b_id)
);

CREATE TABLE analytics.tennis_rankings (
    player_id      int NOT NULL REFERENCES analytics.players(id),
    date           date NOT NULL,   -- Lundi de chaque semaine
    rank           int NOT NULL,
    points         int NOT NULL,
    rank_change_1m int,
    rank_change_3m int,
    trend          text CHECK (trend IN ('rising', 'stable', 'declining')),
    PRIMARY KEY (player_id, date)
);

CREATE INDEX idx_tn_rankings_date ON analytics.tennis_rankings(date DESC);


-- ----------------------------------------------------------
-- 2.5 Table de Confiance (Cross-Sport)
-- ----------------------------------------------------------

CREATE TABLE analytics.confidence_factors (
    id                       serial PRIMARY KEY,
    match_id                 int NOT NULL,
    sport                    text NOT NULL CHECK (sport IN ('football', 'basketball', 'tennis')),
    base_score               int NOT NULL DEFAULT 100,
    league_tier_malus        int NOT NULL DEFAULT 0,
    missing_data_malus       int NOT NULL DEFAULT 0,
    h2h_malus                int NOT NULL DEFAULT 0,
    injury_uncertainty_malus int NOT NULL DEFAULT 0,
    final_score              int NOT NULL DEFAULT 100
                                 CHECK (final_score BETWEEN 0 AND 100),
    computed_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_confidence_sport_match ON analytics.confidence_factors(sport, match_id);


-- ============================================================
-- PART 3: SEED DATA (Initial reference data)
-- NOTE: The seed values below (plan/badge/config-flag text) are historical
-- French seed data from this initial migration — not code comments. They
-- were superseded in production by the later plans/features localization
-- work (per-locale columns + AI backfill), so left untouched here as a
-- historical record rather than rewritten.
-- ============================================================

-- Subscription plans
INSERT INTO public.plans (id, name, price, features) VALUES
    ('free', 'Free Tier', 0.00, '["2 prédictions gratuites/jour", "Analyses basiques"]'::jsonb),
    ('premium_monthly', 'The Insider (Mensuel)', 9.99, '["Prédictions illimitées", "Analyses détaillées", "Alertes temps réel"]'::jsonb),
    ('premium_annual', 'The Insider (Annuel)', 79.99, '["Tout Premium", "2 mois offerts", "Accès prioritaire"]'::jsonb);

-- Base badges
INSERT INTO public.badges (id, name, description, icon_ref, rarity) VALUES
    ('first_bet', 'Première Mise', 'Suivre votre premier pronostic', 'target', 'common'),
    ('streak_3', 'Hat-Trick', '3 pronostics gagnants consécutifs', 'flame', 'common'),
    ('streak_5', 'En Feu', '5 pronostics gagnants consécutifs', 'zap', 'rare'),
    ('streak_10', 'Inarrêtable', '10 pronostics gagnants consécutifs', 'crown', 'epic'),
    ('roi_positive', 'Rentable', 'ROI positif sur 30 jours', 'trending-up', 'rare'),
    ('centurion', 'Centurion', '100 pronostics suivis', 'award', 'rare'),
    ('sharpshooter', 'Sniper', 'Win rate > 70% sur 50 paris', 'crosshair', 'epic'),
    ('legend', 'Légende', 'Niveau 50 atteint', 'star', 'legendary');

-- Default feature flags
INSERT INTO public.app_config (key, value, description) VALUES
    ('maintenance_mode', 'false'::jsonb, 'Active le mode maintenance (bannière + blocage actions)'),
    ('signup_enabled', 'true'::jsonb, 'Autorise les nouvelles inscriptions'),
    ('ai_engine_active', 'true'::jsonb, 'Active le moteur de prédiction IA'),
    ('max_free_predictions', '2'::jsonb, 'Nombre de prédictions gratuites par jour');


-- ============================================================
-- PART 4: UTILITY FUNCTIONS
-- ============================================================

-- Function: Auto-create the profile after Supabase Auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, username, created_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || LEFT(NEW.id::text, 8)),
        now()
    );
    INSERT INTO public.user_settings (user_id) VALUES (NEW.id);
    INSERT INTO public.user_stats (user_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger sur inscription
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- PART 5: ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on sensitive tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Profiles: public read, own-row write
CREATE POLICY "Profiles are viewable by everyone"
    ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Settings: own user only
CREATE POLICY "Users can view own settings"
    ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own settings"
    ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);

-- Stats: public read (leaderboard), system write
CREATE POLICY "Stats are viewable by everyone"
    ON public.user_stats FOR SELECT USING (true);

-- Badges: public read
CREATE POLICY "Badges are viewable by everyone"
    ON public.user_badges FOR SELECT USING (true);

-- Subscriptions: own user only
CREATE POLICY "Users can view own subscription"
    ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);

-- Matches & Predictions: public read
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Matches are viewable by everyone"
    ON public.matches FOR SELECT USING (true);

ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Predictions are viewable by everyone"
    ON public.predictions FOR SELECT USING (true);


-- ============================================================
-- END OF SCRIPT
-- ============================================================
-- Total Tables Created:
--   public.*    : 10 tables (profiles, user_settings, user_stats, badges,
--                            user_badges, matches, predictions, plans,
--                            subscriptions, system_logs, app_config)
--   analytics.* : 19 tables (leagues, teams, players, odds_snapshots,
--                            football_matches, football_match_stats,
--                            football_injuries, football_h2h,
--                            football_team_rolling, football_team_elo,
--                            football_referee_stats,
--                            basketball_matches, basketball_match_stats,
--                            basketball_injuries, basketball_team_rolling,
--                            basketball_h2h,
--                            tennis_tournaments, tennis_matches,
--                            tennis_match_stats, tennis_player_rolling,
--                            tennis_h2h, tennis_rankings,
--                            confidence_factors)
-- ============================================================
