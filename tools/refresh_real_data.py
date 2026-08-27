#!/usr/bin/env python3
"""
MMC Dashboard real-data refresh tool.

Fetches live metrics from BigQuery (sams-mmc-social-prod.prod) and writes
all 10 data/*.json files atomically. On failure, the previous data is
restored automatically — a failed refresh never destroys a good snapshot.

Usage:
    python3 tools/refresh_real_data.py [OPTIONS]

Options:
    --dry-run           Run transforms against fixture data (no BQ, no network).
                        Useful for testing the pipeline locally without credentials.
    --project PROJECT   BigQuery project  (default: $BQ_PROJECT or sams-mmc-social-prod)
    --dataset DATASET   BigQuery dataset  (default: $BQ_DATASET or prod)
    --keep-backup       Keep .data_backup/ after a successful swap (manual rollback).

Authentication:
    Uses Application Default Credentials (ADC).
    Ensure you are logged in:
        gcloud auth application-default login

    VPC Service Controls note:
        quota_project_id is stripped from credentials (with_quota_project(None))
        to suppress the x-goog-user-project header. This prevents USER_PROJECT_DENIED
        errors in VPC-SC environments. Pattern sourced from mmc-dashboard/batch.py.

Security:
    - Only aggregate counts and rates are written to data/*.json (no PII).
    - Do NOT commit data/*.json without inspecting the output first.
    - Do NOT commit .env, ADC files, or service-account keys.
"""
import argparse
import json
import logging
import os
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import Any

# Allow running as: python3 tools/refresh_real_data.py from repo root
sys.path.insert(0, str(Path(__file__).parent))

import config as cfg

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s  %(message)s",
)
logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).parent.parent
DATA_DIR = REPO_ROOT / "data"
DATA_TMP = REPO_ROOT / "data_tmp"
DATA_BACKUP = REPO_ROOT / ".data_backup"


# ─── Argument parsing ─────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Refresh MMC Dashboard data from BigQuery",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Use fixture data instead of querying BigQuery",
    )
    parser.add_argument(
        "--project",
        default=cfg.BQ_PROJECT,
        help=f"BigQuery project (default: {cfg.BQ_PROJECT})",
    )
    parser.add_argument(
        "--dataset",
        default=cfg.BQ_DATASET,
        help=f"BigQuery dataset (default: {cfg.BQ_DATASET})",
    )
    parser.add_argument(
        "--keep-backup",
        action="store_true",
        help="Keep .data_backup/ after successful swap",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable debug logging",
    )
    return parser.parse_args()


# ─── ADC check ────────────────────────────────────────────────────────────────

def _verify_adc() -> None:
    """Fail fast if Google Cloud credentials are not available."""
    try:
        import google.auth
        creds, project = google.auth.default()
        logger.info("ADC credentials available (project hint: %s)", project or "none")
    except Exception as exc:
        logger.error("Google Cloud credentials not found: %s", exc)
        logger.error("Run: gcloud auth application-default login")
        sys.exit(1)


# ─── BigQuery fetch ───────────────────────────────────────────────────────────

