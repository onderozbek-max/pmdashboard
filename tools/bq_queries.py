"""
BigQuery queries for the MMC Dashboard refresh pipeline.

Table schema reference (sams-mmc-social-prod.prod):
  community_user              community_user_id, is_active BOOL, created_at TIMESTAMP
  assignment                  community_user_id, activity_id, assignment_status
                              (ASSIGNED|STARTED|COMPLETED|CANCELED),
                              user_completed_ts TIMESTAMP, user_started_ts TIMESTAMP
  activity                    activity_id, status_id INT (2=LIVE), points INT
  activity_type               activity_id, type STRING
                              (survey|in_home_use_test|onboarding|screener|
                               concept_test|daily_engagement)
  mmc_business_metrics        active_members, mmc_new_members, live_activities,
                              onboarding_completed_total, onboarding_total,
                              survey_activity_completed_total, survey_activity_total,
                              in_home_use_test_completed_total, in_home_use_test_total,
                              screener_activity_completed_total, screener_activity_total,
                              concept_test_completed_total, concept_test_total,
                              avg_member_tenure, created_ts TIMESTAMP
  mmc_business_metrics_monthly_view
                              month_year STRING (e.g. '2026-Jan'),
                              same activity columns as above (monthly aggregates)

Activity type → dashboard key mapping:
  survey, screener, concept_test  →  research-survey
  in_home_use_test                →  ihut
  daily_engagement                →  other   (quick-poll/trivia subtypes not in schema)
  onboarding                      →  EXCLUDED from participation mix

Known data gaps (documented, not silently filled):
  - activitySupplyCoverage history: no point-in-time LIVE status snapshots → []
  - activity_type quick-poll / trivia: not in current schema → mapped to other
  - w8 / w12 cohort retention: derived as d56 / d84 (56 days ≈ 8 weeks, 84 ≈ 12 weeks)
  - Join flow completion: no join_flow table → null in activation.json
  - Experiments: no BQ source → experiments.json written as [] (manually curated)
"""
import decimal
import logging
from datetime import date, datetime

logger = logging.getLogger(__name__)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _t(project: str, dataset: str, name: str) -> str:
    return f"`{project}.{dataset}.{name}`"


def _coerce(val):
    """Convert BQ-specific types to plain Python types."""
    if isinstance(val, decimal.Decimal):
        return float(val)
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    return val


def _row_to_dict(row) -> dict:
    return {k: _coerce(v) for k, v in zip(row.keys(), [row[k] for k in row.keys()])}


def _run(client, sql: str) -> list:
    return [_row_to_dict(r) for r in client.query(sql).result()]


def _safe_run(client, sql: str, context: str) -> list:
    """Run a query; on failure log and return empty list (non-fatal)."""
    try:
        return _run(client, sql)
    except Exception as exc:
        logger.warning("[%s] query failed: %s", context, exc)
        return []


# ─── Total Members ────────────────────────────────────────────────────────────

def query_total_members_snapshot(client, project: str, dataset: str) -> dict:
    """Current count of active members."""
    sql = f"""
    SELECT COUNT(*) AS total_members
    FROM {_t(project, dataset, 'community_user')}
    WHERE is_active = TRUE
    """
    rows = _run(client, sql)
    return rows[0] if rows else {"total_members": 0}


def query_total_members_history(client, project: str, dataset: str, lookback_days: int) -> list:
    """
    Monthly cumulative active-member count for the past lookback_days.

    Approximation: counts members whose join date falls on or before the last
    day of each historical month AND who are currently is_active=TRUE.
    Members who joined but later deactivated are excluded from all months —
    this slightly undercounts historical totals but is the best available
    without point-in-time snapshots.
    """
    sql = f"""
    WITH months AS (
      SELECT month_start
      FROM UNNEST(GENERATE_DATE_ARRAY(
        DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL {lookback_days} DAY), MONTH),
        DATE_TRUNC(CURRENT_DATE(), MONTH),
        INTERVAL 1 MONTH
      )) AS month_start
    )
    SELECT
      FORMAT_DATE('%Y-%m', m.month_start) AS month,
      COUNT(DISTINCT cu.community_user_id) AS total_members
    FROM months m
    JOIN {_t(project, dataset, 'community_user')} cu
      ON DATE(cu.created_at) <= LAST_DAY(m.month_start)
      AND cu.is_active = TRUE
    GROUP BY month
    ORDER BY month
    """
    return _safe_run(client, sql, "total_members_history")


