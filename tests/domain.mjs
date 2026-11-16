import assert from "node:assert/strict";
import {
  run,
  analyze,
  generate,
  eigen,
  fit,
  next,
  defaults,
} from "../web/src/model.js";
let n = 0;
const ok = (b) => {
  assert(b);
  n++;
};
for (const key of Object.keys(defaults))
  for (const v of [NaN, Infinity, -Infinity, undefined, null, "2", 2.5])
    assert.throws(() => run({ ...defaults, [key]: v }));
for (const c of [
  { factors: 0 },
  { factors: 5 },
  { training: 79 },
  { training: 161 },
  { seed: 0 },
  { seed: 10000 },
])
  assert.throws(() => run({ ...defaults, ...c }));
for (const data of [
  new Array(200),
  Array.from({ length: 200 }, () => new Array(6)),
  generate(1).map((r, t) => (t === 80 ? null : r)),
  generate(1).map((r) => r.map(() => 0)),
])
  assert.throws(() => analyze(defaults, data));
for (let seed = 1; seed <= 150; seed++) {
  let prev = -1;
  for (let factors = 1; factors <= 4; factors++) {
    let r = run({ ...defaults, seed, factors });
    ok(r.explained >= prev);
    prev = r.explained;
    ok(r.maxEigenError < 1e-11);
    ok(r.maxOrthogonality < 1e-12);
    for (let i = 0; i < 6; i++) {
      ok(Math.abs(r.levels[120][i]) < 1e-12);
      for (let t = 120; t < 200; t++) {
        ok([-1, 0, 1].includes(r.positions[t][i]));
        if (t > 120)
          ok(
            r.positions[t][i] ===
              (r.fits[i].eligible
                ? next(r.positions[t - 1][i], r.scores[t][i])
                : 0),
          );
      }
    }
  }
}
for (const T of [80, 120, 160]) {
  let c = { ...defaults, training: T },
    d = generate(17),
    r = analyze(c, d);
  for (let t = T + 10; t < 200; t++) d[t][0] += 0.1;
  let q = analyze(c, d);
  ok(JSON.stringify(r.fits) === JSON.stringify(q.fits));
  ok(JSON.stringify(r.projector) === JSON.stringify(q.projector));
  for (let t = 0; t < T + 10; t++) {
    ok(JSON.stringify(r.residual[t]) === JSON.stringify(q.residual[t]));
    ok(JSON.stringify(r.positions[t]) === JSON.stringify(q.positions[t]));
  }
  d[0][0] = 0.5;
  ok(r.returns[0][0] !== 0.5);
}
for (const b of [0, 1, -1]) {
  let x = Array.from({ length: 81 }, (_, i) =>
    b === 1 ? i : b === -1 ? (-1) ** i : 1,
  );
  ok(!fit(x, 80).eligible);
}
const identity = Array.from({ length: 6 }, (_, i) =>
  Array.from({ length: 6 }, (_, j) => (i === j ? 1 : 0)),
);
let e = eigen(identity);
ok(e.values.every((v) => v === 1));
assert.throws(() => eigen(new Array(6)));
assert.throws(() => fit([0, NaN, 1], 2));

const analytic = fit([0, 1, 2, 1, 2, 3], 5);
ok(analytic.eligible);
for (const [a, b] of [
  [analytic.intercept, 9 / 7],
  [analytic.phi, 3 / 7],
  [analytic.innovationVariance, 16 / 35],
  [analytic.mean, 9 / 4],
  [analytic.equilibriumSd, Math.sqrt(14 / 25)],
])
  ok(Math.abs(a - b) < 1e-13);
let rankone = Array.from({ length: 200 }, (_, t) =>
    Array.from({ length: 6 }, (_, i) => 0.001 * (1 + i) * Math.sin(t)),
  ),
  rankresult = analyze(defaults, rankone);
ok(rankresult.fits.every((f) => !f.eligible));
ok(rankresult.positions.every((row) => row.every((v) => v === 0)));
for (const [prev, score] of [
  [2, 0],
  [0, NaN],
  [0, Infinity],
])
  assert.throws(() => next(prev, score));

let block = identity.map((r) => r.slice());
block[0][1] = block[1][0] = 0.5;
let eb = eigen(block);
ok(Math.abs(eb.values[0] - 1.5) < 1e-14);
ok(Math.abs(eb.values[5] - 0.5) < 1e-14);
ok(Math.abs(Math.abs(eb.vectors[0][0]) - Math.sqrt(0.5)) < 1e-14);
ok(block[0][1] === 0.5);
let huge = identity.map((r) => r.slice());
huge[0][0] = 1e7;
assert.throws(() => eigen(huge));
let asym = identity.map((r) => r.slice());
asym[0][1] = 1;
assert.throws(() => eigen(asym));
assert.throws(() => fit([0, 1, 1e101], 2));
assert.throws(() => fit([0, 1, 2], 1));
console.log(
  `${n} JS assertions plus invalid domains, analytic AR1, analytic block spectrum and rank-one ineligibility passed`,
);
