"""
BETIX — Shared data models.
Normalized structures for the 3 sports (Football, Basketball, Tennis).
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum


# --- Enums ---

class Sport(str, Enum):
    FOOTBALL = "football"
    BASKETBALL = "basketball"
    TENNIS = "tennis"


class MatchStatus(str, Enum):
    SCHEDULED = "scheduled"
    IMMINENT = "imminent"
    LIVE = "live"
    FINISHED = "finished"
    POSTPONED = "postponed"
    CANCELLED = "cancelled"


class ConfidenceLevel(str, Enum):
    SAFE = "safe"
    INTERMEDIATE = "intermediate"
    RISKY = "risky"


class FactorImpact(str, Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"


# --- Sports data ---

class League(BaseModel):
    """Competition / League / Tournament."""
    id: int
    name: str
    logo: str = ""
    country: str = ""
    country_flag: str = ""


class Participant(BaseModel):
    """Team or player."""
    id: int
    name: str
    logo: str = ""


class Score(BaseModel):
    """A match score."""
    home: int
    away: int
    details: Optional[dict] = None  # Football half-time, basketball quarters, tennis sets


class Match(BaseModel):
    """Normalized match — structure shared across the 3 sports."""
    id: str
    external_id: str
    sport: Sport

    league: League
    home: Participant
    away: Participant

    date: str  # ISO 8601
    timestamp: int
    status: MatchStatus

    score: Optional[Score] = None


# --- Predictions ---

class KeyFactor(BaseModel):
    """Key factor in the analysis."""
    icon: str
    label: str
    description: str
    impact: FactorImpact


class Prediction(BaseModel):
    """AI prediction for a match."""
    id: str
    match_id: str
    sport: Sport

    confidence_level: ConfidenceLevel

    analysis: str  # Full explanatory text (markdown)
    predicted_outcome: str  # E.g.: "Home win", "Over 2.5"
    predicted_score: Optional[str] = None  # E.g.: "2-1"
    odds_value: Optional[float] = None  # Associated odds

    key_factors: list[KeyFactor] = []

    model_used: str = ""
    generated_at: str = ""  # ISO 8601


# --- Context for the AI prompt ---

class Standing(BaseModel):
    """Position in the standings."""
    rank: int
    points: int
    played: int
    won: int
    drawn: int
    lost: int
    goals_for: int = 0
    goals_against: int = 0


class H2HResult(BaseModel):
    """Result of a head-to-head meeting."""
    date: str
    home_team: str
    away_team: str
    home_score: int
    away_score: int
    league: str = ""


class Injury(BaseModel):
    """Injured / unavailable player."""
    player_name: str
    reason: str
    status: str = ""  # Doubtful, Out, etc.


# --- Odds & Audit ---

class OddsData(BaseModel):
    """A single odds line (e.g. Home, Over 2.5)."""
    label: str
    odds: float


class OddsSnapshot(BaseModel):
    """Snapshot of a market for a bookmaker at a point in time."""
    id: Optional[str] = None
    match_id: int
    sport: Sport
    bookmaker: str
    market_name: str
    market_value: Optional[str] = None # E.g.: "2.5" for Over/Under
    odds_data: list[OddsData]
    recorded_at: Optional[datetime] = None
    is_live: bool = False


class MatchAnalysisContext(BaseModel):
    """Full context for a match's AI analysis."""
    match: Match

    home_form: list[str] = []  # ["W","W","D","L","W"]
    away_form: list[str] = []

    home_standing: Optional[Standing] = None
    away_standing: Optional[Standing] = None

    h2h: list[H2HResult] = []

    home_stats: dict = {}
    away_stats: dict = {}

    home_injuries: list[Injury] = []
    away_injuries: list[Injury] = []

    odds: Optional[dict] = None