# ─── KPI Snapshot (current state) ─────────────────────────────────────────────

def query_kpi_snapshot(client, project: str, dataset: str) -> dict:
    """
    Latest numbers from mmc_business_metrics (daily snapshot) plus
    live highly_engaged and WAU computed from assignment table.

    Adapted verbatim from mmc-dashboard/app/services/bigquery.py::query_kpi_snapshot.
    """
    sql = f"""
    WITH
      snapshot AS (
        SELECT
          active_members                                      AS mau,
          mmc_new_members                                     AS new_members,
          SAFE_DIVIDE(survey_activity_completed_total,
                      survey_activity_total)                  AS survey_completion_rate,
          SAFE_DIVIDE(onboarding_completed_total,
                      onboarding_total)                       AS onboarding_completion_rate,
          live_activities,
          avg_member_tenure
        FROM {_t(project, dataset, 'mmc_business_metrics')}
        ORDER BY created_ts DESC LIMIT 1
      ),
      wau_dau AS (
        SELECT
          COUNT(DISTINCT IF(
            DATE(user_completed_ts) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY),
            community_user_id, NULL))                         AS wau,
          COUNT(DISTINCT IF(
            DATE(user_completed_ts) = CURRENT_DATE(),
            community_user_id, NULL))                         AS dau
        FROM {_t(project, dataset, 'assignment')}
        WHERE assignment_status = 'COMPLETED'
          AND user_completed_ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
      ),
      highly_engaged AS (
        SELECT COUNT(DISTINCT community_user_id) AS highly_engaged
        FROM (
          SELECT community_user_id
          FROM {_t(project, dataset, 'assignment')}
          WHERE assignment_status = 'COMPLETED'
            AND user_completed_ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
          GROUP BY community_user_id
          HAVING COUNT(*) >= 5
        )
      ),
      ttfv AS (
        SELECT
          APPROX_QUANTILES(days_to_first, 100)[OFFSET(50)] AS ttfv_median_days
        FROM (
          SELECT
            cu.community_user_id,
            DATE_DIFF(
              MIN(DATE(a.user_completed_ts)), DATE(cu.created_at), DAY
            ) AS days_to_first
          FROM {_t(project, dataset, 'community_user')} cu
          JOIN {_t(project, dataset, 'assignment')} a
            ON cu.community_user_id = a.community_user_id
          JOIN {_t(project, dataset, 'activity_type')} atype
            ON a.activity_id = atype.activity_id
          WHERE a.assignment_status = 'COMPLETED'
            AND atype.type NOT IN ('onboarding', 'daily_engagement', 'daily engagement')
            AND cu.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)
          GROUP BY cu.community_user_id, cu.created_at
        )
      )
    SELECT
      s.mau, w.wau, w.dau, he.highly_engaged,
      s.survey_completion_rate, s.onboarding_completion_rate,
      t.ttfv_median_days, s.live_activities, s.avg_member_tenure
    FROM snapshot s, wau_dau w, highly_engaged he, ttfv t
    """
    rows = _run(client, sql)
    return rows[0] if rows else {}


# ─── Engagement Trend (monthly MAU / HE / WAU) ────────────────────────────────

