#!/usr/bin/env python3
"""
Schema probe — validates that every column name referenced in bq_queries.py
actually exists in the production BigQuery tables.

Run this ONCE before your first live refresh to catch column-name mismatches
before they cause expensive query failures or silent data gaps.

Usage:
    python3 tools/probe_schema.py [--project PROJECT] [--dataset DATASET]

Exit code:
    0 = all columns confirmed present
    1 = one or more columns missing (check output for details)
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import config as cfg


# Every (table, column) referenced by bq_queries.py.
# Update this list if queries change.
EXPECTED_COLUMNS: list[tuple[str, str]] = [
    # community_user
    ("community_user", "community_user_id"),
    ("community_user", "is_active"),
    ("community_user", "created_at"),
    # assignment
    ("assignment", "community_user_id"),
    ("assignment", "activity_id"),
    ("assignment", "assignment_status"),
    ("assignment", "user_completed_ts"),
    ("assignment", "user_started_ts"),
    # activity
    ("activity", "activity_id"),
    ("activity", "status_id"),
    # activity_type
    ("activity_type", "activity_id"),
    ("activity_type", "type"),
    # mmc_business_metrics  (trimmed to what kpi_snapshot actually reads)
    ("mmc_business_metrics", "active_members"),
    ("mmc_business_metrics", "created_ts"),
    # mmc_business_metrics_monthly_view  (all columns used by activity_completion_trend)
    ("mmc_business_metrics_monthly_view", "month_year"),
    ("mmc_business_metrics_monthly_view", "survey_activity_completed_total"),
    ("mmc_business_metrics_monthly_view", "survey_activity_total"),
    ("mmc_business_metrics_monthly_view", "screener_activity_completed_total"),
    ("mmc_business_metrics_monthly_view", "screener_activity_total"),
    ("mmc_business_metrics_monthly_view", "concept_test_completed_total"),
    ("mmc_business_metrics_monthly_view", "concept_test_total"),
    ("mmc_business_metrics_monthly_view", "in_home_use_test_completed_total"),
    ("mmc_business_metrics_monthly_view", "in_home_use_test_total"),
]


def probe(project: str, dataset: str) -> bool:
    from bq_client import _make_bq_client

    client = _make_bq_client(project)

    # Query INFORMATION_SCHEMA once per table
    tables = sorted({t for t, _ in EXPECTED_COLUMNS})
    actual: dict[str, set[str]] = {}

    print(f"\nProbing schema: {project}.{dataset}\n")

    for table in tables:
        sql = f"""
        SELECT column_name
        FROM `{project}.{dataset}.INFORMATION_SCHEMA.COLUMNS`
        WHERE table_name = '{table}'
        """
        try:
            rows = list(client.query(sql).result())
            actual[table] = {r["column_name"].lower() for r in rows}
            print(f"  ✓ {table:<45} {len(actual[table])} columns")
        except Exception as exc:
            print(f"  ✗ {table:<45} FAILED: {exc}")
            actual[table] = set()

    print()

    missing: list[tuple[str, str]] = []
    for table, col in EXPECTED_COLUMNS:
        if col.lower() not in actual.get(table, set()):
            missing.append((table, col))

    if missing:
        print("─" * 60)
        print(f"MISSING columns ({len(missing)}):\n")
        for table, col in missing:
            print(f"  ✗  {table}.{col}")
        print()
        print("Fix: update the corresponding query in tools/bq_queries.py")
        print("     to use the correct column name.\n")
        return False

    print(f"✅  All {len(EXPECTED_COLUMNS)} referenced columns confirmed present.\n")
    return True


def discover_survey_signal(project: str, dataset: str) -> None:
    """
    Print all columns on the 'activity' table to find a long/short survey signal.

    The schema currently has no explicit survey-length field. Candidates:
      - question_count / num_questions: direct count of survey questions
      - estimated_minutes / duration_minutes: estimated completion time
      - points: higher-value surveys may correlate with longer length
      - title/name: could contain "short" or "screener" keywords

    Once you identify the right column, update _ACTIVITY_TYPE_MAP in
    bq_queries.py to split 'survey' → 'survey-long' / 'survey-short'
    based on that field.
    """
    from bq_client import _make_bq_client

    client = _make_bq_client(project)
    sql = f"""
    SELECT column_name, data_type
    FROM `{project}.{dataset}.INFORMATION_SCHEMA.COLUMNS`
    WHERE table_name = 'activity'
    ORDER BY ordinal_position
    """
    print(f"\n📋  Columns on {project}.{dataset}.activity:\n")
    try:
        rows = list(client.query(sql).result())
        for r in rows:
            flag = ""
            name = r["column_name"].lower()
            if any(k in name for k in ("question", "num_q", "item", "length",
                                        "duration", "minute", "point", "title", "name")):
                flag = "  ← possible survey-length signal"
            print(f"  {r['column_name']:<35} {r['data_type']}{flag}")
        print()
        print("Update bq_queries.py DASHBOARD_TYPES and _ACTIVITY_TYPE_MAP")
        print("once you confirm the right column.\n")
    except Exception as exc:
        print(f"  ERROR: {exc}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate BQ column references")
    parser.add_argument("--project", default=cfg.BQ_PROJECT)
    parser.add_argument("--dataset", default=cfg.BQ_DATASET)
    parser.add_argument("--discover-survey-signal", action="store_true",
                        help="Print activity table columns to find long/short survey proxy")
    args = parser.parse_args()

    if args.discover_survey_signal:
        discover_survey_signal(args.project, args.dataset)
        sys.exit(0)

    ok = probe(args.project, args.dataset)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