def _fetch_live(project: str, dataset: str) -> dict[str, Any]:
    """Run all BigQuery queries and return raw results keyed by query name."""
    from bq_client import _make_bq_client
    import bq_queries as q

    client = _make_bq_client(project)
    lookback = cfg.LOOKBACK_DAYS

    logger.info("Querying %s.%s (lookback %d days)…", project, dataset, lookback)

    data: dict[str, Any] = {}
    failures: list[str] = []

    def _fetch(key: str, fn, *args):
        """Run a query function, storing result or logging failure."""
        try:
            logger.debug("  Fetching %s…", key)
            data[key] = fn(*args)
            if isinstance(data[key], list):
                logger.info("  ✓ %-35s  %d rows", key, len(data[key]))
            else:
                logger.info("  ✓ %-35s  1 row", key)
        except Exception as exc:
            logger.warning("  ✗ %-35s  FAILED: %s", key, exc)
            failures.append(key)
            data[key] = [] if key not in {"total_members_snapshot", "kpi_snapshot", "supply_coverage"} else {}

    _fetch("total_members_snapshot",   q.query_total_members_snapshot,     client, project, dataset)
    _fetch("total_members_history",    q.query_total_members_history,      client, project, dataset, lookback)
    _fetch("kpi_snapshot",             q.query_kpi_snapshot,               client, project, dataset)
    _fetch("engagement_trend",         q.query_engagement_trend,           client, project, dataset, lookback)
    _fetch("activation_rate",          q.query_new_member_activation_rate, client, project, dataset, lookback)
    _fetch("repeat_rate",              q.query_repeat_participation_rate,  client, project, dataset, lookback)
    _fetch("supply_coverage",          q.query_activity_supply_coverage,   client, project, dataset)
    _fetch("member_funnel",            q.query_member_funnel,              client, project, dataset)
    _fetch("activation_funnel_30d",    q.query_activation_funnel_30d,      client, project, dataset)
    _fetch("retention_cohorts",        q.query_retention_cohorts,          client, project, dataset, lookback)
    from transforms import _last_complete_month as _lcm
    _fetch("depth_buckets",            q.query_participation_depth_buckets, client, project, dataset, _lcm())
    _fetch("depth_history",            q.query_participation_depth_history, client, project, dataset, lookback)
    _fetch("activity_type_stats",      q.query_activity_type_stats,        client, project, dataset)
    _fetch("activity_completion_trend", q.query_activity_completion_trend, client, project, dataset)

    # P0 failures are hard failures
    p0_keys = {"total_members_snapshot", "kpi_snapshot", "engagement_trend",
               "activation_rate", "repeat_rate", "supply_coverage"}
    p0_failures = [k for k in failures if k in p0_keys]
    if p0_failures:
        logger.error("P0 metric queries failed: %s", p0_failures)
        logger.error("Aborting refresh — no data was written.")
        sys.exit(1)

    if failures:
        logger.warning("Non-fatal failures (P1 data partial): %s", failures)

    return data


# ─── Dry-run fixture ──────────────────────────────────────────────────────────