def query_engagement_trend(client, project: str, dataset: str, lookback_days: int) -> list:
    """
    Monthly MAU, highly_engaged, WAU, and member type breakdown.
    Adapted from mmc-dashboard with extended lookback.

    MAU = distinct members with ≥1 COMPLETED assignment in the month.
    Highly Engaged = members with ≥5 completions in the month.
    WAU = avg weekly actives within the month.
    """
    sql = f"""
    WITH
      member_months AS (
        SELECT
          cu.community_user_id,
          FORMAT_DATE('%Y-%m', DATE(a.user_completed_ts)) AS month,
          MIN(FORMAT_DATE('%Y-%m', DATE(cu.created_at))) OVER
            (PARTITION BY cu.community_user_id)            AS join_month
        FROM {_t(project, dataset, 'assignment')} a
        JOIN {_t(project, dataset, 'community_user')} cu
          ON a.community_user_id = cu.community_user_id
        WHERE a.assignment_status = 'COMPLETED'
          AND a.user_completed_ts >=
              TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {lookback_days} DAY)
        GROUP BY cu.community_user_id, month, cu.created_at
      ),
      classified AS (
        SELECT
          curr.month,
          curr.community_user_id,
          CASE
            WHEN curr.join_month = curr.month               THEN 'new'
            WHEN prev.community_user_id IS NOT NULL         THEN 'retained'
            ELSE 'resurrected'
          END AS member_type
        FROM member_months curr
        LEFT JOIN member_months prev
          ON curr.community_user_id = prev.community_user_id
          AND prev.month = FORMAT_DATE('%Y-%m',
              DATE_SUB(PARSE_DATE('%Y-%m', curr.month), INTERVAL 1 MONTH))
      ),
      highly_engaged_monthly AS (
        SELECT
          FORMAT_DATE('%Y-%m', DATE(user_completed_ts)) AS month,
          community_user_id
        FROM {_t(project, dataset, 'assignment')}
        WHERE assignment_status = 'COMPLETED'
          AND user_completed_ts >=
              TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {lookback_days} DAY)
        GROUP BY month, community_user_id
        HAVING COUNT(*) >= 5
      ),
      wau_monthly AS (
        SELECT
          FORMAT_DATE('%Y-%m', DATE(user_completed_ts)) AS month,
          COUNT(DISTINCT
            FORMAT_DATE('%Y-%W', DATE(user_completed_ts))
            || '-' || community_user_id)                  AS week_member_pairs,
          COUNT(DISTINCT
            FORMAT_DATE('%Y-%W', DATE(user_completed_ts))) AS week_count
        FROM {_t(project, dataset, 'assignment')}
        WHERE assignment_status = 'COMPLETED'
          AND user_completed_ts >=
              TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {lookback_days} DAY)
        GROUP BY month
      )
    SELECT
      c.month,
      COUNT(DISTINCT c.community_user_id)                            AS mau,
      CAST(SAFE_DIVIDE(
        ANY_VALUE(w.week_member_pairs),
        ANY_VALUE(w.week_count)) AS INT64)                           AS wau,
      COUNT(DISTINCT he.community_user_id)                           AS highly_engaged,
      COUNTIF(c.member_type = 'retained')                            AS retained_mau,
      COUNTIF(c.member_type = 'new')                                 AS new_mau,
      COUNTIF(c.member_type = 'resurrected')                         AS resurrected_mau
    FROM classified c
    LEFT JOIN highly_engaged_monthly he
      ON c.month = he.month AND c.community_user_id = he.community_user_id
    LEFT JOIN wau_monthly w ON c.month = w.month
    GROUP BY c.month
    ORDER BY c.month
    """
    return _safe_run(client, sql, "engagement_trend")


# ─── New Member Activation Rate (14-day window) ───────────────────────────────

