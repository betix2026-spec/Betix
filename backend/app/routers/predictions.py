"""
BETIX — Predictions Router
Endpoints for fetching AI predictions for a match.
Returns mock data from Phase 1.
"""

from fastapi import APIRouter
from app.models.schemas import ConfidenceLevel

router = APIRouter()


# =============================================================================
# MOCK DATA — Will be replaced by real AI predictions in Phase 4
# =============================================================================

MOCK_PREDICTIONS: dict[str, list[dict]] = {
    "fb-001": [
        {
            "id": "pred-fb001-safe",
            "match_id": "fb-001",
            "sport": "football",
            "confidence_level": "safe",
            "analysis": """## Cautious Analysis — Manchester United vs Liverpool

Both teams show contrasting recent form. **Manchester United** are on 3 consecutive home wins, with a defense that has conceded just 2 goals over that stretch. **Liverpool**, despite leading the table, have shown signs of fragility on the road in recent weeks.

The Old Trafford factor carries weight: United have won 7 of their last 10 home matches across all competitions. The historical head-to-head is balanced, but home advantage should make the difference.

**Recommendation: Double chance 1X (Manchester United or Draw)**""",
            "predicted_outcome": "Double chance 1X",
            "predicted_score": "1-1",
            "odds_value": 1.45,
            "key_factors": [
                {"icon": "🏟️", "label": "Home advantage", "description": "7 wins in 10 at Old Trafford", "impact": "positive"},
                {"icon": "🛡️", "label": "Defensive solidity", "description": "2 goals conceded in 3 home matches", "impact": "positive"},
                {"icon": "📊", "label": "Balanced H2H", "description": "3W-2D-5L over the last 10 head-to-heads", "impact": "neutral"},
            ],
            "model_used": "gemini-2.0-flash",
            "generated_at": "2026-02-11T08:00:00+00:00",
        },
        {
            "id": "pred-fb001-inter",
            "match_id": "fb-001",
            "sport": "football",
            "confidence_level": "intermediate",
            "analysis": """## Intermediate Analysis — Manchester United vs Liverpool

Advanced-stats analysis (xG, final-third possession) suggests an open match with goals. Both teams have scored in **6 of the last 8 derbies**. United average an xG of 1.8 at home this season, while Liverpool post 2.1 away.

The scoring trend is strong: 75% of United's home matches this season have seen more than 2.5 goals. Liverpool have scored at least 1 goal in each of their last 12 away matches.

**Recommendation: Both teams to score (BTTS Yes)**""",
            "predicted_outcome": "BTTS Yes",
            "predicted_score": "2-1",
            "odds_value": 1.72,
            "key_factors": [
                {"icon": "⚽", "label": "BTTS trend", "description": "6/8 last derbies with both teams scoring", "impact": "positive"},
                {"icon": "📈", "label": "High xG", "description": "Combined xG of 3.9 per match on average", "impact": "positive"},
                {"icon": "🔥", "label": "Liverpool attacking form", "description": "At least 1 goal in 12 consecutive away matches", "impact": "negative"},
            ],
            "model_used": "gemini-2.0-flash",
            "generated_at": "2026-02-11T08:00:00+00:00",
        },
        {
            "id": "pred-fb001-risky",
            "match_id": "fb-001",
            "sport": "football",
            "confidence_level": "risky",
            "analysis": """## Risky Analysis — Manchester United vs Liverpool

Digging deeper into the analysis, Manchester United's home playing profile (high press, fast transitions) combined with Liverpool's offensive aggression creates fertile ground for a high-scoring match.

Over the last 5 Manchester United vs Liverpool meetings at Old Trafford, the average score is **2.6 - 1.8**. If United line up in their usual 4-3-3 with Bruno Fernandes as playmaker, the spaces left behind could benefit both sides.

**Recommendation: Correct score 2-1 for Manchester United**""",
            "predicted_outcome": "Correct score 2-1 (Man Utd)",
            "predicted_score": "2-1",
            "odds_value": 8.50,
            "key_factors": [
                {"icon": "🎯", "label": "Frequent correct score", "description": "2-1 is the most frequent scoreline at Old Trafford this season", "impact": "positive"},
                {"icon": "⚠️", "label": "High risk", "description": "Correct scores remain hard to predict", "impact": "negative"},
                {"icon": "💰", "label": "Attractive odds", "description": "8.50 offers an excellent risk/reward ratio", "impact": "positive"},
            ],
            "model_used": "gemini-2.0-flash",
            "generated_at": "2026-02-11T08:00:00+00:00",
        },
    ],
}


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/{match_id}")
async def get_predictions(match_id: str):
    """Fetches the 3 prediction confidence levels for a match."""
    predictions = MOCK_PREDICTIONS.get(match_id, [])

    if not predictions:
        return {
            "match_id": match_id,
            "available": False,
            "message": "Predictions for this match are not available yet.",
            "predictions": [],
        }

    return {
        "match_id": match_id,
        "available": True,
        "predictions": predictions,
    }