def _get_fixture() -> dict[str, Any]:
    """
    Minimal fixture data for --dry-run mode.
    Exercises all transform functions without requiring BigQuery.
    Values are plausible but not real.
    """
    months_18 = [
        f"2025-{m:02d}" for m in range(3, 13)
    ] + [f"2026-{m:02d}" for m in range(1, 9)]

    def _grow(start: int, n: int, rate: float = 0.018) -> list[int]:
        vals = [start]
        for _ in range(n - 1):
            vals.append(int(vals[-1] * (1 + rate)))
        return vals

    totals = _grow(520_000, 18)
    maus   = _grow(326_000, 18, 0.010)
    hes    = _grow(70_000, 18, 0.015)

    return {
        "total_members_snapshot": {"total_members": totals[-1]},
        "total_members_history": [
            {"month": m, "total_members": v}
            for m, v in zip(months_18, totals)
        ],
        "kpi_snapshot": {
            "mau": maus[-1],
            "wau": int(maus[-1] * 0.4),
            "dau": int(maus[-1] * 0.08),
            "highly_engaged": hes[-1],
            "survey_completion_rate": 0.81,
            "onboarding_completion_rate": 0.67,
            "ttfv_median_days": 4.2,
            "live_activities": 312,
            "avg_member_tenure": 7.4,
        },
        "engagement_trend": [
            {
                "month": m,
                "mau": maus[i],
                "wau": int(maus[i] * 0.4),
                "highly_engaged": hes[i],
                "retained_mau": int(maus[i] * 0.72),
                "new_mau": int(maus[i] * 0.18),
                "resurrected_mau": int(maus[i] * 0.10),
            }
            for i, m in enumerate(months_18)
        ],
        "activation_rate": [
            {"month": m, "cohort_size": 9000 + i * 50,
             "activated_count": int((9000 + i * 50) * (0.58 + i * 0.002)),
             "activation_rate": 0.58 + i * 0.002}
            for i, m in enumerate(months_18)
        ],
        "repeat_rate": [
            {"month": m, "mau": maus[i],
             "repeat_participants": int(maus[i] * (0.58 + i * 0.001)),
             "repeat_participation_rate": 0.58 + i * 0.001}
            for i, m in enumerate(months_18)
        ],
        "supply_coverage": {
            "mau_count": maus[-1],
            "covered_count": int(maus[-1] * 0.827),
            "zero_available_count": int(maus[-1] * 0.173),
            "avg_eligible_per_member": 3.2,
        },
        "member_funnel": [
            {"step_order": 1, "stage": "Joined",         "member_count": totals[-1], "conversion_from_top": 1.0},
            {"step_order": 3, "stage": "Activated",       "member_count": int(totals[-1] * 0.62), "conversion_from_top": 0.62},
            {"step_order": 6, "stage": "Participated",    "member_count": int(totals[-1] * 0.51), "conversion_from_top": 0.51},
            {"step_order": 7, "stage": "Repeated",        "member_count": int(totals[-1] * 0.42), "conversion_from_top": 0.42},
            {"step_order": 8, "stage": "Highly Engaged",  "member_count": hes[-1], "conversion_from_top": round(hes[-1]/totals[-1], 4)},
        ],
        "activation_funnel_30d": [
            {"step_order": 1, "step": "Joined Community",        "count": 17000, "conversion_from_top": 1.0,  "median_days": None},
            {"step_order": 2, "step": "Completed Onboarding",    "count": 11390, "conversion_from_top": 0.670, "median_days": None},
            {"step_order": 3, "step": "First Participation",     "count": 9486, "conversion_from_top": 0.558, "median_days": 4.2},
            {"step_order": 4, "step": "First Research Activity", "count": 9486, "conversion_from_top": 0.558, "median_days": None},
        ],
        "retention_cohorts": [
            row
            for cm, sizes in zip(months_18[-9:], [9000, 9200, 8500, 9100, 9300, 9400, 9500, 9600, 9700])
            for row in [
                {"cohort_month": cm, "cohort_size": sizes, "day_bucket": 7,  "retention_pct": 0.84},
                {"cohort_month": cm, "cohort_size": sizes, "day_bucket": 14, "retention_pct": 0.72},
                {"cohort_month": cm, "cohort_size": sizes, "day_bucket": 30, "retention_pct": 0.61},
                {"cohort_month": cm, "cohort_size": sizes, "day_bucket": 56, "retention_pct": 0.52},
                {"cohort_month": cm, "cohort_size": sizes, "day_bucket": 84, "retention_pct": 0.46},
            ]
        ],
        "depth_buckets": [
            {"label": "1 activity", "min_activities": 1, "member_count": 140000, "share_of_active": 0.28},
            {"label": "2–4",        "min_activities": 2, "member_count": 185000, "share_of_active": 0.37},
            {"label": "5–9",        "min_activities": 5, "member_count": 110000, "share_of_active": 0.22},
            {"label": "10+",        "min_activities": 10,"member_count": 65000,  "share_of_active": 0.13},
        ],
        "depth_history": [
            {"month": m, "avg_activities_per_member": 3.0 + i * 0.08}
            for i, m in enumerate(months_18)
        ],
        "activity_type_stats": [
            {"raw_type": "survey",           "live_count": 280, "assigned_members": 75000, "completed_members": 60000, "completion_rate": 0.80},
            {"raw_type": "screener",         "live_count": 90,  "assigned_members": 40000, "completed_members": 32000, "completion_rate": 0.80},
            {"raw_type": "in_home_use_test", "live_count": 80,  "assigned_members": 12000, "completed_members": 10560, "completion_rate": 0.88},
            {"raw_type": "concept_test",     "live_count": 30,  "assigned_members": 10000, "completed_members":  7500, "completion_rate": 0.75},
            {"raw_type": "daily_engagement", "live_count": 60,  "assigned_members": 30000, "completed_members": 22500, "completion_rate": 0.75},
        ],
        "activity_completion_trend": [
            {"month": m, "activity_type": "survey-long",  "completion_rate": 0.78 + i * 0.001}
            for i, m in enumerate(months_18[-8:])
        ] + [
            {"month": m, "activity_type": "survey-short", "completion_rate": 0.82 + i * 0.001}
            for i, m in enumerate(months_18[-8:])
        ] + [
            {"month": m, "activity_type": "ihut",         "completion_rate": 0.86 + i * 0.001}
            for i, m in enumerate(months_18[-8:])
        ],
    }


# ─── JSON file assembly ───────────────────────────────────────────────────────

def _build_files(data: dict, source: str, existing_manifest: dict) -> dict[str, Any]:
    """
    Run all transform functions and return a mapping of
    filename → JSON-serializable dict.
    """
    import transforms as t

    data_through = date.today().isoformat()

    return {
        "manifest.json":            t.make_manifest(source, data_through, existing_manifest),
        "p0-metrics.json":          t.make_p0_metrics(data),
        "member-lifecycle.json":    t.make_member_lifecycle(data),
        "activation.json":          t.make_activation(data),
        "cohort-retention.json":    t.make_cohort_retention(data),
        "participation-depth.json": t.make_participation_depth(data),
        "activity-supply.json":     t.make_activity_supply(data),
        "activity-mix.json":        t.make_activity_mix(data),
        "activity-performance.json": t.make_activity_performance(data),
        "experiments.json":         t.make_experiments(),
    }


