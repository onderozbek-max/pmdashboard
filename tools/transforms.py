"""
Transform raw BigQuery query results into the dashboard's JSON data contract.

Each make_* function accepts a data dict (keyed by query name) and returns
a JSON-serializable dict matching the corresponding data/*.json schema.

All outputs contain only aggregated counts and rates — no community_user_id
or other PII.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


# ─── Utilities ────────────────────────────────────────────────────────────────

def _safe_float(val: Any, default: float = 0.0) -> float:
    try:
        if val is None:
            return default
        return round(float(val), 6)
    except (TypeError, ValueError):
        return default


def _safe_int(val: Any, default: int = 0) -> int:
    try:
        if val is None:
            return default
        return int(round(float(val)))
    except (TypeError, ValueError):
        return default


def _direction(current: float, prior: float, noise_floor_pct: float = 0.005) -> str:
    """Return 'up'|'down'|'flat' based on relative change."""
    if prior == 0:
        return 'up' if current > 0 else 'flat'
    pct = (current - prior) / abs(prior)
    if abs(pct) < noise_floor_pct:
        return 'flat'
    return 'up' if pct > 0 else 'down'


def _pct_change(current: float, prior: float) -> float:
    if prior == 0:
        return 0.0
    return round((current - prior) / abs(prior), 4)


def _today_str() -> str:
    return date.today().isoformat()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _last_complete_month() -> str:
    """Return YYYY-MM for the most recently completed full calendar month."""
    today = date.today()
    if today.month == 1:
        return f"{today.year - 1}-12"
    return f"{today.year}-{today.month - 1:02d}"


# ─── manifest.json ────────────────────────────────────────────────────────────

def make_manifest(source: str, data_through: str, existing: dict | None = None) -> dict:
    """
    Build manifest.json.

    Preserves targets and annotations from the existing manifest so editorial
    content (goals, launch annotations) is not destroyed on each refresh.
    source must be 'live' for real data or 'synthetic' for dry-run.
    """
    existing = existing or {}
    return {
        "schemaVersion": "1.0",
        "source": source,
        "dataThrough": data_through,
        "generatedAt": _now_iso(),
        "freshnessThresholdHours": 72,
        "currentPeriodLabel": "vs. last month",
        "priorPeriodLabel": "Prior month",
        # Preserve editorial content from existing manifest
        "targets": existing.get("targets", {
            "monthlyActiveMembers":   {"value": 95000,  "byDate": "2026-12-31"},
            "newMemberActivationRate": {"value": 0.72,  "byDate": "2026-12-31"},
            "highlyEngagedMembers":   {"value": 22000,  "byDate": "2026-12-31"},
        }),
        "annotations": existing.get("annotations", []),
    }


# ─── p0-metrics.json ──────────────────────────────────────────────────────────

def make_p0_metrics(data: dict) -> dict:
    """
    Build p0-metrics.json from raw BQ results.

    data keys expected:
      total_members_snapshot  dict   {total_members: int}
      total_members_history   list   [{month, total_members}]
      kpi_snapshot            dict   {mau, highly_engaged, ...}
      engagement_trend        list   [{month, mau, highly_engaged, ...}]
      activation_rate         list   [{month, cohort_size, activated_count, activation_rate}]
      repeat_rate             list   [{month, mau, repeat_participants, repeat_participation_rate}]
      supply_coverage         dict   {mau_count, covered_count, zero_available_count, avg_eligible_per_member}
    """
    out = {}

    # ── totalMembers ──────────────────────────────────────────────────────────
    tm_snap = data.get("total_members_snapshot") or {}
    tm_hist = data.get("total_members_history") or []

    current_total = _safe_int(tm_snap.get("total_members"))
    prior_total = _safe_int(tm_hist[-2]["total_members"]) if len(tm_hist) >= 2 else 0

    out["totalMembers"] = {
        "current":   current_total,
        "prior":     prior_total,
        "change":    current_total - prior_total,
        "changePct": _pct_change(current_total, prior_total),
        "direction": _direction(current_total, prior_total, noise_floor_pct=0.002),
        "history":   [
            {"date": r["month"], "value": _safe_int(r["total_members"])}
            for r in tm_hist
        ],
    }

    # ── monthlyActiveMembers ──────────────────────────────────────────────────
    # mmc_business_metrics.active_members = total is_active=TRUE count, not MAU.
    # Real MAU = distinct assignment completers per month, from engagement_trend.
    # Use last COMPLETE calendar month only — the current partial month produces a
    # false MoM drop mid-month (e.g. Aug 25 shows Aug actives << July actives).
    trend = data.get("engagement_trend") or []
    last_complete = _last_complete_month()           # e.g. "2026-07" on Aug 25
    complete_trend = [r for r in trend if r.get("month", "") <= last_complete]

    current_mau = _safe_int(complete_trend[-1]["mau"]) if complete_trend else 0
    prior_mau   = _safe_int(complete_trend[-2]["mau"]) if len(complete_trend) >= 2 else 0
    # History uses complete months only so the chart is consistent with .current.
    # Partial current month is excluded — showing it would create a number inconsistency
    # (partial Aug > complete Jul) that implies a trend the KPI doesn't reflect.
    mau_history = [{"date": r["month"], "value": _safe_int(r["mau"])} for r in complete_trend]

    out["monthlyActiveMembers"] = {
        "current":   current_mau,
        "prior":     prior_mau,
        "change":    current_mau - prior_mau,
        "changePct": _pct_change(current_mau, prior_mau),
        "direction": _direction(current_mau, prior_mau),
        "history":   mau_history,
    }

    # ── highlyEngagedMembers ──────────────────────────────────────────────────
    # Use the last COMPLETE calendar month from engagement_trend (same window as MAU).
    # kpi_snapshot["highly_engaged"] uses a rolling 30-day window which differs from MAU's
    # calendar-month window — mixing them produced a denominator mismatch vs Participation
    # Depth (depth total 35,290 ≠ MAU 29,013 because depth used rolling-30d, MAU used calendar).
    current_he = _safe_int(complete_trend[-1]["highly_engaged"]) if complete_trend else 0
    prior_he   = _safe_int(complete_trend[-2]["highly_engaged"]) if len(complete_trend) >= 2 else 0
    # History: complete months only, consistent with .current (same fix as MAU history).
    he_history = [{"date": r["month"], "value": _safe_int(r["highly_engaged"])} for r in complete_trend]

    out["highlyEngagedMembers"] = {
        "current":   current_he,
        "prior":     prior_he,
        "change":    current_he - prior_he,
        "changePct": _pct_change(current_he, prior_he),
        "direction": _direction(current_he, prior_he),
        "history":   he_history,
    }

    # ── newMemberActivationRate ───────────────────────────────────────────────
    act_rows = data.get("activation_rate") or []
    # Only use cohorts old enough that 14-day window has closed
    # i.e., cohort month != current month (in-progress cohorts are misleading)
    current_month = _last_complete_month()
    act_rows_closed = [r for r in act_rows if r.get("month", "") <= current_month]

    current_act = _safe_float(act_rows_closed[-1]["activation_rate"]) if act_rows_closed else 0.0
    prior_act = _safe_float(act_rows_closed[-2]["activation_rate"]) if len(act_rows_closed) >= 2 else 0.0
    act_history = [
        {"date": r["month"], "value": round(_safe_float(r["activation_rate"]), 4)}
        for r in act_rows_closed
    ]

    out["newMemberActivationRate"] = {
        "current":   round(current_act, 4),
        "prior":     round(prior_act, 4),
        "change":    round(current_act - prior_act, 4),
        "changePct": _pct_change(current_act, prior_act),
        "direction": _direction(current_act, prior_act),
        "history":   act_history,
    }

    # ── repeatParticipationRate ───────────────────────────────────────────────
    rpt_rows = data.get("repeat_rate") or []
    rpt_rows_closed = [r for r in rpt_rows if r.get("month", "") <= current_month]

    current_rpt = _safe_float(rpt_rows_closed[-1]["repeat_participation_rate"]) if rpt_rows_closed else 0.0
    prior_rpt = _safe_float(rpt_rows_closed[-2]["repeat_participation_rate"]) if len(rpt_rows_closed) >= 2 else 0.0
    rpt_history = [
        {"date": r["month"], "value": round(_safe_float(r["repeat_participation_rate"]), 4)}
        for r in rpt_rows_closed
    ]

    out["repeatParticipationRate"] = {
        "current":   round(current_rpt, 4),
        "prior":     round(prior_rpt, 4),
        "change":    round(current_rpt - prior_rpt, 4),
        "changePct": _pct_change(current_rpt, prior_rpt),
        "direction": _direction(current_rpt, prior_rpt),
        "history":   rpt_history,
    }

    # ── activitySupplyCoverage ────────────────────────────────────────────────
    cov = data.get("supply_coverage") or {}
    mau_count = _safe_int(cov.get("mau_count", 1)) or 1  # avoid div-by-zero
    covered = _safe_int(cov.get("covered_count"))
    current_cov = round(covered / mau_count, 4) if mau_count else 0.0

    # History and prior are BLOCKED: no point-in-time LIVE status snapshots exist.
    # See bq_queries.py::query_activity_supply_coverage for explanation.
    # prior/change/changePct are null (not 0) to prevent the UI from showing a
    # false "+0pp" change — null renders as "—" and correctly signals no comparison.
    out["activitySupplyCoverage"] = {
        "current":   current_cov,
        "prior":     None,   # no historical snapshot → no comparison available
        "change":    None,
        "changePct": None,
        "direction": "flat",
        # NOTE: history unavailable. Trend chart renders "not yet available" state.
        "history":   [],
    }

    return out


# ─── member-lifecycle.json ────────────────────────────────────────────────────

def make_member_lifecycle(data: dict) -> dict:
    """
    Build member-lifecycle.json.

    Funnel stages come from query_member_funnel (all-time).
    mauHistory uses complete calendar months only — consistent with P0 MAU definition.

    The member_funnel query's "Highly Engaged" CTE uses the same rolling-30d window
    as the old kpi_snapshot HE value. We use it here for the lifecycle stage because
    the funnel is a current-state snapshot, not a monthly aggregate. This is intentionally
    different from the P0 highlyEngagedMembers metric (which now uses the last complete
    calendar month for MoM comparability). The distinction is documented in STAGE_TOOLTIPS.
    """
    funnel = {r["stage"]: r["member_count"] for r in (data.get("member_funnel") or [])}
    trend = data.get("engagement_trend") or []
    last_complete = _last_complete_month()
    complete_trend = [r for r in trend if r.get("month", "") <= last_complete]

    stages = [
        {"stage": "Joined",        "count": _safe_int(funnel.get("Joined"))},
        {"stage": "Activated",     "count": _safe_int(funnel.get("Activated"))},
        {"stage": "Participated",  "count": _safe_int(funnel.get("Participated"))},
        {"stage": "Repeated",      "count": _safe_int(funnel.get("Repeated"))},
        {"stage": "Highly Engaged","count": _safe_int(funnel.get("Highly Engaged"))},
    ]

    # History: complete months only so the chart aligns with P0 MAU current value.
    mau_history = [
        {"date": r["month"], "value": _safe_int(r["mau"])}
        for r in complete_trend
    ]

    return {"stages": stages, "mauHistory": mau_history}


# ─── activation.json ─────────────────────────────────────────────────────────

def make_activation(data: dict) -> dict:
    """
    Build activation.json.

    joinFlowCompletionRate is NOT available in BigQuery (no join_flow table).
    It is set to null here. The dashboard should render "Data unavailable" for
    this field in live mode.
    """
    funnel_rows = data.get("activation_funnel_30d") or []
    step_map = {r["step"]: r for r in funnel_rows}

    joined_n    = _safe_int((step_map.get("Joined Community") or {}).get("count"))
    onboarded_n = _safe_int((step_map.get("Completed Onboarding") or {}).get("count"))
    first_res_n = _safe_int((step_map.get("First Research Activity") or {}).get("count"))
    # TTFV comes from research step (days from join to first research completion).
    # "First Participation (any)" step removed: counting onboarding activities made
    # it structurally ≥ "Completed Onboarding" — an impossible funnel direction.
    ttfv_median = _safe_float((step_map.get("First Research Activity") or {}).get("median_days"))

    def conv_from_top(n: int) -> float:
        return round(n / joined_n, 4) if joined_n else 0.0

    def conv_from_prior(n: int, prior: int) -> float | None:
        return round(n / prior, 4) if prior else None

    steps = [
        {
            "step": "Joined Community",
            "count": joined_n,
            "conversionFromTop": 1.0,
            "conversionFromPrior": 1.0,
        },
        {
            "step": "Completed Onboarding",
            "count": onboarded_n,
            "conversionFromTop": conv_from_top(onboarded_n),
            "conversionFromPrior": conv_from_prior(onboarded_n, joined_n),
        },
        {
            "step": "First Research Activity",
            "count": first_res_n,
            "conversionFromTop": conv_from_top(first_res_n),
            "conversionFromPrior": conv_from_prior(first_res_n, onboarded_n),
            "medianDaysFromJoin": round(ttfv_median, 1) if ttfv_median else None,
        },
    ]

    return {
        "cohortLabel":                         _last_complete_month(),
        "steps":                               steps,
        "newMembersThisPeriod":                joined_n,
        "joinFlowCompletionRate":              None,      # no join_flow table in schema
        "onboardingCompletionRate":            conv_from_top(onboarded_n),
        "medianDaysToFirstParticipation":      round(ttfv_median, 1) if ttfv_median else None,
        "firstResearchActivityCompletionRate": conv_from_top(first_res_n),
    }


# ─── cohort-retention.json ────────────────────────────────────────────────────

def make_cohort_retention(data: dict) -> dict:
    """
    Build cohort-retention.json.

    Pivots raw (cohort_month, day_bucket, retention_pct) rows into cohort objects
    with w1/w2/w4/w8/w12 fields.

    Day → week mapping:
      d7  → w1, d14 → w2, d30 → w4, d56 → w8, d84 → w12
    """
    raw = data.get("retention_cohorts") or []

    _BUCKET_TO_WEEK = {7: "w1", 14: "w2", 30: "w4", 56: "w8", 84: "w12"}
    cohorts: dict[str, dict] = {}

    for row in raw:
        month = row.get("cohort_month")
        if not month:
            continue
        if month not in cohorts:
            cohorts[month] = {
                "cohortLabel": month,
                "startDate": month,
                "startSize": _safe_int(row.get("cohort_size")),
                "w1": None, "w2": None, "w4": None, "w8": None, "w12": None,
            }
        week_key = _BUCKET_TO_WEEK.get(_safe_int(row.get("day_bucket")))
        if week_key:
            val = row.get("retention_pct")
            cohorts[month][week_key] = round(float(val), 4) if val is not None else None

    sorted_cohorts = sorted(cohorts.values(), key=lambda c: c["cohortLabel"])

    def _median(vals: list) -> float | None:
        nums = [v for v in vals if v is not None]
        if not nums:
            return None
        nums.sort()
        mid = len(nums) // 2
        return nums[mid] if len(nums) % 2 else round((nums[mid - 1] + nums[mid]) / 2, 4)

    def _cohort_window_closed(label: str, min_days: int) -> bool:
        """True only if enough days have passed since the end of the cohort month."""
        try:
            from calendar import monthrange
            year, month = map(int, label.split("-"))
            last_day = monthrange(year, month)[1]
            cohort_end = date(year, month, last_day)
            return (date.today() - cohort_end).days >= min_days
        except Exception:
            return False

    # Exclude cohorts whose window hasn't closed yet — they produce artificially low
    # retention values (e.g. an Aug cohort measured on Aug 25 has a low w4 because
    # the 30-day window hasn't elapsed) that drag down the median.
    w2_closed = [c for c in sorted_cohorts if _cohort_window_closed(c["cohortLabel"], 14)]
    w4_closed = [c for c in sorted_cohorts if _cohort_window_closed(c["cohortLabel"], 30)]
    median_w2 = _median([c["w2"] for c in w2_closed])
    median_w4 = _median([c["w4"] for c in w4_closed])

    return {
        "cohorts": sorted_cohorts,
        "medianW2Retention": median_w2,
        "medianW4Retention": median_w4,
    }


# ─── participation-depth.json ─────────────────────────────────────────────────

def make_participation_depth(data: dict) -> dict:
    """
    Build participation-depth.json.

    Buckets come from current-month distribution.
    History is monthly avg activities per active member.
    """
    bucket_rows = data.get("depth_buckets") or []
    hist_rows = data.get("depth_history") or []

    _IS_HE = {"5–9": True, "10+": True}

    buckets = [
        {
            "label": r.get("label", ""),
            "minActivities": _safe_int(r.get("min_activities")),
            "count": _safe_int(r.get("member_count")),
            "shareOfActive": round(_safe_float(r.get("share_of_active")), 4),
            "isHighlyEngaged": _IS_HE.get(r.get("label", ""), False),
        }
        for r in bucket_rows
    ]

    # Normalise shares to sum to 1.0 (floating-point drift)
    total_share = sum(b["shareOfActive"] for b in buckets)
    if total_share > 0 and abs(total_share - 1.0) > 0.01:
        for b in buckets:
            b["shareOfActive"] = round(b["shareOfActive"] / total_share, 4)

    # Total activities per active member for the current month
    total_completions = sum(
        b["count"] * (b["minActivities"] + (0.5 if b["label"] in ("2–4", "5–9") else 0))
        for b in buckets
    )
    total_active = sum(b["count"] for b in buckets)
    activities_per_member = round(total_completions / total_active, 2) if total_active else 0.0

    history = [
        {"date": r["month"], "avgActivitiesPerActiveMember": round(_safe_float(r.get("avg_activities_per_member")), 2)}
        for r in hist_rows
    ]

    return {
        "buckets": buckets,
        "activitiesPerActiveMember": activities_per_member,
        "history": history,
    }


# ─── activity-supply.json ─────────────────────────────────────────────────────

def make_activity_supply(data: dict) -> dict:
    """
    Build activity-supply.json.

    History is empty: no point-in-time LIVE activity status snapshots exist.
    Only the current-snapshot values are computed.
    """
    cov = data.get("supply_coverage") or {}
    mau_count   = _safe_int(cov.get("mau_count", 1)) or 1
    covered     = _safe_int(cov.get("covered_count"))
    zero_avail  = _safe_int(cov.get("zero_available_count"))
    eligible_pm = _safe_float(cov.get("avg_eligible_per_member"))
    coverage_pct = round(covered / mau_count, 4) if mau_count else 0.0

    return {
        "eligibleActivitiesPerMember": round(eligible_pm, 2),
        "membersWithZeroAvailable":    zero_avail,
        "membersWithZeroAvailablePct": round(zero_avail / mau_count, 4) if mau_count else 0.0,
        "activitySupplyCoverage":      coverage_pct,
        # History BLOCKED: no point-in-time LIVE status snapshots.
        # Refresh tool cannot compute past coverage without historical status data.
        "history": [],
    }


# ─── activity-mix.json ────────────────────────────────────────────────────────

def make_activity_mix(data: dict) -> dict:
    """
    Build activity-mix.json.

    Supply share = fraction of live activities by type.
    Completion share = fraction of member-completions by type.
    """
    type_rows = data.get("activity_type_stats") or []
    trend_rows = data.get("activity_completion_trend") or []

    from bq_queries import _ACTIVITY_TYPE_MAP, DASHBOARD_TYPES

    # Aggregate by dashboard key
    supply_totals: dict[str, int] = {}
    completion_totals: dict[str, int] = {}

    for row in type_rows:
        raw = row.get("raw_type", "").lower().strip()
        key = _ACTIVITY_TYPE_MAP.get(raw, "other")
        if key is None:  # excluded type (onboarding)
            continue
        supply_totals[key] = supply_totals.get(key, 0) + _safe_int(row.get("live_count"))
        completion_totals[key] = completion_totals.get(key, 0) + _safe_int(row.get("completed_members"))

    total_supply = max(sum(supply_totals.values()), 1)
    total_completions = max(sum(completion_totals.values()), 1)

    types = [
        {
            "key": dt["key"],
            "label": dt["label"],
            "supplyShare": round(supply_totals.get(dt["key"], 0) / total_supply, 4),
            "completionShare": round(completion_totals.get(dt["key"], 0) / total_completions, 4),
        }
        for dt in DASHBOARD_TYPES
    ]

    # Monthly history: group completion trend by month
    from collections import defaultdict
    monthly: dict[str, dict[str, float]] = defaultdict(dict)
    for row in trend_rows:
        month = row.get("month", "")
        act_key = row.get("activity_type", "other")
        if month:
            monthly[month][act_key] = round(_safe_float(row.get("completion_rate")), 4)

    history = [
        {
            "date": month,
            "types": [
                {"key": dt["key"], "completionShare": vals.get(dt["key"], 0.0)}
                for dt in DASHBOARD_TYPES
            ],
        }
        for month, vals in sorted(monthly.items())
    ]

    return {"types": types, "history": history}


# ─── activity-performance.json ────────────────────────────────────────────────

def make_activity_performance(data: dict) -> dict:
    """
    Build activity-performance.json.

    Completion rate per activity type with monthly trend.
    """
    type_rows = data.get("activity_type_stats") or []
    trend_rows = data.get("activity_completion_trend") or []

    from bq_queries import _ACTIVITY_TYPE_MAP, DASHBOARD_TYPES
    from collections import defaultdict

    # Aggregate current completion rate by dashboard key
    completed_agg: dict[str, int] = {}
    total_agg: dict[str, int] = {}

    for row in type_rows:
        raw = row.get("raw_type", "").lower().strip()
        key = _ACTIVITY_TYPE_MAP.get(raw, "other")
        if key is None:
            continue
        completed_agg[key] = completed_agg.get(key, 0) + _safe_int(row.get("completed_members"))
        total_agg[key] = total_agg.get(key, 0) + _safe_int(row.get("assigned_members"))

    # Monthly trend: {activity_type: [{date, value}]}
    monthly_by_type: dict[str, list] = defaultdict(list)
    for row in sorted(trend_rows, key=lambda r: r.get("month", "")):
        act_key = row.get("activity_type", "other")
        month = row.get("month", "")
        if month:
            monthly_by_type[act_key].append({
                "date": month,
                "value": round(_safe_float(row.get("completion_rate")), 4),
            })

    types = []
    for dt in DASHBOARD_TYPES:
        key = dt["key"]
        completed = completed_agg.get(key, 0)
        total = total_agg.get(key, 0)
        rate = round(completed / total, 4) if total else 0.0
        types.append({
            "key": key,
            "label": dt["label"],
            "totalAvailable": total,
            "totalCompleted": completed,
            "completionRate": rate,
            "avgCompletionRate7d": rate,  # proxy: current snapshot = 7d approximation
            "trend": monthly_by_type.get(key, []),
        })

    return {"types": types}


# ─── experiments.json ─────────────────────────────────────────────────────────

def make_experiments() -> dict:
    """
    Experiments data has no BigQuery source.
    Returns an empty list so the schema validates.
    Experiments should be curated manually in data/experiments.json after refresh.
    """
    return {"experiments": []}