def query_new_member_activation_rate(client, project: str, dataset: str,
                                     lookback_days: int) -> list:
    """
    For each join-month cohort: fraction who completed ≥1 non-onboarding
    assignment within 14 days of joining.

    Definition difference from old pipeline: old used 7-day window.
    New dashboard spec requires 14-day window (NEW_MEMBER_ACTIVATION_WINDOW_DAYS=14).

    Excludes onboarding and daily_engagement types — only research activities
    count as "activation" for this metric.
    """
    sql = f"""
    WITH
      new_members AS (
        SELECT
          community_user_id,
          DATE(created_at) AS join_date,
          FORMAT_DATE('%Y-%m', DATE(created_at)) AS month
        FROM {_t(project, dataset, 'community_user')}
        WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {lookback_days} DAY)
      ),
      activations AS (
        SELECT DISTINCT a.community_user_id
        FROM {_t(project, dataset, 'assignment')} a
        JOIN {_t(project, dataset, 'activity_type')} atype
          ON a.activity_id = atype.activity_id
        JOIN new_members m ON a.community_user_id = m.community_user_id
        WHERE a.assignment_status = 'COMPLETED'
          AND atype.type NOT IN ('onboarding', 'daily_engagement', 'daily engagement')
          AND DATE_DIFF(DATE(a.user_completed_ts), m.join_date, DAY) BETWEEN 0 AND 14
      )
    SELECT
      m.month,
      COUNT(DISTINCT m.community_user_id) AS cohort_size,
      COUNT(DISTINCT act.community_user_id) AS activated_count,
      SAFE_DIVIDE(
        COUNT(DISTINCT act.community_user_id),
        COUNT(DISTINCT m.community_user_id)
      ) AS activation_rate
    FROM new_members m
    LEFT JOIN activations act ON m.community_user_id = act.community_user_id
    GROUP BY m.month
    ORDER BY m.month
    """
    return _safe_run(client, sql, "new_member_activation_rate")


# ─── Repeat Participation Rate (30-day rolling window) ───────────────────────

def query_repeat_participation_rate(client, project: str, dataset: str,
                                    lookback_days: int) -> list:
    """
    Monthly: fraction of MAU members who completed ≥2 activities in the month.

    Matches REPEAT_PARTICIPATION_MIN_EVENTS=2 and
    REPEAT_PARTICIPATION_WINDOW_DAYS=30 from src/metrics/definitions.ts.

    Uses calendar month as the 30-day window proxy. The slight difference
    (calendar month vs. rolling 30 days) is negligible at this scale.
    """
    sql = f"""
    WITH monthly_completions AS (
      SELECT
        FORMAT_DATE('%Y-%m', DATE(user_completed_ts)) AS month,
        community_user_id,
        COUNT(*) AS activity_count
      FROM {_t(project, dataset, 'assignment')}
      WHERE assignment_status = 'COMPLETED'
        AND user_completed_ts >=
            TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {lookback_days} DAY)
      GROUP BY month, community_user_id
    )
    SELECT
      month,
      COUNT(DISTINCT CASE WHEN activity_count >= 1 THEN community_user_id END) AS mau,
      COUNT(DISTINCT CASE WHEN activity_count >= 2 THEN community_user_id END) AS repeat_participants,
      SAFE_DIVIDE(
        COUNT(DISTINCT CASE WHEN activity_count >= 2 THEN community_user_id END),
        COUNT(DISTINCT CASE WHEN activity_count >= 1 THEN community_user_id END)
      ) AS repeat_participation_rate
    FROM monthly_completions
    GROUP BY month
    ORDER BY month
    """
    return _safe_run(client, sql, "repeat_participation_rate")


# ─── Activity Supply Coverage (current, 7-day window) ────────────────────────

