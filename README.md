# Member's Mark Community — Product Dashboard

A polished internal product cockpit for the Member's Mark Community product team. Fully static, zero backend, zero LLM dependency.

---

## Quick Start

### Option A — Immediate preview (no install needed)

```bash
# From the project root:
python3 -m http.server 8080
# Open http://localhost:8080/public/standalone.html
```

This serves the standalone vanilla JS dashboard — no npm, no build step. Works with Node.js 20+ or any static file server.

### Option B — Full React/TypeScript app (recommended for development)

```bash
npm install
npm run dev
# Open http://localhost:5173
```

> **Important:** Never open HTML files directly as `file://` URLs — browsers block `fetch()` over `file://`. Always use a local server.

---

## Architecture

Full details in [`ARCHITECTURE-NOTES.md`](./ARCHITECTURE-NOTES.md).

```
BigQuery
  → private batch process (secured internal environment — not in this repo)
  → static JSON → public/data/*.json
  → GitHub Pages
  → browser (reads only static assets and data/*.json)
```

The browser never contacts BigQuery, any internal data system, or any external API. All routing is hash-based (`#/overview`, `#/members`, etc.) for GitHub Pages compatibility.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check + production build → `dist/` |
| `npm run preview` | Preview the production build |
| `npm run generate-data` | Regenerate all synthetic data in `public/data/` |
| `npm run validate-data` | Validate data files against schema (fails loudly) |
| `npm run typecheck` | TypeScript check without building |

`generate-data` and `validate-data` use only Node.js built-ins via `--experimental-strip-types` (Node 20+). No additional package installation needed for data tooling.

---

## Synthetic Data

All data is fabricated. The app shows a persistent orange banner when `source: "synthetic"` is set in `manifest.json`.

```bash
npm run generate-data   # generates public/data/*.json
npm run validate-data   # verifies 34+ schema checks
```

---

## Data Contract

`public/data/` files:

| File | Contents |
|---|---|
| `manifest.json` | Source flag, freshness, targets, event annotations |
| `p0-metrics.json` | Six P0 KPI snapshots with 18-month history |
| `member-lifecycle.json` | Lifecycle stage counts + MAU history |
| `activation.json` | Activation funnel + P1 metrics |
| `cohort-retention.json` | Cohort × week retention (W1/W2/W4/W8/W12) |
| `participation-depth.json` | Activity frequency distribution |
| `activity-supply.json` | Supply coverage, eligible activities per member |
| `activity-mix.json` | Supply vs completion share by activity type |
| `activity-performance.json` | Completion rates + trends by type |
| `experiments.json` | Experiment registry (live, planned, completed) |

TypeScript types: `src/types/data-contract.ts`
Business definitions: `src/metrics/definitions.ts` (single source of truth)

---

## Connecting Real Data

1. Configure the batch process to write JSON conforming to `src/types/data-contract.ts`
2. Set `"source": "live"` in `manifest.json`
3. Run `npm run validate-data` — fix any failures before deploying
4. Commit JSON files to the internal GHE repository
5. GitHub Pages serves the updated dashboard automatically

**No application code changes needed** to switch from synthetic to real data.

---

## Deployment (GitHub Pages)

Root deploy:
```bash
VITE_BASE=/ npm run build
```

Project-page deploy (e.g. `org.github.io/mmc-dashboard/`):
```bash
VITE_BASE=/mmc-dashboard/ npm run build
```

Push `dist/` to `gh-pages` branch or configure GitHub Actions (see `.github/workflows/validate.yml`).

---

## Project Structure

```
pm-command-center/
├── public/data/            # Static JSON data files
├── scripts/
│   ├── generate-synthetic.ts
│   └── validate-data.ts
├── src/
│   ├── components/
│   │   ├── charts/         # Custom SVG charts (no chart library)
│   │   ├── layout/         # Nav
│   │   └── ui/             # MetricCard, Sparkline, ProgressBar, etc.
│   ├── data/loader.ts      # Fetch-based loader (isolated section failures)
│   ├── lib/
│   │   ├── format.ts       # All formatting (single source of truth)
│   │   ├── insights.ts     # Deterministic insight engine (no LLM)
│   │   ├── router.tsx      # Built-in hash router (no react-router-dom)
│   │   └── stats.ts        # Statistical primitives
│   ├── metrics/definitions.ts  # ALL metric business definitions
│   ├── styles/
│   │   ├── tokens.css      # Design tokens (light + dark themes)
│   │   └── globals.css     # Reset, layout, utilities
│   ├── types/data-contract.ts
│   └── views/
│       ├── Overview/       # P0s, insights, growth chart, experiment radar
│       ├── Members/        # Journey, activation, retention, depth
│       ├── Activities/     # Supply, mix, performance
│       └── Experiments/    # Live, planned, completed registry
├── ARCHITECTURE-NOTES.md
├── vite.config.ts
└── tsconfig.json
```

---

## Dependencies

| Package | Purpose |
|---|---|
| `react` + `react-dom` | UI rendering |
| `vite` + `@vitejs/plugin-react` | Build tooling (dev only) |
| `typescript` | Type checking (dev only) |

No chart library. No routing library (built-in hash router). No CSS framework. No state management library.

---

## Adding Rewards (Post-V1)

The data contract and metric definitions include a `rewards` stub. To add a Rewards page:

1. Expand `src/types/data-contract.ts` with `RewardsDataset`
2. Expand `src/metrics/definitions.ts` rewards section
3. Add batch process output for `rewards.json`
4. Add Rewards view and nav item

No architectural rework needed.

---

## Security

Before any deployment:
- [ ] Confirm `source: "live"` and synthetic banner is **not shown** with real data
- [ ] Confirm no real member counts, table names, or credentials in any file
- [ ] `npm run validate-data` passes
- [ ] `npm run build` succeeds with no errors
- [ ] Browser makes zero requests to internal hostnames

---

## Accessibility

WCAG 2.2 AA target. Charts have semantic table equivalents for screen readers. Full keyboard navigation. Status indicators use icon + text (never color alone). Reduced motion honored. Skip link at page top.
