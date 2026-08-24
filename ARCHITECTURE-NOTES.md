# Member's Mark Community Dashboard — Architecture Notes

## Deployment Model

```
BigQuery
  → private batch process (runs in a secured internal environment)
  → static JSON files (committed to internal GHE repository)
  → GitHub Pages (internal GitHub Enterprise Pages)
  → browser (reads only static assets + dashboard JSON)
```

The deployed application is **fully static**. It has no backend, no server-side code,
and no runtime dependencies beyond a static file server.

## Security Boundaries — Non-Negotiable

The browser **never**:
- accesses BigQuery
- holds BigQuery credentials
- holds any API credentials or secrets
- calls an LLM
- calls any internal Walmart data system
- requests from internal hostnames
- exposes BigQuery project IDs, dataset names, or table names

All secrets and credentials live exclusively in the private batch process environment,
never in this repository.

## Data Flow

1. **Batch process** (not part of this repo) queries BigQuery, computes summary
   statistics, and writes versioned JSON files to `public/data/`.
2. **Validator** (`scripts/validate-data.ts`) runs in CI against those JSON files
   before any deployment.
3. **Browser** loads JSON from `/data/` via `fetch()`. No direct BigQuery access.

## `file://` Protocol Warning

The application uses `fetch()` to load JSON data files. **Browsers block `fetch()`
across `file://` origins by default** (CORS + security policy). Local development
must use a local static server:

```
npm run dev        # Vite dev server — works correctly
npm run preview    # Preview the production build — works correctly
```

Do **not** simply open `dist/index.html` as a file in the browser.

## Data Contract

- Located at `src/types/data-contract.ts`
- Versioned via `manifest.schemaVersion` (current: `"1.0"`)
- All JSON files are validated by `scripts/validate-data.ts` before deployment
- `manifest.source` field drives the synthetic-data banner:
  - `"synthetic"` → persistent orange banner shown to all users
  - `"live"` → no banner; freshness rules apply instead

## Metric Definitions

All business metric definitions (event qualifications, calculation windows, thresholds)
live in `src/metrics/definitions.ts`. Components **must not** embed business logic.
The definitions file is the single source of truth for:
- Highly Engaged threshold (5+ activities/month)
- New Member Activation qualifying window
- Repeat Participation qualifying window
- Activity Supply Coverage definition
- Target structures

## Insight Engine

Insights are **deterministic computation** over dashboard data. No LLM is used or
permitted. The insight engine (`src/lib/insights.ts`) uses:
- Linear regression for trend detection
- Slope uncertainty for trend qualification
- Period-over-period change detection
- Magnitude thresholds for signal vs. noise

Narrative rules are enforced in code — no causal language for observational data,
no inflation, no fabricated findings.

## Adding Rewards Later

The data contract includes a `rewards` optional namespace in the manifest and
experiment schema. The metric definitions file has a `rewards` section stub.
To add the Rewards page:
1. Uncomment/expand the `rewards` data types
2. Add a `RewardsDataset` file to the batch process output
3. Add the Rewards nav item and view
4. Run the validator

No component rewrites should be necessary.

## LLM Prohibition

The insight/narrative layer must remain deterministic computation.
Never introduce an LLM API call, LLM SDK dependency, or LLM-generated narrative
into this repository.

## No Hardcoded Business Targets

Targets are data-driven via `targets` fields in `public/data/manifest.json`.
Components read targets from data; they never hardcode business KPI targets.

## Dependency Policy

Add dependencies only when they materially improve the product and comply with
the static architecture. Prefer custom implementations for visualizations to
maintain accessibility control and visual precision.

## Accessibility Contract

WCAG 2.2 AA is required. Charts must have accessible semantic equivalents.
Color must never be the sole means of conveying information. Full keyboard
navigation and focus management are required.
