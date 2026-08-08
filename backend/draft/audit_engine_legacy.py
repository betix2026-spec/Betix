"""
BETIX — audit_engine.py
The AI Audit Engine (ConfidenceFactor Auditor).

This module orchestrates the full analysis of a match:
1. Aggregates all data (stats, ELO, H2H, odds) via DataAggregator.
2. Sends the structured context to the AI (Gemini/GPT/Claude) via ChatModel.
3. Parses the AI response to extract the classification and reasoning.
4. Persists the result to analytics.confidence_factors.
"""
# NOTE: SYSTEM_PROMPT below (and the user_prompt built from it further down)
# are written in French on purpose — same product behavior documented in
# app/engine/prompt_builder.py. Not touched by this English sweep.

import asyncio
import json
import logging
import re
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone

from app.config import get_settings
from app.services.ingestion.base_client import SupabaseREST
from app.engine.data_aggregation import DataAggregator
from app.engine.ai_model import ChatModel

logger = logging.getLogger("betix.audit_engine")

# ────────────────────────────────────────────────────────────────────
# SYSTEM PROMPT — Le cœur de l'intelligence
# ────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """Tu es un analyste sportif expert en paris, spécialisé dans l'identification de la "Value" (écart entre la cote du bookmaker et la probabilité réelle).

## TON RÔLE
Tu reçois un contexte JSON complet sur un match à venir :
- **match** : date, lieu, contexte (round, surface, météo)
- **teams/players** : forme récente (rolling stats), blessures
- **h2h** : historique des confrontations directes
- **odds** : cotes Bet365 par marché (Match Winner, Over/Under, etc.)
- **elo** : classement ELO des équipes/joueurs

## TA MISSION
Analyse TOUTES les données et produis un audit structuré en JSON.

## FORMAT DE RÉPONSE OBLIGATOIRE
Tu DOIS répondre UNIQUEMENT avec un JSON valide (pas de texte autour), avec cette structure exacte :

```json
{
  "category": "SAFE | VALUE | RISKY",
  "confidence_score": 75,
  "analysis": {
    "strengths": ["Point fort 1", "Point fort 2"],
    "weaknesses": ["Point faible 1"],
    "key_insight": "L'insight principal en 1-2 phrases",
    "data_quality": "HIGH | MEDIUM | LOW"
  },
  "recommended_bet": {
    "market": "Match Winner",
    "selection": "Home",
    "odds": 1.80,
    "reasoning": "Explication courte de pourquoi ce pari a de la valeur"
  },
  "alternative_bets": [
    {
      "market": "Goals Over/Under",
      "selection": "Over 2.5",
      "odds": 1.73,
      "reasoning": "Explication courte"
    }
  ]
}
```

## RÈGLES DE CLASSIFICATION
- **SAFE** (score 70-100) : Le favori est clair, les stats confirment la cote, faible incertitude. L'IA recommande un pari "sûr" (ex: Double Chance, Draw No Bet).
- **VALUE** (score 50-85) : Écart détecté entre la probabilité IA et la cote bookmaker. Le pari est intéressant mais comporte un risque calculé.
- **RISKY** (score 0-60) : Données contradictoires, blessures clés, ou insuffisance de données. L'IA signale un risque élevé.

