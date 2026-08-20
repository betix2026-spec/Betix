---
description: DAR method for resolving the critical empty Rolling Stats issue (Football/Basketball)
---

# Workflow: Fixing the Empty Rolling Stats Bug

This workflow follows the **DAR** method (Diagnosis - Ablation - Reconstruction) to fix the systematic absence of rolling/streak stats (computed via `update_match_rolling.py`) on new Football and Basketball matches.

## 🩺 1. Diagnosis (D)
- [ ] **Source data audit**: Check whether `football_match_stats` and `basketball_match_stats` are populated for recently finished matches.
- [ ] **Pipeline audit**: Check whether the orchestrator actually runs `update_match_stats.py` BEFORE `update_match_rolling.py`.
- [ ] **Log review**: Analyze error output from the automated run (B2B, missing keys, etc.).
- [ ] **Root cause identification**: Is it missing API data, a calculation error, or an execution-order problem?

## ✂️ 2. Ablation (A)
- [ ] **Remove corrupted/empty data**: Identify `null` entries in `football_team_rolling` and `basketball_team_rolling` for the last 7 days.
- [ ] **Patch the scripts**: Isolate and remove obsolete or faulty code segments (e.g. wrong dictionary keys, incorrect date filters).

## 🏗️ 3. Reconstruction (R)
- [ ] **Update the formulas**:
    - [ ] Football: Add xG, possession, goals average.
    - [ ] Basketball: Add ORTG, DRTG, Pace, eFG%.
- [ ] **Sync IDs**: Ensure every script uses the API ID (api_id) consistently.
- [ ] **Manual backfill**: Re-run the calculations over the past 48h to restore data integrity.
- [ ] **Regression test**: Use `scripts/draft/test_rolling_extraction.py` to validate new matches.

## 🚀 4. Validation (V)
- [ ] Verify in `ai_match_audits` that new audits no longer contain `null`.
- [ ] Confirm correct rendering in the frontend's "Stats" tab.