# ─── Atomic write ─────────────────────────────────────────────────────────────

def _write_tmp(files: dict[str, Any]) -> None:
    """Write all JSON files to data_tmp/."""
    if DATA_TMP.exists():
        shutil.rmtree(DATA_TMP)
    DATA_TMP.mkdir()

    for filename, content in files.items():
        path = DATA_TMP / filename
        path.write_text(json.dumps(content, indent=2, ensure_ascii=False), encoding="utf-8")
        logger.debug("  Wrote %s (%d bytes)", filename, path.stat().st_size)

    logger.info("Wrote %d files to %s/", len(files), DATA_TMP.name)


def _validate_tmp() -> bool:
    """
    Run the Node.js data validator against data_tmp/ by temporarily
    symlinking it to data/ then restoring. Returns True on pass.

    Simpler approach: run a Python schema sanity-check only, and let the
    full Node.js validator run after the swap (where it expects data/).
    """
    errors: list[str] = []

    def _require(cond: bool, msg: str):
        if not cond:
            errors.append(msg)

    # manifest.json checks
    m = json.loads((DATA_TMP / "manifest.json").read_text())
    _require(m.get("schemaVersion") == "1.0", "manifest: schemaVersion != '1.0'")
    _require(m.get("source") in ("live", "synthetic"), "manifest: invalid source")
    _require(bool(m.get("dataThrough")), "manifest: missing dataThrough")

    # p0-metrics.json checks
    p0 = json.loads((DATA_TMP / "p0-metrics.json").read_text())
    p0_keys = ["totalMembers", "monthlyActiveMembers", "highlyEngagedMembers",
               "newMemberActivationRate", "repeatParticipationRate", "activitySupplyCoverage"]
    for key in p0_keys:
        _require(key in p0, f"p0-metrics: missing {key}")
        if key in p0:
            snap = p0[key]
            _require(isinstance(snap.get("current"), (int, float)),
                     f"p0-metrics.{key}: current not a number")
            _require(isinstance(snap.get("history"), list),
                     f"p0-metrics.{key}: history not an array")

    rate_keys = ["newMemberActivationRate", "repeatParticipationRate", "activitySupplyCoverage"]
    for key in rate_keys:
        if key in p0:
            val = p0[key].get("current", -1)
            _require(0.0 <= val <= 1.0, f"p0-metrics.{key}.current={val} out of [0,1]")

    # All required files present
    required = ["manifest.json", "p0-metrics.json", "member-lifecycle.json",
                "activation.json", "cohort-retention.json", "participation-depth.json",
                "activity-supply.json", "activity-mix.json", "activity-performance.json",
                "experiments.json"]
    for f in required:
        _require((DATA_TMP / f).exists(), f"Missing required file: {f}")

    if errors:
        for e in errors:
            logger.error("  VALIDATION: %s", e)
        return False

    logger.info("Pre-swap validation passed (%d checks)", len(required) + len(p0_keys) + 3)
    return True


def _swap_data(keep_backup: bool) -> None:
    """
    Atomically replace data/ with data_tmp/.
    Backs up existing data/ to .data_backup/ first.
    """
    # Remove stale backup
    if DATA_BACKUP.exists():
        shutil.rmtree(DATA_BACKUP)

    # Back up current data
    if DATA_DIR.exists():
        shutil.copytree(DATA_DIR, DATA_BACKUP)
        logger.info("Backed up data/ → %s/", DATA_BACKUP.name)

    # Swap
    if DATA_DIR.exists():
        shutil.rmtree(DATA_DIR)
    DATA_TMP.rename(DATA_DIR)
    logger.info("Swapped data_tmp/ → data/")


def _restore_backup() -> None:
    """Restore data/ from .data_backup/ on failure."""
    if not DATA_BACKUP.exists():
        logger.warning("No backup found — cannot restore previous data.")
        return
    if DATA_DIR.exists():
        shutil.rmtree(DATA_DIR)
    shutil.copytree(DATA_BACKUP, DATA_DIR)
    logger.info("Restored data/ from %s/", DATA_BACKUP.name)


