# idioscope

A Java-first PCA statistical-arbitrage mechanism lab: remove frozen common factors, fit the cumulative residual with AR(1), then inspect forward scores and a strictly lagged hypothetical state trail.

Six invented assets, 200 synthetic days. No prices, PnL, portfolio allocation, orders or performance statistics are produced. The generator deliberately includes mean reversion. This is not evidence of real market opportunity and not a reproduction of Avellaneda and Lee's empirical strategy.

## The complete path

1. Fit means and sample standard deviations using training days only.
2. Build the six-asset training correlation matrix and solve its symmetric eigensystem.
3. Freeze the top-k projector. Transform every day using the frozen means, scales and projector.
4. Cumulate each raw-unit residual return. Fit an intercept AR(1) on training transitions.
5. Map only eligible fits to an OU equilibrium mean, deviation and half-life. Require 0 < b < 1 and positive innovation variance. Ineligible fits stay flat, with no fallback estimates.
6. Follow the held-out period without refitting. Every day's hypothetical state uses the previous close score; the first held-out day starts flat.
7. Inspect the raw-return residual basket, frozen-fit arithmetic, every held-out ledger row and factor-exposure audit.

Default: two retained factors, 120 training days, seed 17. The remaining 80 days are held out. Default training variance explained is about 78.01%, a decomposition of this invented sample, not predictive performance.

## Run

Java 21, Node 22 and Python 3 are used in CI. There are no application dependencies. The independent Python test alone uses NumPy 2.2.6.

```sh
javac -d build/classes src/idioscope/*.java tools/*.java tests/idioscope/*.java
java -cp build/classes idioscope.TestRunner
node tests/parity.mjs
node tests/domain.mjs
python3 -m pip install numpy==2.2.6
python3 tests/reference.py
node tools/build-web.mjs
python3 -m http.server 8080 --directory docs
```

Open the printed local address. Browser checks additionally need Google Chrome on PATH and free ports 8998 and 9399. `node tests/browser-smoke.mjs` starts and cleans up its own temporary server and Chrome profile. Use `SMOKE_SHOTS=1` for local screenshots and `SMOKE_URL` for the deployed page.

## API and data contract

`Engine.run(Config)` and browser `run(config)` generate the fixture. `analyze(config, returns)` accepts exactly 200 rows and six columns of finite simple-return-like observations in [-1,1], with training sample scales greater than 1e-12. Config requires integer factors 1..4, integer training days 80..160 and integer seed 1..9999. These are bounded educational API limits, not financial validity tests. The seed is ignored by `analyze` when explicit data is supplied but is still validated as part of Config.

Inputs are cloned. Java records contain mutable arrays, and JS results are not deep immutable. Treat output as a caller-owned snapshot, not a protected immutability boundary. There is no shared mutable model state. `fit` accepts finite level arrays bounded by magnitude 1e100 with 2..200 training transitions and enough observations; `eigen` accepts finite symmetric 6x6 matrices bounded by magnitude 1e6. These numeric helpers do not establish that a matrix is a valid correlation matrix or that a series is stationary.

Invalid controls retain the last applied results. Editing notices distinguish pending values from applied state; resize uses only the last applied fit. Asset/day inspection changes no model parameter. All primary results and selected-day values fit the reading width on a phone; only the supplemental full ledger scrolls horizontally.

## Signal timing and rules

One-based return day d uses the state decided before that day's return. The first held-out day is forced flat. On later days, the decision uses the frozen-model score at close d - 1. Current close scores are displayed for the next decision, not the current one.

From flat, enter a hypothetical long residual state when score <= -1.25 or a short residual state when score >= 1.25. A long state exits when score >= -0.5; a short exits when score <= 0.5. Exit is evaluated before any opposite entry: there is no same-day flip. These are fixed illustrative thresholds, not optimized settings. There is no execution, borrow check, cost model, portfolio aggregation or risk sizing.

## What the audit does not prove

Training residuals are centered. Their cumulative path starts and ends near zero by construction, a fitted bridge that can favor apparent mean reversion. An AR(1) coefficient in the OU domain is not a stationarity or cointegration test. No p-values, calibration or empirical investment results are claimed.

The residual basket cancels retained-PC exposure only under the fitted geometry. It is not necessarily dollar-neutral, economic-market-beta-neutral out of sample or tradable at the shown coefficients. Mean offset, coefficient sum, gross sum and retained-factor exposure are shown explicitly. See [NUMERICS.md](NUMERICS.md) for scaling, OU mapping, solver tolerances and boundaries.

The original paper uses a broader rolling empirical workflow. This lab uses one frozen split, a small invented universe and no performance simulation. Changing seed or factor count is not a search for profitable parameters. Native Safari/Android are untested.

## Verification and security

Java tests cover spectrum reconstruction, orthogonality, projector idempotence, raw-unit basket identity, retained-factor exposure, AR(1) domain, lagged state transitions, future perturbation invariance, input copying and invalid domains. Java/JS checks compare every numeric field of full configurations. The independent Python test uses NumPy `eigh` and least squares, not the production Jacobi rotations or centered-sum regression. It compares projectors instead of arbitrary eigenvector signs.

Chrome checks inspect every output metric, all fit/day audit fields, all six hedge coefficients, every forward ledger cell, full path coordinates and selected point, all six assets, first/middle/last held-out days, extremes, invalid retention, dirty resize, responsive containment, keyboard focus, reduced motion and throttled reload. Tests check implementation, not statistical profitability.

The app has no accounts, secrets, storage, uploads, backend, external fonts/assets or runtime network calls. CSP permits only same-origin static scripts/styles/images, with no inline code, connection, object, base or form action. CI actions and security tools are pinned. Generated screenshots, logs, local builds and private research/process evidence are excluded from source.

## Attribution

Original code and UI; no external paper, implementation, font, asset or dataset is bundled.

- [Avellaneda and Lee, 2009 author revision](https://math.nyu.edu/inmemoriam/avellaneda/AvellanedaLeeStatArb20090616.pdf): PCA residual and OU mechanism.
- [scikit-learn PCA](https://scikit-learn.org/stable/modules/generated/sklearn.decomposition.PCA.html): centering is distinct from scaling.
- [statsmodels AutoReg](https://www.statsmodels.org/stable/generated/statsmodels.tsa.ar_model.AutoReg.html): intercept AR estimation context.
- [NIST stationarity](https://www.itl.nist.gov/div898/handbook/pmc/section4/pmc442.htm): mean, variance and autocorrelation stability.

## License

Original code is **MIT OR Apache-2.0**, at your option. See [LICENSE-MIT](LICENSE-MIT) and [LICENSE-APACHE](LICENSE-APACHE).
