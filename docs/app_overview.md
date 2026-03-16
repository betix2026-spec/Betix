# BETIX — Vue d'ensemble complète de l'application

> **Dernière mise à jour :** 2026-03-13
> **Version :** v1.0
> **Statut :** MVP production-ready, développement actif

---

## Table des matières

1. [Présentation générale](#1-présentation-générale)
2. [Architecture du projet](#2-architecture-du-projet)
3. [Stack technique détaillée](#3-stack-technique-détaillée)
4. [Fonctionnalités utilisateur](#4-fonctionnalités-utilisateur)
5. [Fonctionnalités admin](#5-fonctionnalités-admin)
6. [Pipeline de données (Backend)](#6-pipeline-de-données-backend)
7. [Moteur IA de prédictions](#7-moteur-ia-de-prédictions)
8. [Base de données (double schéma)](#8-base-de-données-double-schéma)
9. [Intégrations externes](#9-intégrations-externes)
10. [Système de paiement (Stripe)](#10-système-de-paiement-stripe)
11. [Authentification & sécurité](#11-authentification--sécurité)
12. [Déploiement & infrastructure](#12-déploiement--infrastructure)
13. [Patterns techniques](#13-patterns-techniques)
14. [Arborescence des fichiers clés](#14-arborescence-des-fichiers-clés)
15. [Routes API (Backend)](#15-routes-api-backend)
16. [Routes Frontend (Pages)](#16-routes-frontend-pages)
17. [Variables d'environnement](#17-variables-denvironnement)
18. [Documentation associée](#18-documentation-associée)

---

## 1. Présentation générale

**BETIX** est une plateforme SaaS de pronostics sportifs propulsés par l'intelligence artificielle. Elle couvre trois sports — **Football**, **Basketball** et **Tennis** — et fournit aux utilisateurs des analyses détaillées accompagnées de scores de confiance pour guider leurs décisions de paris.

### Proposition de valeur

- Agrégation de **15+ sources de données** par match (stats, forme, H2H, cotes, Elo, arbitres...)
- Analyse par **LLM** (Gemini, Claude, GPT) avec prompts spécifiques à chaque sport
- Pronostics classés en **3 niveaux de confiance** (Safe, Intermédiaire, Risqué)
- Suivi **temps réel** des matchs en direct avec mises à jour automatiques des scores
- Modèle **freemium** : 2 prédictions/jour gratuites, accès illimité en premium

---

## 2. Architecture du projet

```
BETIX/
├── frontend/                  # Application Next.js 15
│   ├── src/
│   │   ├── app/               # Pages et routes (App Router)
│   │   │   ├── (public)/      # Pages publiques (landing, pricing, legal)
│   │   │   ├── (auth)/        # Authentification (login, signup, MFA)
│   │   │   ├── (dashboard)/   # Dashboard protégé (matchs, profil)
│   │   │   ├── (admin)/       # Panel admin
│   │   │   └── api/           # Routes serveur (webhook Stripe, callbacks)
│   │   ├── components/        # Composants React (50+ shadcn/ui)
│   │   ├── lib/               # Utilitaires (Supabase, Stripe, API)
│   │   ├── hooks/             # Custom React hooks
│   │   └── types/             # Interfaces TypeScript
│   ├── package.json
│   └── next.config.ts
│
├── backend/                   # API & Workers Python
│   ├── app/
│   │   ├── main.py            # Point d'entrée FastAPI
│   │   ├── config.py          # Configuration (Pydantic Settings)
│   │   ├── routers/           # Endpoints API REST
│   │   ├── models/            # Schémas Pydantic & enums
│   │   ├── services/          # Logique métier
│   │   │   ├── ingestion/     # Clients APIs sportives
│   │   │   ├── enrichment/    # Analytics (H2H, Rolling, Elo)
│   │   │   └── config_reader.py
│   │   └── engine/            # Pipeline IA
│   │       ├── ai_model.py    # Wrapper LLM multi-provider
│   │       ├── prompt_builder.py
│   │       ├── data_aggregation.py
│   │       └── confidence_generator.py
│   ├── scripts/updates/       # Workers & orchestrateurs
│   ├── requirements.txt
│   └── supervisord.conf
│
├── supabase/
│   └── migrations/            # Migrations SQL PostgreSQL
│
├── docs/                      # Documentation
├── scripts/                   # Scripts utilitaires
├── docker-compose.yml         # Orchestration dev multi-services
└── .env                       # Variables d'environnement
```

---

## 3. Stack technique détaillée

### Frontend

| Catégorie | Technologie | Version / Détail |
|---|---|---|
| Framework | **Next.js** | 15 (App Router, Server Components) |
| Langage | **TypeScript** | Strict mode |
| CSS | **Tailwind CSS** | v4 |
| Composants UI | **shadcn/ui** | 50+ composants (Radix UI sous le capot) |
| Icônes | **Lucide React** | |
| Animations | **Framer Motion** | |
| Graphiques | **Recharts** | Visualisation de données/stats |
| Notifications | **Sonner** | Toasts |
| Dates | **date-fns** | Formatage et manipulation |
| Paiement | **@stripe/stripe-js** | SDK Stripe côté client |
| Auth/DB | **@supabase/supabase-js** | Client Supabase |
| SSR Auth | **@supabase/ssr** | Gestion sessions côté serveur |

### Backend

| Catégorie | Technologie | Version / Détail |
|---|---|---|
| Langage | **Python** | 3.11+ |
| Framework | **FastAPI** | 0.115 |
| Validation | **Pydantic** | v2.12 |
| Scheduler | **APScheduler** | Planification tâches récurrentes |
| HTTP async | **httpx** | Client HTTP asynchrone |
| Process Manager | **Supervisord** | Gestion multi-workers en production |
| Config | **Pydantic Settings** | Gestion .env typée |

### IA / LLM (multi-provider)

| Provider | Modèle | Usage |
|---|---|---|
| **Google** | Gemini 2.0 Flash | Défaut dev/test (rapide, économique) |
| **Anthropic** | Claude | Production (qualité d'analyse) |
| **OpenAI** | GPT | Alternative disponible |

### Base de données & services

| Service | Technologie | Rôle |
|---|---|---|
| Base de données | **PostgreSQL** (via Supabase) | Stockage principal |
| Auth | **Supabase Auth** | JWT, MFA, OAuth |
| Realtime | **Supabase Realtime** | Souscriptions temps réel |
| Sécurité | **Row-Level Security** | Protection données au niveau DB |

### APIs externes

| API | Rôle | Sports couverts |
|---|---|---|
| **API-Sports.io** | Données matchs, stats, cotes | Football, Basketball |
| **API-Tennis** | Données matchs tennis | Tennis |
| **Stripe** | Paiement, abonnements, webhooks | — |

---

## 4. Fonctionnalités utilisateur

### 4.1 Dashboard

- Listing des matchs en temps réel, filtrables par sport (Football, Basketball, Tennis)
- Affichage live des scores pendant les matchs
- Cartes de matchs responsives avec design mobile-first
- Navigation par date et par ligue

### 4.2 Pronostics IA

Chaque prédiction comprend :

- **Score de confiance** classé en 3 niveaux :

| Niveau | Plage | Description |
|---|---|---|
| **Safe** | 80-99% | Haute confiance, faible risque |
| **Intermédiaire** | 60-79% | Confiance moyenne |
| **Risqué** | 30-59% | Paris audacieux, haut rendement potentiel |

- **Analyse experte** rédigée en langage naturel par le LLM
- **Facteurs clés** avec indicateurs d'impact (positif/négatif/neutre)
- **Cotes** et résultats prédits
- **Pronostic principal** (1X2, Over/Under, etc.)

### 4.3 Profil utilisateur

- Paramètres personnels (thème, notifications, newsletter)
- **Statistiques de paris** : taux de réussite, ROI, profit total
- **Gamification** : niveaux, XP, séries (streaks), badges
- Gestion de l'abonnement et historique de paiement

### 4.4 Abonnements

| Plan | Accès | Prix |
|---|---|---|
| **Gratuit** | 2 prédictions/jour | 0 € |
| **Premium mensuel** | Accès illimité | Prix défini en DB |
| **Premium annuel** | Accès illimité | Prix défini en DB |
| **Essai** | 1er mois à 1 € | Offre découverte |

---

## 5. Fonctionnalités admin

- **Gestion utilisateurs** : liste, dossiers détaillés, actions
- **Gestion abonnements** : vue d'ensemble, statuts, interventions manuelles
- **Logs système** : audit trail complet
- **Centre de notifications** : alertes et communications
- **Dashboard analytics** : métriques clés de la plateforme

---

## 6. Pipeline de données (Backend)

### 6.1 Workers (Supervisord)

Le backend exécute **4 processus** gérés par Supervisord :

| Worker | Script | Rôle | Fréquence |
|---|---|---|---|
| `api` | `main.py` | Serveur FastAPI (port 8000) | Permanent |
| `worker_live` | `orchestrator.py` | Suivi matchs en direct | Toutes les 5 min |
| `worker_data` | `orchestrator_data.py` | Sync quotidienne données | Quotidien |
| `worker_ai` | `orchestrator_ai.py` | Batch prédictions LLM | Planifié |

### 6.2 Machine d'états des matchs

```
scheduled (J-5/10)
    → imminent (H-3)        # mark_imminent.py
        → live (H-0:05)     # mark_live.py
            → [suivi live]  # monitor_live.py (scores toutes les 2-3 min)
                → finished  # pipeline post-match
```

### 6.3 Scripts d'ingestion

| Script | Rôle |
|---|---|
| `discover_matches.py` | Découverte nouveaux matchs (J-5 à J-10) |
| `upsert_fb_data.py` | Normalisation données Football & Basketball |
| `upsert_tennis_data.py` | Ingestion spécifique Tennis |
| `upsert_odds.py` | Snapshot des cotes pré-match |

### 6.4 Scripts d'enrichissement analytics

| Script | Données produites |
|---|---|
| `update_match_stats.py` | Statistiques détaillées par match |
| `update_match_h2h.py` | Historique confrontations directes |
| `update_match_rolling.py` | Forme récente (5/10 derniers matchs) |
| Équivalents Tennis | Versions adaptées pour le tennis |

### 6.5 Pipelines post-match

| Script | Sport | Rôle |
|---|---|---|
| `pipeline_fb.py` | Football/Basketball | Workflow complet post-match |
| `pipeline_tennis.py` | Tennis | Workflow spécifique tennis |

---

## 7. Moteur IA de prédictions

### Flux complet

```
1. Agrégation du contexte match (data_aggregation.py)
   ├── Stats équipes/joueurs
   ├── Forme récente (rolling 5/10 matchs)
   ├── H2H (confrontations directes)
   ├── Ratings Elo
   ├── Stats arbitre (football)
   ├── Cotes bookmakers
   └── Contexte ligue/compétition

2. Construction du prompt (prompt_builder.py)
   ├── System prompt sport-spécifique
   └── User prompt avec données structurées

3. Appel LLM (ai_model.py)
   ├── Wrapper multi-provider (Gemini/Claude/GPT)
   ├── Circuit breaker pour rate limiting
   └── Retry avec backoff exponentiel

4. Scoring de confiance (confidence_generator.py)
   ├── Analyse de la réponse LLM
   ├── Classification Safe/Intermédiaire/Risqué
   └── Extraction des facteurs clés

5. Persistance (Supabase)
   └── Table public.predictions
```

### Batch processing

- `batch_audit_next_days.py` — Planification batch sur les matchs des prochains jours
- `match_audit_script.py` — Analyse unitaire d'un match
- Circuit breaker intégré pour gérer les limites de taux des APIs LLM

---

## 8. Base de données (double schéma)

### Schéma `public` (données UI)

| Table | Rôle |
|---|---|
| `profiles` | Identité utilisateur, préférences |
| `user_settings` | Thème, notifications, newsletter |
| `user_stats` | Gamification (level, XP, streaks, ROI) |
| `badges` | Définitions de badges |
| `user_badges` | Badges débloqués par utilisateur |
| `matches` | Données matchs (sport, équipes, scores, statut) |
| `predictions` | Prédictions IA avec confiance |
| `plans` | Définitions des plans d'abonnement |
| `subscriptions` | Abonnements utilisateurs |
| `system_logs` | Journal d'audit |

### Schéma `analytics` (données IA internes)

| Table | Rôle |
|---|---|
| `*_rolling` | Statistiques de forme récente |
| `*_h2h` | Données confrontations directes |
| `elo_ratings` | Classement de force calculé |
| `referee_stats` | Impact des arbitres |
| `odds_snapshots` | Historique des cotes |
| `system_config` | Configuration runtime (feature flags) |

### Trigger notable

Le trigger `handle_new_user()` crée automatiquement à l'inscription :
- Un profil dans `profiles`
- Des paramètres par défaut dans `user_settings`
- Des stats initiales dans `user_stats`
- Un abonnement gratuit dans `subscriptions`

---

## 9. Intégrations externes

### API-Sports.io

- **Sports :** Football, Basketball
- **Données :** Fixtures, lineups, stats détaillées, cotes
- **Plan :** Pro (~30 $/mois)
- **Ligues couvertes :** Premier League, La Liga, Ligue 1, Serie A, Bundesliga, NBA, etc.

### API-Tennis

- **Sport :** Tennis
- **Particularités :** Gestion planning flexible, fatigue joueurs (sets joués), tournois
- **Données :** Matchs, résultats, classements

### Stripe

- Checkout Sessions (paiement sécurisé)
- Webhooks (événements de paiement et abonnement)
- Gestion clients et abonnements
- Portal client pour auto-gestion

### Supabase

- PostgreSQL managé
- Auth (JWT, MFA, OAuth)
- Realtime subscriptions
- Row-Level Security
- Service Role Key pour accès admin backend

---

## 10. Système de paiement (Stripe)

### Flux d'abonnement

```
1. Utilisateur choisit un plan (page pricing)
2. Création Checkout Session (API route Next.js)
3. Redirection vers Stripe Checkout
4. Paiement → Webhook déclenché
5. Webhook met à jour la table subscriptions
6. Utilisateur redirigé vers le dashboard
```

### Événements webhook gérés

| Événement | Action |
|---|---|
| `checkout.session.completed` | Création/activation abonnement |
| `invoice.paid` | Renouvellement confirmé |
| `invoice.payment_failed` | Notification échec paiement |
| `customer.subscription.deleted` | Désactivation abonnement |
| `customer.subscription.updated` | Mise à jour statut |

### Migration récente

Migration **Mollie → Stripe** (2026-03-12) :
- Renommage colonnes : `mollie_plan_id` → `stripe_price_id`, `mollie_subscription_id` → `stripe_subscription_id`, `mollie_customer_id` → `stripe_customer_id`
- Mise à jour contraintes et défauts

---

## 11. Authentification & sécurité

### Méthodes d'authentification

- **Email / Mot de passe** (inscription classique)
- **OAuth** (providers configurables)
- **MFA** (authentification multi-facteurs)
- **Sessions JWT** persistantes via Supabase

### Sécurité des données

- **Row-Level Security (RLS)** sur toutes les tables utilisateur
- **Service Role Key** réservée au backend (jamais exposée côté client)
- **Anon Key** pour les opérations publiques côté frontend
- **SECURITY DEFINER** sur les triggers critiques

---

## 12. Déploiement & infrastructure

### Production

| Service | Plateforme | Configuration |
|---|---|---|
| **Frontend** | Vercel | CI/CD automatique depuis Git, auto-déploiement |
| **Backend** | Railway (Docker) | Image unique, Supervisord 4 workers |

### Développement local (Docker Compose)

| Service | Port | Rôle |
|---|---|---|
| `backend` | 8000 | FastAPI avec hot reload |
| `orchestrator` | — | Worker matchs live |
| `frontend` | 3000 | Next.js dev server |
| `ngrok` | 4040 | Tunnel pour webhooks Stripe |

### Configuration Supervisord (production)

```ini
[program:api]         → FastAPI (port 8000)
[program:worker_live] → orchestrator.py
[program:worker_data] → orchestrator_data.py
[program:worker_ai]   → orchestrator_ai.py
```

---

## 13. Patterns techniques

| Pattern | Description |
|---|---|
| **Server Components First** | Next.js maximise le SSR pour éviter les loading spinners |
| **Async-First** | Tout le backend Python est async/await |
| **Circuit Breaker** | Protection contre le rate-limiting des APIs LLM |
| **Webhook-Driven** | Les événements Stripe pilotent les changements d'état |
| **Dual-Schema** | Séparation données UI (`public`) et données IA (`analytics`) |
| **Machine d'états** | Matchs transitent scheduled → imminent → live → finished |
| **Principe d'unitarité** | Chaque script fait une seule chose, composabilité maximale |
| **RLS-based Security** | Protection des données au niveau PostgreSQL |
| **Multi-Provider LLM** | Abstraction permettant de switcher Gemini/Claude/GPT |

---

## 14. Arborescence des fichiers clés

### Configuration

| Fichier | Rôle |
|---|---|
| `docker-compose.yml` | Orchestration multi-services |
| `backend/requirements.txt` | Dépendances Python |
| `backend/supervisord.conf` | Configuration workers production |
| `backend/.env.example` | Template variables d'environnement |
| `frontend/package.json` | Dépendances Node.js |
| `frontend/next.config.ts` | Configuration Next.js |

### Backend — Coeur applicatif

| Fichier | Rôle |
|---|---|
| `backend/app/main.py` | Point d'entrée FastAPI |
| `backend/app/config.py` | Configuration centralisée |
| `backend/app/routers/` | Endpoints API REST |
| `backend/app/models/` | Schémas Pydantic & enums |
| `backend/app/services/ingestion/` | Clients APIs sportives |
| `backend/app/services/enrichment/` | Calculs analytics |
| `backend/app/engine/ai_model.py` | Wrapper LLM multi-provider |
| `backend/app/engine/prompt_builder.py` | Construction prompts IA |
| `backend/app/engine/data_aggregation.py` | Agrégation contexte match |

### Backend — Workers & orchestrateurs

| Fichier | Rôle |
|---|---|
| `backend/scripts/updates/orchestrator.py` | Gestion matchs live |
| `backend/scripts/updates/orchestrator_data.py` | Sync quotidienne |
| `backend/scripts/updates/orchestrator_ai.py` | Batch IA |
| `backend/scripts/updates/discover_matches.py` | Découverte matchs |
| `backend/scripts/updates/batch_audit_next_days.py` | Batch prédictions |

### Frontend — Pages

| Fichier | Rôle |
|---|---|
| `frontend/src/app/(public)/` | Landing, pricing, legal |
| `frontend/src/app/(auth)/` | Login, signup, MFA, reset |
| `frontend/src/app/(dashboard)/` | Dashboard, matchs, profil |
| `frontend/src/app/(admin)/` | Panel administration |
| `frontend/src/app/api/stripe/webhook/route.ts` | Webhook Stripe |

### Frontend — Librairies

| Fichier | Rôle |
|---|---|
| `frontend/src/lib/supabase/` | Clients Supabase (server/client) |
| `frontend/src/lib/stripe.ts` | Intégration Stripe |
| `frontend/src/lib/api.ts` | Appels API backend |
| `frontend/src/components/` | Composants UI réutilisables |

---

## 15. Routes API (Backend)

Les routes sont organisées dans `backend/app/routers/` :

- **Matchs** — CRUD matchs, filtrage par sport/date/statut
- **Prédictions** — Récupération pronostics par match
- **Système** — Health check, logs, configuration

---

## 16. Routes Frontend (Pages)

| Route | Accès | Description |
|---|---|---|
| `/` | Public | Landing page |
| `/pricing` | Public | Plans et tarifs |
| `/login` | Public | Connexion |
| `/signup` | Public | Inscription |
| `/mfa` | Public | Vérification MFA |
| `/dashboard` | Protégé | Dashboard principal |
| `/dashboard/matches` | Protégé | Liste des matchs |
| `/dashboard/profile` | Protégé | Profil utilisateur |
| `/admin/*` | Admin | Panel d'administration |
| `/api/stripe/webhook` | Serveur | Endpoint webhook Stripe |

---

## 17. Variables d'environnement

### Backend

```
APP_NAME, APP_VERSION, DEBUG, FRONTEND_URL
API_SPORTS_KEY, API_TENNIS_KEY
GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
```

### Frontend

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

---

## 18. Documentation associée

| Document | Contenu |
|---|---|
| `docs/FICHE_DIRECTRICE.md` | Spécification maître (business, tech, budget) |
| `docs/functional_specs.md` | Spécifications UI/UX exhaustives |
| `docs/database_schemas.md` | Design complet de la base de données |
| `docs/design_system.md` | Guidelines visuelles |
| `docs/phase1_synthesis.md` | Bilan de la phase 1 |
| `docs/phase2_synthesis.md` | Bilan de la phase 2 |
| `docs/rag_methodology.md` | Méthodologie RAG |