def _run_node_validator() -> bool:
    """Run the full TypeScript data validator (34 checks). Returns True on pass."""
    node_cmd = shutil.which("node")
    if not node_cmd:
        logger.warning("node not found — skipping Node.js validation.")
        return True  # non-fatal: Python pre-check already passed

    validate_script = REPO_ROOT / "scripts" / "validate-data.ts"
    if not validate_script.exists():
        logger.warning("scripts/validate-data.ts not found — skipping.")
        return True

    result = subprocess.run(
        [node_cmd, "--experimental-strip-types", str(validate_script)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    print(result.stdout)
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        return False
    return True


# ─── Summary report ───────────────────────────────────────────────────────────

def _print_summary(source: str, files: dict, p0: dict) -> None:
    """Print a concise summary of what was written."""
    width = 60
    print()
    print("─" * width)
    print(f"  MMC Dashboard refresh complete")
    print(f"  Source:      {source}")
    print(f"  Date:        {date.today()}")
    print()

    print("  P0 Metrics:")
    labels = {
        "totalMembers":            "Total Members",
        "monthlyActiveMembers":    "Monthly Active Members",
        "highlyEngagedMembers":    "Highly Engaged Members",
        "newMemberActivationRate": "New Member Activation Rate",
        "repeatParticipationRate": "Repeat Participation Rate",
        "activitySupplyCoverage":  "Activity Supply Coverage",
    }
    for key, label in labels.items():
        snap = p0.get(key, {})
        val = snap.get("current", "—")
        hist_len = len(snap.get("history", []))
        hist_note = f"({hist_len} history pts)" if hist_len else "(no history)"
        if isinstance(val, float) and val <= 1.0:
            val_str = f"{val:.1%}"
        else:
            val_str = f"{val:,.0f}" if isinstance(val, (int, float)) else str(val)
        arrow = {"up": "↑", "down": "↓", "flat": "→"}.get(snap.get("direction", ""), " ")
        print(f"    {arrow} {label:<34} {val_str:>10}  {hist_note}")

    print()
    print("  Data gaps (expected, not errors):")
    print("    ✗ activitySupplyCoverage.history  — no point-in-time snapshots")
    print("    ✗ activation.joinFlowCompletionRate  — join_flow table absent")
    print("    ✗ experiments.json  — manually curated (file left empty)")
    print()
    print("  Next steps:")
    print("    1. Review data/*.json (inspect numbers, check for PII)")
    print("    2. Manually update data/experiments.json if needed")
    print("    3. When satisfied: git add data/ && git commit")
    print("─" * width)
    print()


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    args = _parse_args()
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    print()
    print("╔══════════════════════════════════════════════╗")
    print("║  MMC Dashboard — Real-Data Refresh Tool      ║")
    print("╚══════════════════════════════════════════════╝")
    print()

    # Load existing manifest to preserve editorial content
    existing_manifest: dict = {}
    manifest_path = DATA_DIR / "manifest.json"
    if manifest_path.exists():
        try:
            existing_manifest = json.loads(manifest_path.read_text())
        except Exception:
            pass

    # ── Fetch data ────────────────────────────────────────────────────────────
    if args.dry_run:
        logger.info("DRY RUN — using fixture data (no BigQuery).")
        data = _get_fixture()
        source = "synthetic"
    else:
        _verify_adc()
        logger.info("Fetching live data from %s.%s", args.project, args.dataset)
        data = _fetch_live(args.project, args.dataset)
        source = "live"

    # ── Transform → JSON ──────────────────────────────────────────────────────
    logger.info("Running transforms…")
    try:
        files = _build_files(data, source, existing_manifest)
    except Exception as exc:
        logger.error("Transform failed: %s", exc)
        logger.exception("Full traceback:")
        sys.exit(1)

    # ── Write to data_tmp/ ────────────────────────────────────────────────────
    _write_tmp(files)

    # ── Pre-swap validation ───────────────────────────────────────────────────
    logger.info("Validating data_tmp/ before swap…")
    if not _validate_tmp():
        logger.error("Pre-swap validation failed — no data was changed.")
        shutil.rmtree(DATA_TMP, ignore_errors=True)
        sys.exit(1)

    # ── Atomic swap ───────────────────────────────────────────────────────────
    _swap_data(args.keep_backup)

    # ── Node.js post-swap validation ──────────────────────────────────────────
    logger.info("Running full Node.js validator on data/…")
    if not _run_node_validator():
        logger.error("Node.js validation failed — restoring previous data.")
        _restore_backup()
        sys.exit(1)

    # ── Cleanup and summary ───────────────────────────────────────────────────
    if not args.keep_backup and DATA_BACKUP.exists():
        shutil.rmtree(DATA_BACKUP)
        logger.debug("Removed %s/", DATA_BACKUP.name)

    p0 = files.get("p0-metrics.json", {})
    _print_summary(source, files, p0)


if __name__ == "__main__":
    main()