def query_activity_supply_coverage(client, project: str, dataset: str) -> dict:
    """
    Fraction of MAU members who have ≥1 eligible (LIVE) activity currently
    assigned (ASSIGNED or STARTED status) to them.

    Window: MAU = completed ≥1 activity in past 30 days.
    Eligible = activity with status_id=2 (LIVE) and assignment status IN
               ('ASSIGNED', 'STARTED') — i.e., available but not yet completed.

    Historical supply coverage is BLOCKED: no point-in-time LIVE status
    snapshots exist in the schema. Only current values are reported.
    """
    sql = f"""
    WITH
      mau AS (
        SELECT DISTINCT community_user_id
        FROM {_t(project, dataset, 'assignment')}
        WHERE assignment_status = 'COMPLETED'
          AND user_completed_ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
      ),
      live_assignments AS (
        SELECT
          a.community_user_id,
          COUNT(DISTINCT a.activity_id) AS live_activity_count
        FROM {_t(project, dataset, 'assignment')} a
        JOIN {_t(project, dataset, 'activity')} act
          ON a.activity_id = act.activity_id
        JOIN mau m ON a.community_user_id = m.community_user_id
        WHERE act.status_id = 2
          AND a.assignment_status IN ('ASSIGNED', 'STARTED')
        GROUP BY a.community_user_id
      )
    SELECT
      COUNT(DISTINCT m.community_user_id)             AS mau_count,
      COUNT(DISTINCT la.community_user_id)             AS covered_count,
      COUNT(DISTINCT m.community_user_id)
        - COUNT(DISTINCT la.community_user_id)         AS zero_available_count,
      SAFE_DIVIDE(
        SUM(COALESCE(la.live_activity_count, 0)),
        COUNT(DISTINCT m.community_user_id)
      )                                                AS avg_eligible_per_member
    FROM mau m
    LEFT JOIN live_assignments la ON m.community_user_id = la.community_user_id
    """
    rows = _safe_run(client, sql, "activity_supply_coverage")
    return rows[0] if rows else {}


# ─── Member Funnel (all-time) ─────────────────────────────────────────────────

def query_member_funnel(client, project: str, dataset: str) -> list:
    """
    All-time member funnel steps.
    Adapted verbatim from mmc-dashboard/app/services/bigquery.py::query_member_funnel.

    Step mapping to lifecycle stages:
      step 1  = Joined (total active members)
      step 3  = Activated (completed onboarding S1)
      step 6  = Participated (first research survey completed)
      step 7  = Repeated (2nd research survey completed)
      step 8  = Highly Engaged (5+ acts in last 30 days)
    """
    sql = f"""
    WITH
      total_members AS (
        SELECT COUNT(*) AS n
        FROM {_t(project, dataset, 'community_user')}
        WHERE is_active = TRUE
      ),
      onboard_comps AS (
        SELECT a.community_user_id,
          ROW_NUMBER() OVER (
            PARTITION BY a.community_user_id ORDER BY a.user_completed_ts
          ) AS seq
        FROM {_t(project, dataset, 'assignment')} a
        JOIN {_t(project, dataset, 'activity_type')} atype
          ON a.activity_id = atype.activity_id
        WHERE a.assignment_status = 'COMPLETED'
          AND atype.type = 'onboarding'
      ),
      onboard_starts AS (
        SELECT a.community_user_id,
          ROW_NUMBER() OVER (
            PARTITION BY a.community_user_id
            ORDER BY COALESCE(a.user_started_ts, a.user_completed_ts)
          ) AS seq
        FROM {_t(project, dataset, 'assignment')} a
        JOIN {_t(project, dataset, 'activity_type')} atype
          ON a.activity_id = atype.activity_id
        WHERE atype.type = 'onboarding'
          AND a.assignment_status IN ('STARTED', 'COMPLETED')
      ),
      research AS (
        SELECT a.community_user_id,
          COUNT(*) AS research_count
        FROM {_t(project, dataset, 'assignment')} a
        JOIN {_t(project, dataset, 'activity_type')} atype
          ON a.activity_id = atype.activity_id
        WHERE a.assignment_status = 'COMPLETED'
          AND atype.type NOT IN ('onboarding', 'daily_engagement', 'daily engagement')
        GROUP BY a.community_user_id
      ),
      highly_engaged AS (
        SELECT COUNT(DISTINCT community_user_id) AS n
        FROM (
          SELECT community_user_id
          FROM {_t(project, dataset, 'assignment')}
          WHERE assignment_status = 'COMPLETED'
            AND user_completed_ts >=
                TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
          GROUP BY community_user_id HAVING COUNT(*) >= 5
        )
      ),
      steps AS (
        SELECT 1 AS step_order, 'Joined'           AS stage, (SELECT n FROM total_members) AS n
        UNION ALL
        SELECT 3, 'Activated',
          (SELECT COUNT(DISTINCT community_user_id) FROM onboard_comps WHERE seq = 1)
        UNION ALL
        SELECT 6, 'Participated',
          (SELECT COUNT(DISTINCT community_user_id) FROM research WHERE research_count >= 1)
        UNION ALL
        SELECT 7, 'Repeated',
          (SELECT COUNT(DISTINCT community_user_id) FROM research WHERE research_count >= 2)
        UNION ALL
        SELECT 8, 'Highly Engaged',
          (SELECT n FROM highly_engaged)
      )
    SELECT step_order, stage, n AS member_count,
      SAFE_DIVIDE(n, FIRST_VALUE(n) OVER (ORDER BY step_order)) AS conversion_from_top
    FROM steps
    ORDER BY step_order
    """
    return _safe_run(client, sql, "member_funnel")


