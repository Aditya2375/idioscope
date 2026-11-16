export const defaults = Object.freeze({ factors: 2, training: 120, seed: 17 });
export function validate(c) {
  for (const [k, lo, hi] of [
    ["factors", 1, 4],
    ["training", 80, 160],
    ["seed", 1, 9999],
  ])
    if (!Number.isInteger(c?.[k]) || c[k] < lo || c[k] > hi)
      throw Error("Factors 1..4, training 80..160, seed 1..9999 required");
}
export function generate(seed) {
  if (!Number.isInteger(seed) || seed < 1 || seed > 9999)
    throw Error("Seed 1..9999");
  let s = seed,
    old = Array(6).fill(0),
    out = [];
  for (let t = 0; t < 200; t++) {
    let u = [];
    for (let j = 0; j < 8; j++) {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      u.push((s / 4294967296 - 0.5) * Math.sqrt(12));
    }
    let row = [];
    for (let i = 0; i < 6; i++) {
      let state = (0.65 + 0.04 * i) * old[i] + 0.004 * u[i + 2];
      row.push(
        (0.8 + 0.08 * i) * 0.006 * u[0] +
          (i < 3 ? 1 : -1) * 0.003 * u[1] +
          state -
          old[i],
      );
      old[i] = state;
    }
    out.push(row);
  }
  return out;
}
const matrix = (n, m) => Array.from({ length: n }, () => Array(m).fill(0));
export function eigen(input) {
  let n = 6;
  if (
    !Array.isArray(input) ||
    input.length !== n ||
    input.some((r) => !Array.isArray(r) || r.length !== n) ||
    Array.from(input).some(
      (r) =>
        !r ||
        Array.from(r).some(
          (x) =>
            typeof x !== "number" || !Number.isFinite(x) || Math.abs(x) > 1e6,
        ),
    )
  )
    throw Error("Finite 6x6 matrix required");
  let a = input.map((r) => r.slice()),
    v = matrix(n, n);
  for (let i = 0; i < n; i++) {
    v[i][i] = 1;
    for (let j = 0; j < n; j++)
      if (Math.abs(a[i][j] - a[j][i]) > 1e-12)
        throw Error("Symmetric matrix required");
  }
  let done = false;
  for (let it = 0; it < 1000; it++) {
    let p = 0,
      q = 1,
      max = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (Math.abs(a[i][j]) > max) {
          max = Math.abs(a[i][j]);
          p = i;
          q = j;
        }
    if (max < 1e-13) {
      done = true;
      break;
    }
    let theta = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]),
      c = Math.cos(theta),
      s = Math.sin(theta),
      app = a[p][p],
      aqq = a[q][q],
      apq = a[p][q];
    for (let i = 0; i < n; i++)
      if (i !== p && i !== q) {
        let x = a[i][p],
          y = a[i][q];
        a[i][p] = a[p][i] = c * x - s * y;
        a[i][q] = a[q][i] = s * x + c * y;
      }
    a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p][q] = a[q][p] = 0;
    for (let i = 0; i < n; i++) {
      let x = v[i][p],
        y = v[i][q];
      v[i][p] = c * x - s * y;
      v[i][q] = s * x + c * y;
    }
  }
  if (!done) throw Error("Eigen solver did not converge");
  let order = [0, 1, 2, 3, 4, 5].sort((i, j) => a[j][j] - a[i][i]),
    values = [],
    vectors = matrix(n, n);
  for (let k = 0; k < n; k++) {
    let j = order[k],
      pivot = 0;
    for (let i = 1; i < n; i++)
      if (Math.abs(v[i][j]) > Math.abs(v[pivot][j])) pivot = i;
    let sign = v[pivot][j] < 0 ? -1 : 1;
    values.push(a[j][j]);
    for (let i = 0; i < n; i++) vectors[i][k] = sign * v[i][j];
  }
  return { values, vectors };
}
export function fit(x, T) {
  if (
    !Array.isArray(x) ||
    !Number.isInteger(T) ||
    T < 2 ||
    T > 200 ||
    x.length < T + 1 ||
    Array.from(x).some(
      (v) =>
        typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 1e100,
    )
  )
    throw Error("Finite level array and valid fit count required");
  let mx = 0,
    my = 0;
  for (let t = 0; t < T; t++) {
    mx += x[t] / T;
    my += x[t + 1] / T;
  }
  let xx = 0,
    xy = 0;
  for (let t = 0; t < T; t++) {
    xx += (x[t] - mx) ** 2;
    xy += (x[t] - mx) * (x[t + 1] - my);
  }
  if (xx <= 1e-20)
    return {
      eligible: false,
      intercept: 0,
      phi: 0,
      innovationVariance: 0,
      mean: 0,
      equilibriumSd: 0,
      halfLife: 0,
    };
  let phi = xy / xx,
    intercept = my - phi * mx,
    sse = 0;
  for (let t = 0; t < T; t++) {
    let e = x[t + 1] - intercept - phi * x[t];
    sse += e * e;
  }
  let innovationVariance = sse / T,
    eligible = phi > 0 && phi < 1 && innovationVariance > 1e-20;
  return {
    eligible,
    intercept,
    phi,
    innovationVariance,
    mean: eligible ? intercept / (1 - phi) : 0,
    equilibriumSd: eligible
      ? Math.sqrt(innovationVariance / (1 - phi * phi))
      : 0,
    halfLife: eligible ? Math.log(2) / -Math.log(phi) : 0,
  };
}
export function next(previous, score) {
  if (![-1, 0, 1].includes(previous) || !Number.isFinite(score))
    throw Error("Valid state and finite score required");
  if (previous === 0) return score <= -1.25 ? 1 : score >= 1.25 ? -1 : 0;
  if (previous === 1) return score >= -0.5 ? 0 : 1;
  return score <= 0.5 ? 0 : -1;
}
export function run(input = defaults) {
  validate(input);
  return analyze(input, generate(input.seed));
}
export function analyze(input, data) {
  const c = { ...input };
  validate(c);
  if (
    !Array.isArray(data) ||
    data.length !== 200 ||
    Array.from(data).some(
      (r) =>
        !Array.isArray(r) ||
        r.length !== 6 ||
        Array.from(r).some(
          (v) =>
            typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 1,
        ),
    )
  )
    throw Error("200x6 finite bounded returns required");
  const returns = data.map((r) => r.slice()),
    n = 6,
    T = c.training,
    means = Array(n).fill(0),
    scales = Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let t = 0; t < T; t++) means[i] += returns[t][i] / T;
    let ss = 0;
    for (let t = 0; t < T; t++) ss += (returns[t][i] - means[i]) ** 2;
    scales[i] = Math.sqrt(ss / (T - 1));
    if (scales[i] <= 1e-12) throw Error("Constant or tiny training scale");
  }
  let z = matrix(200, n),
    correlation = matrix(n, n);
  for (let t = 0; t < 200; t++)
    for (let i = 0; i < n; i++)
      z[t][i] = (returns[t][i] - means[i]) / scales[i];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let t = 0; t < T; t++)
        correlation[i][j] += (z[t][i] * z[t][j]) / (T - 1);
  let eig = eigen(correlation),
    projector = matrix(n, n),
    explained = 0;
  for (let k = 0; k < c.factors; k++) {
    explained += eig.values[k] / 6;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        projector[i][j] += eig.vectors[i][k] * eig.vectors[j][k];
  }
  let residual = matrix(200, n),
    levels = matrix(201, n),
    scores = matrix(201, n),
    positions = matrix(200, n),
    fits = [];
  for (let t = 0; t < 200; t++)
    for (let i = 0; i < n; i++) {
      let projected = 0;
      for (let j = 0; j < n; j++) projected += projector[i][j] * z[t][j];
      residual[t][i] = scales[i] * (z[t][i] - projected);
      levels[t + 1][i] = levels[t][i] + residual[t][i];
    }
  for (let i = 0; i < n; i++) {
    let f = fit(
      levels.map((r) => r[i]),
      T,
    );
    fits.push(f);
    if (f.eligible) {
      for (let t = 0; t <= 200; t++)
        scores[t][i] = (levels[t][i] - f.mean) / f.equilibriumSd;
      let pos = 0;
      for (let t = T; t < 200; t++) {
        if (t > T) pos = next(pos, scores[t][i]);
        positions[t][i] = pos;
      }
    }
  }
  let maxEigenError = 0,
    maxOrthogonality = 0;
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++) {
      let cv = 0,
        dot = 0;
      for (let j = 0; j < n; j++) {
        cv += correlation[i][j] * eig.vectors[j][k];
        dot += eig.vectors[j][i] * eig.vectors[j][k];
      }
      maxEigenError = Math.max(
        maxEigenError,
        Math.abs(cv - eig.values[k] * eig.vectors[i][k]),
      );
      maxOrthogonality = Math.max(
        maxOrthogonality,
        Math.abs(dot - (i === k ? 1 : 0)),
      );
    }
  return {
    config: c,
    returns,
    means,
    scales,
    correlation,
    eigen: eig,
    projector,
    residual,
    levels,
    fits,
    scores,
    positions,
    explained,
    maxEigenError,
    maxOrthogonality,
  };
}
export const packed = (r) => [
  r.means,
  r.scales,
  r.correlation,
  r.eigen.values,
  r.eigen.vectors,
  r.projector,
  r.residual,
  r.levels,
  r.fits.map((f) => [
    f.eligible,
    f.intercept,
    f.phi,
    f.innovationVariance,
    f.mean,
    f.equilibriumSd,
    f.halfLife,
  ]),
  r.scores,
  r.positions,
  r.explained,
  r.maxEigenError,
  r.maxOrthogonality,
];
