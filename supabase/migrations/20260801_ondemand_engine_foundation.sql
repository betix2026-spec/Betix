-- ============================================================
-- BETIX — Foundation pour le moteur de generation a la demande
-- Date : 2026-08-01
-- Description :
--   1. Ajoute un statut (pending/ready/failed) sur ai_match_audits
--      pour servir de verrou de concurrence : un seul appel IA en
--      vol par match a la fois, que le declencheur soit le batch
--      proactif (~24h avant coup d'envoi) ou un clic utilisateur.
--   2. Un nouveau passage de generation ecrit desormais sous
--      run_id = 'live' et met a jour la ligne existante (UPSERT)
--      plutot que d'en creer une nouvelle a chaque fois — une seule
--      analyse "courante" par match. Les anciennes lignes datees
--      (run_id = 'YYYY-MM-DD_runN') restent intactes comme historique
--      de l'ancien systeme ; rien n'est supprime ici.
-- ============================================================

-- 1. Colonne de statut
ALTER TABLE public.ai_match_audits
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ready'
        CHECK (status IN ('pending', 'ready', 'failed'));

-- 2. Horodatage de la derniere tentative (utile pour detecter un
--    'pending' bloque — ex: process mort avant d'avoir pu marquer
--    ready/failed — et l'autoriser a etre repris)
ALTER TABLE public.ai_match_audits
    ADD COLUMN IF NOT EXISTS attempted_at TIMESTAMPTZ;

-- 3. Message d'erreur optionnel quand status = 'failed'
ALTER TABLE public.ai_match_audits
    ADD COLUMN IF NOT EXISTS error_message TEXT;

-- 4. Index pour les requetes du scheduler et du fallback a la demande
CREATE INDEX IF NOT EXISTS idx_match_audits_status ON public.ai_match_audits(status);

COMMENT ON COLUMN public.ai_match_audits.status IS
    'pending = generation en cours (verrou anti-doublon) ; ready = analyse disponible ; failed = derniere tentative en echec, peut etre retentee.';
COMMENT ON COLUMN public.ai_match_audits.attempted_at IS
    'Horodatage du dernier passage en pending. Sert a detecter un verrou bloque (process mort) et l''expirer.';