# ─── Activation Funnel (current-month cohort) ────────────────────────────────

def query_activation_funnel_30d(client, project: str, dataset: str) -> list:
    """
    Funnel for members who joined in the last 30 days.
    Same structure as member_funnel but cohort-scoped.
    Used for activation.json.

    Note: joinFlowCompletionRate is not available in BQ (no join_flow table).
    """
    sql = f"""
    WITH
      cohort AS (
        SELECT community_user_id, DATE(created_at) AS join_date
        FROM {_t(project, dataset, 'community_user')}
        WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
          AND is_active = TRUE
      ),
      onboard_comps AS (
        SELECT a.community_user_id,
          ROW_NUMBER() OVER (
            PARTITION BY a.community_user_id ORDER BY a.user_completed_ts
          ) AS seq
        FROM {_t(project, dataset, 'assignment')} a
        JOIN {_t(project, dataset, 'activity_type')} atype
          ON a.activity_id = atype.activity_id
        JOIN cohort c ON a.community_user_id = c.community_user_id
        WHERE a.assignment_status = 'COMPLETED'
          AND atype.type = 'onboarding'
      ),
      research AS (
        SELECT a.community_user_id, COUNT(*) AS cnt,
          MIN(DATE_DIFF(DATE(a.user_completed_ts), c.join_date, DAY)) AS days_to_first
        FROM {_t(project, dataset, 'assignment')} a
        JOIN {_t(project, dataset, 'activity_type')} atype
          ON a.activity_id = atype.activity_id
        JOIN cohort c ON a.community_user_id = c.community_user_id
        WHERE a.assignment_status = 'COMPLETED'
          AND atype.type NOT IN ('onboarding', 'daily_engagement', 'daily engagement')
        GROUP BY a.community_user_id
      ),
      cohort_n AS (SELECT COUNT(*) AS n FROM cohort),
      steps AS (
        SELECT 1 AS step_order, 'Joined Community'          AS step, (SELECT n FROM cohort_n) AS n, NULL AS median_days
        UNION ALL
        SELECT 2, 'Completed Onboarding', (SELECT COUNT(DISTINCT community_user_id) FROM onboard_comps WHERE seq = 1), NULL
        UNION ALL
        SELECT 3, 'First Participation',  (SELECT COUNT(DISTINCT community_user_id) FROM research WHERE cnt >= 1),
          (SELECT APPROX_QUANTILES(days_to_first, 100)[OFFSET(50)] FROM research WHERE days_to_first IS NOT NULL)
        UNION ALL
        SELECT 4, 'First Research Activity', (SELECT COUNT(DISTINCT community_user_id) FROM research WHERE cnt >= 1), NULL
      )
    SELECT step_order, step, n AS count, median_days,
      SAFE_DIVIDE(n, FIRST_VALUE(n) OVER (ORDER BY step_order)) AS conversion_from_top
    FROM steps
    ORDER BY step_order
    """
    return _safe_run(client, sql, "activation_funnel_30d")


# ─── Cohort Retention (extended lookback, weekly buckets) ─────────────────────

