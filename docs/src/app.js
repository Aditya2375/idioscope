import { run, defaults } from "./model.js";
const $ = (id) => document.getElementById(id),
  keys = Object.keys(defaults),
  f = (x, n = 6) =>
    x !== 0 && Math.abs(x) < 1e-6 ? x.toExponential(3) : x.toFixed(n),
  state = (p) =>
    p === 1 ? "+1 long residual" : p === -1 ? "-1 short residual" : "0 flat";
let applied = run(defaults),
  asset = 0,
  day = 150;
function rows(id, values) {
  $(id).replaceChildren(
    ...values.map(([k, v]) => {
      let div = document.createElement("div"),
        dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = k;
      dd.textContent = v;
      div.append(dt, dd);
      return div;
    }),
  );
}
function chart() {
  let r = applied,
    c = r.config,
    fit = r.fits[asset],
    svg = $("timeline"),
    w = svg.clientWidth || 300,
    h = w < 500 ? 300 : 340,
    L = 48,
    R = 18,
    T = 22,
    B = 48,
    ys = r.scores.slice(c.training + 1).map((v) => v[asset]),
    max = Math.max(2, ...ys.map(Math.abs)),
    X = (d) => L + ((d - c.training - 1) / (199 - c.training)) * (w - L - R),
    Y = (s) => T + ((max - s) / (2 * max)) * (h - T - B);
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.replaceChildren();
  const el = (name, attrs, text) => {
    let e = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    svg.append(e);
    return e;
  };
  for (const y of [-max, 0, max]) {
    el("line", { x1: L, x2: w - R, y1: Y(y), y2: Y(y), class: "grid" });
    el(
      "text",
      { x: L - 8, y: Y(y) + 4, "text-anchor": "end", class: "axis" },
      y.toFixed(1),
    );
  }
  for (const y of [-1.25, -0.5, 0.5, 1.25])
    el("line", { x1: L, x2: w - R, y1: Y(y), y2: Y(y), class: "threshold" });
  for (const d of [c.training + 1, Math.round((c.training + 201) / 2), 200])
    el(
      "text",
      {
        x: X(d),
        y: h - 23,
        "text-anchor":
          d === 200 ? "end" : d === c.training + 1 ? "start" : "middle",
        class: "axis",
      },
      d,
    );
  el("text", { x: L, y: h - 2, class: "axis" }, "SYNTHETIC DAY / FROZEN FIT");
  if (fit.eligible)
    el("path", {
      d: ys
        .map((y, i) => `${i ? "L" : "M"}${X(c.training + 1 + i)},${Y(y)}`)
        .join(" "),
      class: "dsr-path",
    });
  el("line", {
    x1: X(day),
    x2: X(day),
    y1: T,
    y2: h - B,
    class: "selected-line",
  });
  if (fit.eligible)
    el("circle", {
      cx: X(day),
      cy: Y(r.scores[day][asset]),
      r: 5,
      class: "dot",
    });
}
function inspect() {
  const r = applied,
    c = r.config,
    a = asset,
    t = day - 1,
    fit = r.fits[a];
  $("selection").className = "selection";
  $("selection").textContent =
    `Asset ${a + 1} · day ${day}: ${fit.eligible ? state(r.positions[t][a]) : "OU fit outside domain, flat"}. Decision uses ${day === c.training + 1 ? "no score on the first held-out day" : `close ${day - 1}`}.`;
  rows("fit-audit", [
    ["AR(1) intercept / a", f(fit.intercept)],
    ["AR(1) coefficient / b", f(fit.phi)],
    ["Innovation variance / SSE / T", f(fit.innovationVariance)],
    ["OU domain", fit.eligible ? "Eligible" : "Not eligible"],
    ["Equilibrium mean", fit.eligible ? f(fit.mean) : "Not available"],
    [
      "Equilibrium deviation",
      fit.eligible ? f(fit.equilibriumSd) : "Not available",
    ],
    [
      "Half-life / synthetic days",
      fit.eligible ? f(fit.halfLife, 3) : "Not available",
    ],
  ]);
  rows("day-audit", [
    ["Day / one-based", String(day)],
    ["Asset return", f(r.returns[t][a])],
    ["Frozen centered return", f(r.returns[t][a] - r.means[a])],
    ["Residual return", f(r.residual[t][a])],
    ["Cumulative residual / X", f(r.levels[day][a])],
    [
      "Previous-close score",
      fit.eligible && day > c.training + 1 ? f(r.scores[t][a]) : "Not used",
    ],
    ["Hypothetical state", state(r.positions[t][a])],
    [
      "Close score / next decision",
      fit.eligible ? f(r.scores[day][a]) : "Not available",
    ],
  ]);
  const weights = r.projector[a].map(
    (p, j) => (a === j ? 1 : 0) - (r.scales[a] * p) / r.scales[j],
  );
  $("weights").replaceChildren(
    ...weights.map((v, j) => {
      let d = document.createElement("div"),
        s = document.createElement("span"),
        b = document.createElement("strong");
      s.textContent = `Asset ${j + 1}`;
      b.textContent = f(v);
      d.append(s, b);
      return d;
    }),
  );
  let exposure = 0;
  for (let k = 0; k < c.factors; k++) {
    let e = 0;
    for (let j = 0; j < 6; j++)
      e += weights[j] * r.scales[j] * r.eigen.vectors[j][k];
    exposure = Math.max(exposure, Math.abs(e));
  }
  $("weight-audit").textContent =
    `Coefficient sum ${f(weights.reduce((a, b) => a + b, 0))} · gross coefficient sum ${f(weights.reduce((a, b) => a + Math.abs(b), 0))} · maximum retained-PC exposure ${exposure.toExponential(2)}. These are diagnostics, not risk guarantees.`;
  $("ledger").replaceChildren(
    ...r.residual.slice(c.training).map((row, j) => {
      let d = c.training + j + 1,
        t = d - 1,
        tr = document.createElement("tr");
      if (d === day) {
        tr.className = "selected";
        tr.setAttribute("aria-current", "true");
      }
      for (const v of [
        d,
        f(row[a]),
        f(r.levels[d][a]),
        fit.eligible && j > 0 ? f(r.scores[t][a]) : "Not used",
        state(r.positions[t][a]),
        fit.eligible ? f(r.scores[d][a]) : "Not available",
      ]) {
        let td = document.createElement("td");
        td.textContent = v;
        tr.append(td);
      }
      return tr;
    }),
  );
  chart();
}
function render() {
  const r = applied,
    c = r.config;
  $("explained").textContent = (100 * r.explained).toFixed(2) + "%";
  $("eligible").textContent = r.fits.filter((f) => f.eligible).length + " / 6";
  $("boundary").textContent = "Day " + c.training;
  $("heldout").textContent = String(200 - c.training);
  $("day").min = String(c.training + 1);
  $("day").max = "200";
  day = Math.max(c.training + 1, Math.min(200, day));
  $("day").value = day;
  $("asset").value = asset + 1;
  $("spectrum").replaceChildren(
    ...r.eigen.values.map((value, k) => {
      let d = document.createElement("div"),
        label = document.createElement("span"),
        out = document.createElement("span"),
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
        rect = document.createElementNS(svg.namespaceURI, "rect");
      label.textContent = "PC" + (k + 1);
      out.textContent = ((100 * value) / 6).toFixed(2) + "%";
      svg.setAttribute("viewBox", "0 0 100 20");
      svg.setAttribute("preserveAspectRatio", "none");
      rect.setAttribute("width", String((100 * value) / 6));
      rect.setAttribute("height", "20");
      rect.setAttribute("class", k < c.factors ? "retained" : "discarded");
      svg.append(rect);
      d.append(label, svg, out);
      return d;
    }),
  );
  inspect();
}
$("controls").addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    let c = {};
    for (const k of keys) {
      if (!$(k).value.trim()) throw Error("All controls are required");
      c[k] = Number($(k).value);
    }
    let r = run(c);
    applied = r;
    render();
    $("status").className = "";
    $("status").textContent =
      `APPLIED / ${c.factors} factors · training 1..${c.training} · holdout ${c.training + 1}..200 · seed ${c.seed}`;
  } catch (e) {
    $("status").className = "error";
    $("status").textContent =
      `Not applied: ${e.message}. Previous results retained.`;
  }
});
for (const k of keys)
  $(k).addEventListener("input", () => {
    $("status").className = "";
    $("status").textContent =
      "EDITING / Results still use the last frozen fit.";
  });
for (const k of ["asset", "day"])
  $(k).addEventListener("change", () => {
    let a = Number($("asset").value),
      d = Number($("day").value);
    if (
      !$("asset").value.trim() ||
      !$("day").value.trim() ||
      !Number.isInteger(a) ||
      a < 1 ||
      a > 6 ||
      !Number.isInteger(d) ||
      d <= applied.config.training ||
      d > 200
    ) {
      $("selection").className = "selection error";
      $("selection").textContent =
        "Invalid inspector. Previous asset and day retained.";
      return;
    }
    asset = a - 1;
    day = d;
    inspect();
  });
window.addEventListener("resize", chart);
render();
$("status").textContent =
  "APPLIED / 2 factors · training 1..120 · holdout 121..200 · seed 17";