## RÈGLES IMPORTANTES
- Si les données ELO ou H2H sont absentes, abaisse le score de confiance de 10-15 points et signale "data_quality": "LOW".
- Si les cotes sont très serrées (favori à > 2.50), c'est souvent un indicateur de match incertain → tendance RISKY.
- Ne recommande JAMAIS un pari sur un marché dont les odds ne sont pas fournies.
- Réponds UNIQUEMENT en JSON, sans markdown, sans commentaires.
"""

# ────────────────────────────────────────────────────────────────────
# AUDIT ENGINE
# ────────────────────────────────────────────────────────────────────

class AuditEngine:
    def __init__(self, provider: str = "gemini", model_name: str = None):
        self.settings = get_settings()
        self.aggregator = DataAggregator()
        self.db = SupabaseREST(
            self.settings.SUPABASE_URL,
            self.settings.SUPABASE_SERVICE_ROLE_KEY,
            schema="analytics"
        )
        
        # IA Model
        self.ai = ChatModel(
            provider=provider,
            model_name=model_name,
            temperature=0.3,   # Low temperature for consistent analysis
            max_tokens=2000
        )
    
    async def audit_match(self, sport: str, match_id: int) -> Optional[Dict[str, Any]]:
        """
        Audits a match and returns the AI analysis result.
        
        Returns:
            Dict with: category, confidence_score, analysis, recommended_bet, alternative_bets
            None if the match could not be audited.
        """
        logger.info(f"🔍 Auditing {sport} match #{match_id}...")
        
        # 1. Aggregate the context
        try:
            context = await self._build_context(sport, match_id)
        except Exception as e:
            logger.error(f"❌ Failed to build context for {sport} #{match_id}: {e}")
            return None
        
        if not context:
            logger.warning(f"⚠️ Empty context for {sport} #{match_id}, skipping")
            return None
        
        # 2. Submit to the AI
        try:
            ai_result = await self._call_ai(context)
        except Exception as e:
            logger.error(f"❌ AI call failed for {sport} #{match_id}: {e}")
            return None
        
        if not ai_result:
            logger.warning(f"⚠️ AI returned empty for {sport} #{match_id}")
            return None
        
        # 3. Persist the result
        try:
            self._persist_result(sport, match_id, ai_result)
            logger.info(f"✅ Audit saved: {sport} #{match_id} → {ai_result['category']} "
                       f"(score: {ai_result['confidence_score']})")
        except Exception as e:
            logger.error(f"❌ Failed to persist audit for {sport} #{match_id}: {e}")
        
        return ai_result
    
    async def audit_batch(self, matches: List[Dict[str, Any]], delay: float = 1.0) -> Dict[str, Any]:
        """
        Audite un batch de matchs avec rate limiting.
        
        Args:
            matches: List of {"sport": "football", "match_id": 123}
            delay: Seconds between AI calls (rate limiting)
        
        Returns:
            Summary dict with counts per category.
        """
        results = {"total": len(matches), "audited": 0, "failed": 0, 
                   "SAFE": 0, "VALUE": 0, "RISKY": 0}
        
        for i, m in enumerate(matches):
            sport = m["sport"]
            match_id = m["match_id"]
            
            logger.info(f"--- [{i+1}/{len(matches)}] Auditing {sport} #{match_id} ---")
            
            result = await self.audit_match(sport, match_id)
            
            if result:
                results["audited"] += 1
                cat = result.get("category", "RISKY")
                results[cat] = results.get(cat, 0) + 1
            else:
                results["failed"] += 1
            
            # Clear AI history between matches
            self.ai.clear_history()
            
            # Rate limiting
            if i < len(matches) - 1:
                await asyncio.sleep(delay)
        
        return results
    
    # ────────────────────────────────────────────────────────────────
    # PRIVATE METHODS
    # ────────────────────────────────────────────────────────────────
    
    async def _build_context(self, sport: str, match_id: int) -> Optional[Dict[str, Any]]:
        """Build the full context JSON for the AI, fetching each data source individually."""
        agg = self.aggregator
        
        # Fetch each data source individually (no asyncio.gather to avoid CancelledError
        # with synchronous SupabaseREST calls)
        if sport == "tennis":
            match_data = await agg.fetch_tennis_match_details(match_id)
            players_data = await agg.fetch_tennis_players(match_id)
            h2h_data = await agg.fetch_tennis_h2h(match_id)
            rolling_data = await agg.fetch_tennis_rolling(match_id)
            odds_data = await agg.fetch_odds("tennis", match_id)
            
            if not match_data:
                return None
            
            return {
                "sport": sport,
                "match_id": match_id,
                "match": match_data,
                "player1": {
                    "name": players_data.get("player1", {}).get("name", "Unknown"),
                    "form": rolling_data.get("player1", {})
                },
                "player2": {
                    "name": players_data.get("player2", {}).get("name", "Unknown"),
                    "form": rolling_data.get("player2", {})
                },
                "h2h": h2h_data,
                "odds": odds_data
            }
        else:
            match_data = await agg.fetch_match_details(sport, match_id)
            team_data = await agg.fetch_team_details(sport, match_id)
            h2h_data = await agg.fetch_h2h(sport, match_id)
            rolling_data = await agg.fetch_rolling_stats(sport, match_id)
            odds_data = await agg.fetch_odds(sport, match_id)
            elo_data = await agg.fetch_elo(sport, match_id)
            injuries_data = await agg.fetch_injuries(sport, match_id)
            
            if not match_data:
                return None
            
            return {
                "sport": sport,
                "match_id": match_id,
                "match": match_data,
                "home_team": {
                    "name": team_data.get("home", {}).get("name", "Unknown"),
                    "form": rolling_data.get("home", {}),
                    "injuries": injuries_data.get("home", [])
                },
                "away_team": {
                    "name": team_data.get("away", {}).get("name", "Unknown"),
                    "form": rolling_data.get("away", {}),
                    "injuries": injuries_data.get("away", [])
                },
                "h2h": h2h_data,
                "odds": odds_data,
                "elo": elo_data
            }
    
    async def _call_ai(self, context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Send context to AI and parse the structured JSON response."""
        # Serialize context to JSON string
        context_json = json.dumps(context, indent=2, default=str, ensure_ascii=False)
        
        user_prompt = f"Analyse ce match et produis ton audit JSON :\n\n{context_json}"
        
        # Call AI
        raw_response = await self.ai.generate_response(
            message=user_prompt,
            system_instruction=SYSTEM_PROMPT
        )
        
        # Parse JSON from response
        return self._parse_ai_response(raw_response)
    
    def _parse_ai_response(self, raw: str) -> Optional[Dict[str, Any]]:
        """Extract and validate JSON from AI response."""
        if not raw or raw.startswith("Error:"):
            logger.error(f"AI error response: {raw[:200]}")
            return None
        
        # Try direct JSON parse first
        try:
            result = json.loads(raw)
            return self._validate_result(result)
        except json.JSONDecodeError:
            pass
        
        # Try extracting JSON from markdown code blocks
        json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', raw, re.DOTALL)
        if json_match:
            try:
                result = json.loads(json_match.group(1))
                return self._validate_result(result)
            except json.JSONDecodeError:
                pass
        
        # Try finding JSON object in the response
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            try:
                result = json.loads(json_match.group(0))
                return self._validate_result(result)
            except json.JSONDecodeError:
                pass
        
        logger.error(f"Failed to parse AI response as JSON: {raw[:300]}")
        return None
    
    def _validate_result(self, result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Validate that the AI result has the required fields."""
        required = ["category", "confidence_score", "analysis"]
        for field in required:
            if field not in result:
                logger.error(f"AI result missing required field: {field}")
                return None
        
        # Normalize category
        cat = result["category"].upper().strip()
        if cat not in ("SAFE", "VALUE", "RISKY"):
            logger.warning(f"Unknown category '{cat}', defaulting to RISKY")
            cat = "RISKY"
        result["category"] = cat
        
        # Clamp score
        score = int(result["confidence_score"])
        result["confidence_score"] = max(0, min(100, score))
        
        return result
    
    def _persist_result(self, sport: str, match_id: int, result: Dict[str, Any]):
        """Save the audit result to analytics.confidence_factors."""
        row = {
            "match_id": match_id,
            "sport": sport,
            "category": result["category"],
            "confidence_score": result["confidence_score"],
            "ai_analysis": json.dumps(result.get("analysis", {}), ensure_ascii=False),
            "recommended_bet": json.dumps(result.get("recommended_bet", {}), ensure_ascii=False),
            "alternative_bets": json.dumps(result.get("alternative_bets", []), ensure_ascii=False),
        }
        
        self.db.upsert("confidence_factors", [row], on_conflict="match_id,sport")


# ────────────────────────────────────────────────────────────────────
# CONVENIENCE FUNCTION
# ────────────────────────────────────────────────────────────────────

async def audit_match(sport: str, match_id: int, provider: str = "gemini") -> Optional[Dict[str, Any]]:
    """Convenience function to audit a single match."""
    engine = AuditEngine(provider=provider)
    return await engine.audit_match(sport, match_id)