def query_retention_cohorts(client, project: str, dataset: str,
                            lookback_days: int) -> list:
    """
    Retention rates by join-month cohort.

    Day-bucket to dashboard week mapping:
      d7  → w1  (7 days = 1 week, exact)
      d14 → w2  (14 days = 2 weeks, exact)
      d30 → w4  (30 days ≈ 4.3 weeks — 2-day approximation)
      d56 → w8  (56 days = 8 weeks, exact)
      d84 → w12 (84 days = 12 weeks, exact)

    Extended from mmc-dashboard which only looked back 90 days (3 cohorts).
    """
    sql = f"""
    WITH
      cohorts AS (
        SELECT
          community_user_id,
          FORMAT_DATE('%Y-%m', DATE(created_at)) AS cohort_month,
          DATE(created_at)                        AS join_date
        FROM {_t(project, dataset, 'community_user')}
        WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {lookback_days} DAY)
      ),
      cohort_sizes AS (
        SELECT cohort_month, COUNT(DISTINCT community_user_id) AS cohort_size
        FROM cohorts
        GROUP BY cohort_month
      ),
      completions AS (
        SELECT community_user_id, DATE(user_completed_ts) AS event_date
        FROM {_t(project, dataset, 'assignment')}
        WHERE assignment_status = 'COMPLETED'
      )
    SELECT
      c.cohort_month,
      cs.cohort_size,
      day_bucket,
      SAFE_DIVIDE(
        COUNT(DISTINCT IF(
          comp.event_date IS NOT NULL
          AND DATE_DIFF(comp.event_date, c.join_date, DAY) BETWEEN 1 AND day_bucket,
          c.community_user_id, NULL)),
        cs.cohort_size
      ) AS retention_pct
    FROM cohorts c
    JOIN cohort_sizes cs ON c.cohort_month = cs.cohort_month
    CROSS JOIN UNNEST([7, 14, 30, 56, 84]) AS day_bucket
    LEFT JOIN completions comp ON c.community_user_id = comp.community_user_id
    GROUP BY c.cohort_month, cs.cohort_size, day_bucket
    ORDER BY c.cohort_month, day_bucket
    """
    return _safe_run(client, sql, "retention_cohorts")


# ─── Participation Depth ──────────────────────────────────────────────────────

def query_participation_depth_buckets(client, project: str, dataset: str) -> list:
    """
    Current-month distribution of members by activity count bucket.
    Buckets match dashboard labels: 1, 2–4, 5–9, 10+.
    """
    sql = f"""
    WITH monthly_completions AS (
      SELECT community_user_id, COUNT(*) AS activity_count
      FROM {_t(project, dataset, 'assignment')}
      WHERE assignment_status = 'COMPLETED'
        AND user_completed_ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
      GROUP BY community_user_id
    ),
    total AS (SELECT COUNT(*) AS n FROM monthly_completions),
    buckets AS (
      SELECT
        CASE
          WHEN activity_count = 1         THEN '1 activity'
          WHEN activity_count BETWEEN 2 AND 4 THEN '2–4'
          WHEN activity_count BETWEEN 5 AND 9 THEN '5–9'
          ELSE '10+'
        END AS label,
        MIN(activity_count) AS min_activities,
        COUNT(*) AS member_count
      FROM monthly_completions
      GROUP BY label
    )
    SELECT
      b.label,
      b.min_activities,
      b.member_count,
      SAFE_DIVIDE(b.member_count, t.n) AS share_of_active
    FROM buckets b, total t
    ORDER BY b.min_activities
    """
    return _safe_run(client, sql, "participation_depth_buckets")


def query_participation_depth_history(client, project: str, dataset: str,
                                      lookback_days: int) -> list:
    """Monthly average activities per active member."""
    sql = f"""
    SELECT
      FORMAT_DATE('%Y-%m', DATE(user_completed_ts)) AS month,
      SAFE_DIVIDE(COUNT(*), COUNT(DISTINCT community_user_id)) AS avg_activities_per_member
    FROM {_t(project, dataset, 'assignment')}
    WHERE assignment_status = 'COMPLETED'
      AND user_completed_ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {lookback_days} DAY)
    GROUP BY month
    ORDER BY month
    """
    return _safe_run(client, sql, "participation_depth_history")


