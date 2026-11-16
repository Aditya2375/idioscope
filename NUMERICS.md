# Numerical contract

## Synthetic fixture

200 days and six invented assets, with no calendar or market data. The unsigned 32-bit LCG uses `s = (1664525*s + 1013904223) mod 2^32`. Each day draws eight centered unit-variance uniform values `u = (s/2^32 - 0.5)*sqrt(12)`, in order. These are bounded uniform draws, not normal innovations. Starting all six latent levels at zero:

```text
h[t,i] = (0.65 + 0.04*i)*h[t-1,i] + 0.004*u[i+2]
r[t,i] = (0.8 + 0.08*i)*0.006*u[0]
         + (i<3 ? 1 : -1)*0.003*u[1]
         + h[t,i] - h[t-1,i]
```

Asset index i is zero-based. Market/sector-like labels describe synthetic structure, not observed economic factors. Mean reversion is built into the latent levels; the transformed residual need not itself obey the fitted OU model. There is no evidence of real investment skill or profitability.

## Train-only correlation PCA

Let T be the configured training count. Means mu and sample deviations sigma use return rows 0 through T-1, with sample denominator T-1. Reject any sigma <= 1e-12. Standardize all days with those frozen parameters: z[t,i] = (r[t,i]-mu[i])/sigma[i]. Compute C = Ztrain'Ztrain/(T-1). The same PCA includes the inspected asset; it is not a leave-one-asset-out model.

A maximum-off-diagonal symmetric Jacobi solver uses at most 1000 rotations and stops when the largest absolute off-diagonal entry is below 1e-13. Failure to converge is an error, not silent truncation. Eigenvalues are sorted descending. Each eigenvector is oriented so its largest-magnitude coordinate is positive, breaking coordinate ties by first index. Signs do not affect the projector. Repeated eigenvalues can have nonunique eigenvectors; if a retained cutoff divides a tied subspace, the selected projector is not uniquely defined. No continuity across tied or near-tied subspaces is promised. Public numeric helper matrices need not be positive semidefinite; only the analyze path constructs the actual correlation matrix.

For k retained vectors, P = V_k V_k'. Training variance explained is sum(lambda[0:k])/6. It is not variance explained in the held-out period, model accuracy or risk reduction. Eigenvalue residual and orthogonality diagnostics are returned by the API. Tests bound them by 1e-11 and 1e-12 on the fixture grid.

Raw residual return is epsilon[t,i] = sigma[i] * [(I-P)z[t]]_i. Cumulate X[0,i]=0 and X[d,i]=X[d-1,i]+epsilon[d-1,i], where d is a one-based close day. Training residual means are near zero by construction, so X[T] is near zero. This creates a fitted bridge and can favor apparent reversion; do not interpret it as a stationarity result.

## Residual basket and neutrality

For selected asset i, raw-return coefficient `w[j] = delta[i,j] - sigma[i]*P[i,j]/sigma[j]`. Then `epsilon_i = sum_j w[j]*(r_j-mu_j)`, including the explicit mean offset. The coefficient sum need not be zero. Coefficients are not normalized dollar allocations or gross-exposure targets.

For every retained eigenvector v_k, sum_j w[j]*sigma[j]*v[j,k] is zero up to floating-point error. This is fitted-PC neutrality only. It does not guarantee dollar neutrality, economic market-beta neutrality, independent residuals or out-of-sample neutrality to changed factors. No transaction costs, capital allocation, borrow, turnover or PnL are computed.

## AR(1) and OU domain

Fit X[t+1] = a + b X[t] + e[t] on exactly T training transitions t=0..T-1. This includes the initial zero level and the training-end level but no held-out residual. Centered sums compute b = Sxy/Sxx and a = mean(y)-b*mean(x). If Sxx <= 1e-20, the fit is ineligible. Otherwise use innovation variance v = SSE/T, a conditional maximum-likelihood-style denominator, not the unbiased SSE/(T-2) estimate.

Only 0 < b < 1 and v > 1e-20 are eligible for this positive-speed continuous-time OU mapping at one synthetic day per step:

```text
m = a/(1-b)
sigma_eq = sqrt(v/(1-b*b))
kappa = -log(b)
half_life = log(2)/kappa
s[d] = (X[d]-m)/sigma_eq
```

Negative b can be stationary in a discrete AR model but does not fit this positive continuous-time OU mapping. It is not reflected or clipped. b >= 1, b <= 0, constant paths and tiny innovation variance stay ineligible. Ineligible scores in API arrays are zero sentinels, never valid s-score estimates; the eligibility flag controls interpretation. UI marks fit-derived values unavailable and leaves hypothetical states flat. No unit-root or stationarity significance test is performed. Fitted residuals may be autocorrelated, nonnormal or unstable. No uncertainty interval or calibration guarantee is claimed.

An analytic six-level fixture [0,1,2,1,2,3] with five transitions gives a = 9/7, b = 3/7, innovation variance = 16/35, m = 9/4 and equilibrium variance = 14/25. A rank-one six-asset fixture yields negligible residual innovation and ineligible OU fits, with every state flat. These test the regression arithmetic and abstention path independently of cross-language parity.

## Causal state trail

Return index t is zero-based. Held-out returns begin at index T, day T+1. That first held-out day's state is forced flat. For t > T, state[t] = next(state[t-1], s[t]), using the score at close day t, before return day t+1. A close score s[t+1] cannot affect its own day's state.

From flat, score <= -1.25 enters +1 and score >= 1.25 enters -1. Long exits at score >= -0.5. Short exits at score <= 0.5. Equality is included. Existing states exit without a same-day reverse entry. There is no re-entry while already in the same state. These are hypothetical residual directions only, not orders or trade sizes.

All means, scales, projector and AR coefficients remain frozen after T. Tests perturb only later returns and require identical fit parameters and unchanged earlier residuals/states. This is a causal implementation check, not a claim that the synthetic experiment predicts real returns.

## Floating point and presentation

Java and JS use doubles with the same loop order and formulas. Full result comparisons use scaled 2e-9 tolerance. Independent NumPy `eigh` and least-squares results compare projector, residuals, levels, fit values, scores and states at scaled 2e-9, not eigenvector signs. Threshold decisions near exact floating-point boundaries may be sensitive; explicit equality fixtures test the state machine. Generated fixture tests have no claimed formal worst-case error proof.

Values use six decimals, half-life uses three and explained shares use two percent decimals. Nonzero magnitude below 1e-6 is scientific notation. Decisions, geometry and audits use unrounded values. No UI clipping changes the model. The held-out score plot has a symmetric range at least [-2,2] and expands to include every close score. A native-width SVG keeps labels readable on phones. Primary selected-day information fits the main column; the supplemental full ledger scrolls.

API arrays are caller-owned mutable snapshots, not deep immutable. Input arrays are copied. Public helper inputs are bounded and checked: fit level magnitude <= 1e100, 2..200 transitions, finite values; eigen symmetric 6x6 matrix magnitude <= 1e6. No PSD validity is claimed for arbitrary helper matrices. Input return observations for analyze are finite and bounded by [-1,1], and only its training-built correlation matrix is used in the lab.

## References

- https://math.nyu.edu/inmemoriam/avellaneda/AvellanedaLeeStatArb20090616.pdf
- https://scikit-learn.org/stable/modules/generated/sklearn.decomposition.PCA.html
- https://www.statsmodels.org/stable/generated/statsmodels.tsa.ar_model.AutoReg.html
- https://www.itl.nist.gov/div898/handbook/pmc/section4/pmc442.htm
