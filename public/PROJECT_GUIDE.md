# GridLens — Energy Forecasting Research Prototype

A working interactive project inspired by **Energy load forecasting: one-step ahead hybrid model utilizing ensembling**, Tsalikidis et al., Computing 106:241–273 (2024), DOI: https://doi.org/10.1007/s00607-023-01217-2 (online September 2023).

## Run locally

Requires Node.js 22.13+ (Node 22 or 24 recommended).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Tests: `npm test`. Production build: `npm run build`. Preview: `npm run preview`.

## Deploy on Vercel

Import this GitHub repository into Vercel. The included `vercel.json` uses the Vite preset, `npm ci`, `npm run build`, and `dist` output. No environment variables, API keys, database or server are required. Future pushes to the connected production branch trigger deployments. Deployment publishes the app; uploaded CSVs remain only in each visitor’s browser memory.

## What works

- Train and evaluate the forecasting pipeline in the browser; no ML API key or backend required.
- Seeded office and residential synthetic datasets (70 days, 1,680 hourly observations).
- Upload 504–5,000 hourly CSV rows, maximum file size 2 MB.
- Actual-versus-prediction chart with 24h, 72h and 7-day windows, hover values and calibrated bands.
- Next-hour prediction, MAE, RMSE, MAPE, baseline comparison, observed coverage.
- Weather/PV ablation switch; missing optional measurements supported through indicators.
- Residual anomaly review with threshold multiplier and session-only reviewed status.
- Download test predictions, sample CSV, experiment report, and project guide.
- Research page covers advantages, disadvantages, implemented mitigations and future work.

## CSV contract

```csv
timestamp,load_kwh,temperature_c,pv_kwh
2026-01-01T00:00:00Z,9.1,21.5,0
2026-01-01T01:00:00Z,8.9,21.2,0
```

Only timestamp and load_kwh are required. Use interval energy, not cumulative meter readings. Timestamps must have explicit timezones and be exactly 1 hour apart after UTC normalization; duplicates and unsorted input are rejected. Calendar features use UTC (local-calendar support is future work). Nonnegative loads are required. Leading missing load is rejected; up to four consecutive missing loads are causally forward-filled. Longer gaps are rejected. Add explicit timestamp rows with blank loads for short timestamp gaps. Filled targets are excluded from training/calibration/evaluation, but filled lag values may still enter features. Optional missing temperature and PV use zero plus missingness indicators. PV must be nonnegative. Maximum accepted absolute numeric value is 10 million to bound browser computations.

## Implemented methodology (adaptation)

Features: load at t−1, t−2, t−24, t−168; preceding 24-hour average; hour/day sine and cosine; weekday office-hours indicator; optionally previous-hour temperature and PV plus missingness indicators. No same-hour actual load, temperature or PV enters a forecast.

After a 168-hour warm-up, observed targets are chronologically divided into 50% base training, 20% meta training, 10% calibration and 20% testing. No shuffling. Base models are fixed after training on the first block. Meta learners train only on the next block's base predictions.

Base learners:
1. Standardized ridge regression (lambda 5).
2. Random forest: 18 bootstrapped regression trees, depth 5, randomized feature screening.
3. Gradient boosting: 35 depth-2 regression trees, learning rate 0.12.

The second stage fits ridge, random forest and gradient boosting to those three predictions and averages them. This captures the two-level stacking/voting concept but is **not an exact reproduction** of the paper's six bases (XGBoost, RF, LightGBM, CatBoost, MLP, LSTM) and CatBoost/LGBM/RF meta vote. Ridge is a deliberate lightweight substitution. Tree split search uses seven candidate thresholds per feature.

Test predictions are rolling one-step predictions: a test hour can use earlier observed test hours. The plotted 7-day window is NOT a 7-day-ahead forecast. The next-hour prediction uses the final available observation; models are not automatically refitted on the test block.

The nominal 90% band uses an adjusted empirical 90th percentile of absolute calibration residuals. Lower bounds are clipped at zero. Observed held-out coverage is reported. Serial dependence and drift mean nominal coverage is **not guaranteed**. Alerts fire when absolute test residual exceeds a user-selected multiplier of the calibration radius. Alert labels are not fault diagnoses. Synthetic spike labels are for demonstration only, not training or calibration selection.

MAE/RMSE include zero load; MAPE excludes |actual| <= 1e-6 and reports the exclusion count. The hybrid is not automatically selected to be best; all results remain visible. No fabricated accuracy numbers.

## Advantages of the source paper

- Combines heterogeneous predictors to exploit complementary patterns.
- Uses demand history, calendar, temperature and PV context.
- Supports practical one-hour-ahead demand planning.
- Validates beyond CERTH/ITI on a selected Building Data Genome 2 building with similar properties.
- Reports 5.39% MAPE on unseen data. This is a paper result, not this prototype's result, and must not be converted into a generic “94.61% accuracy” claim.

## Shortcomings and response

| Limitation | Implemented response | Remaining work |
|---|---|---|
| Missing/non-valid data (§6.1A) | Causal short-gap filling, quality flags, filled targets excluded, long-gap rejection | Compare imputation methods; add sensor-quality monitoring |
| Office-oriented data (§6.1A/§6.3) | Multiple synthetic scenarios and CSV upload | Real multi-building and building-held-out evaluation; synthetic data proves nothing about generalization |
| Temperature/PV dependence (§6.1B) | Optional inputs, missing indicators and load-only ablation | Quantify real-world performance loss |
| One-hour scope (§3.4.2) | Explicit one-step UI and evaluation | Direct 6h/24h models with horizon-specific tests |
| Uncertainty and anomaly review (project extensions) | Separate calibration bands, measured coverage, residual queue | Adaptive calibration and validation against labeled faults |
| Deployment cost (project trade-off) | Compact browser-local implementation | Exact Python reproduction and benchmark against this adaptation |

## Honest limitations

Default data is synthetic and deliberately injects a few late-period demand spikes. No original paper dataset is bundled. This project does not establish improved accuracy or actual energy savings. The hybrid can lose to an individual base learner. No live meters, automatic fault diagnosis, notifications, authentication database or durable experiment history. Uploaded data and review state live in memory and reset on refresh. Do not use this academic prototype for grid control.

Future validation: reproduce the full paper model using chronological out-of-fold stacking, use real hourly building datasets, reserve an untouched building/time holdout, compare feature ablations and baselines, report errors by season/building and runtime, evaluate labeled anomalies, and add adaptive recalibration and local-time calendar features. The paper already uses a temporal train/test split; this project does not claim it used random splitting or prove it leaked data.

## Demo sequence

1. Open Overview and explain the one-hour horizon and synthetic data badge.
2. Compare MAE with previous-hour and same-hour-yesterday baselines.
3. Open Dataset, switch to residential, and rerun.
4. Turn optional weather/PV off and compare changes without claiming superiority.
5. Inspect the residual review queue and mark a reading reviewed.
6. Upload a real hourly CSV when available and export results.
7. Explain implemented vs partial vs future improvements in the research page.

## Source map

`src/App.tsx`: interactive UI; `src/styles.css`: responsive design; `lib/engine.mjs`: deterministic ML and CSV logic; `tests/engine.test.mjs`: meaningful algorithm/data-integrity tests.