# ─── Activity Type Mix and Performance ───────────────────────────────────────

_ACTIVITY_TYPE_MAP = {
    # old schema type → dashboard key
    'survey':                 'research-survey',
    'screener':               'research-survey',  # screeners are research
    'concept_test':           'research-survey',  # concept tests are research
    'concept test':           'research-survey',
    'in_home_use_test':       'ihut',
    'in home use test':       'ihut',
    'daily_engagement':       'other',  # quick-poll/trivia subtypes not in schema
    'daily engagement':       'other',
    'onboarding':             None,     # excluded from participation mix
    'central_location_test':  'other',
}

DASHBOARD_TYPES = [
    {'key': 'research-survey', 'label': 'Research Surveys'},
    {'key': 'ihut',            'label': 'IHUTs'},
    {'key': 'quick-poll',      'label': 'Quick Polls'},
    {'key': 'trivia',          'label': 'Trivia'},
    {'key': 'other',           'label': 'Other'},
]


def query_activity_type_stats(client, project: str, dataset: str) -> list:
    """
    Current live activity count and completion stats per activity type.
    Used for activity-mix.json and activity-performance.json.

    Note: 'quick-poll' and 'trivia' are not present in the schema as distinct
    types; they fall under 'daily_engagement' → mapped to 'other'.
    """
    sql = f"""
    SELECT
      LOWER(atype.type)                                                  AS raw_type,
      COUNT(DISTINCT act.activity_id)                                    AS live_count,
      COUNT(DISTINCT asn.community_user_id)                              AS assigned_members,
      COUNT(DISTINCT IF(asn.assignment_status = 'COMPLETED',
                        asn.community_user_id, NULL))                    AS completed_members,
      SAFE_DIVIDE(
        COUNT(DISTINCT IF(asn.assignment_status = 'COMPLETED',
                          asn.activity_id, NULL)),
        COUNT(DISTINCT act.activity_id)
      )                                                                  AS completion_rate
    FROM {_t(project, dataset, 'activity')} act
    JOIN {_t(project, dataset, 'activity_type')} atype
      ON act.activity_id = atype.activity_id
    LEFT JOIN {_t(project, dataset, 'assignment')} asn
      ON act.activity_id = asn.activity_id
    WHERE act.status_id = 2
    GROUP BY raw_type
    ORDER BY live_count DESC
    """
    return _safe_run(client, sql, "activity_type_stats")


def query_activity_completion_trend(client, project: str, dataset: str) -> list:
    """
    Monthly completion rate per activity type from mmc_business_metrics_monthly_view.
    Adapted from mmc-dashboard.

    month_year format in source table: '2026-Jan' (parsed with %Y-%b).
    """
    sql = f"""
    SELECT
      FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%b', month_year)) AS month,
      activity_type,
      completion_rate
    FROM (
      SELECT month_year, 'research-survey' AS activity_type,
        SAFE_DIVIDE(survey_activity_completed_total + screener_activity_completed_total
                      + concept_test_completed_total,
                    survey_activity_total + screener_activity_total
                      + concept_test_total)  AS completion_rate
      FROM {_t(project, dataset, 'mmc_business_metrics_monthly_view')}
      UNION ALL
      SELECT month_year, 'ihut',
        SAFE_DIVIDE(in_home_use_test_completed_total, in_home_use_test_total)
      FROM {_t(project, dataset, 'mmc_business_metrics_monthly_view')}
      UNION ALL
      SELECT month_year, 'other',
        SAFE_DIVIDE(onboarding_completed_total, onboarding_total)
      FROM {_t(project, dataset, 'mmc_business_metrics_monthly_view')}
    )
    WHERE completion_rate IS NOT NULL
      AND month >= FORMAT_DATE('%Y-%m', DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH))
    ORDER BY month, activity_type
    """
    return _safe_run(client, sql, "activity_completion_trend")
