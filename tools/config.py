"""
Configuration for the MMC Dashboard refresh pipeline.
Reads from .env at repo root, then falls back to environment variables.
"""
import os
from pathlib import Path

_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_path)
    except ImportError:
        pass  # dotenv not yet installed — rely on environment directly

BQ_PROJECT: str = os.environ.get("BQ_PROJECT", "sams-mmc-social-prod")
BQ_DATASET: str = os.environ.get("BQ_DATASET", "prod")

# Months of historical data to pull for trend charts.
# Note: the engagement_trend query is capped at ~13 months due to the underlying
# mmc_business_metrics_monthly_view lookback. Total-member and cohort history
# will attempt the full LOOKBACK_MONTHS.
LOOKBACK_MONTHS: int = int(os.environ.get("LOOKBACK_MONTHS", "18"))
LOOKBACK_DAYS: int = LOOKBACK_MONTHS * 32  # generous buffer (≈ months × 32 days)
