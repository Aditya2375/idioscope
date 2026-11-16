import { run, defaults } from "../web/src/model.js";
import { spawn } from "node:child_process";
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  mkdtempSync,
} from "node:fs";

const HTTP_PORT = 8998;
const CDP_PORT = 9399;
const SHOTS = process.env.SMOKE_SHOTS === "1";
const root = new URL("..", import.meta.url).pathname;

const profile = mkdtempSync("/tmp/idioscope-chrome-");
const server = spawn(
  "python3",
  [
    "-m",
    "http.server",
    String(HTTP_PORT),
    "--bind",
    "127.0.0.1",
    "--directory",
    `${root}docs`,
  ],
  { stdio: "ignore", detached: true },
);
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore", detached: true },
);

const cleanup = async (code) => {
  for (const child of [chrome, server]) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
  await Promise.all(
    [chrome, server].map((child) =>
      child.exitCode !== null
        ? Promise.resolve()
        : new Promise((r) => child.once("exit", r)),
    ),
  );
  rmSync(profile, { recursive: true, force: true });
  process.exit(code);
};
const timeout = setTimeout(() => {
  console.error("smoke: timeout");
  cleanup(1);
}, 90000);
process.on("SIGINT", () => cleanup(2));
process.on("uncaughtException", (e) => {
  console.error(e);
  cleanup(1);
});
process.on("unhandledRejection", (e) => {
  console.error(e);
  cleanup(1);
});

async function waitFor(fn, label, timeoutMs = 60000) {
  const start = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    if (Date.now() - start > timeoutMs)
      throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(
    `${ok ? "ok" : "NOT OK"} - ${name}${detail ? " - " + detail : ""}`,
  );
};

await waitFor(
  async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok,
  "chrome devtools",
);
const target = await (
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: "PUT" })
).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let mid = 0;
const rpcPending = new Map();
const consoleErrors = [];
const requests = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === "Network.requestWillBeSent")
    requests.push(msg.params.request.url);
  if (msg.id && rpcPending.has(msg.id)) {
    rpcPending.get(msg.id)(msg);
    rpcPending.delete(msg.id);
  } else if (msg.method === "Runtime.exceptionThrown")
    consoleErrors.push(
      msg.params.exceptionDetails?.exception?.description ?? "page exception",
    );
};
const cdp = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++mid;
    rpcPending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const res = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.result?.exceptionDetails)
    throw new Error(JSON.stringify(res.result.exceptionDetails));
  return res.result?.result?.value;
};
const shot = async (name) => {
  if (!SHOTS) return;
  await new Promise((r) => setTimeout(r, 900));
  const metrics = await cdp("Page.getLayoutMetrics");
  const size = metrics.result.cssContentSize;
  const r = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: {
      x: 0,
      y: 0,
      width: await evaluate("innerWidth"),
      height: size.height,
      scale: 1,
    },
  });
  writeFileSync(
    `${root}smoke-${name}.png`,
    Buffer.from(r.result.data, "base64"),
  );
};

await cdp("Runtime.enable");
await cdp("Network.enable");
await cdp("Page.enable");
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
const url = process.env.SMOKE_URL || `http://127.0.0.1:${HTTP_PORT}/`;
await cdp("Page.navigate", { url });
await waitFor(
  async () =>
    await evaluate(`document.querySelectorAll('#ledger tr').length===80`),
  "rendered",
);
const f = (x, n = 6) =>
    x !== 0 && Math.abs(x) < 1e-6 ? x.toExponential(3) : x.toFixed(n),
  eq = (a, b) => JSON.stringify(a) === JSON.stringify(b),
  state = (p) =>
    p === 1 ? "+1 long residual" : p === -1 ? "-1 short residual" : "0 flat";
const input = (id, v) =>
  evaluate(
    `document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(String(v))};true`,
  );
const apply = async (c) => {
  for (const [k, v] of Object.entries(c)) await input(k, v);
  await evaluate(
    `document.getElementById('controls').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));true`,
  );
};
const inspect = async (a, d) => {
  await input("asset", a + 1);
  await input("day", d);
  await evaluate(
    `document.getElementById('day').dispatchEvent(new Event('change',{bubbles:true}));true`,
  );
};
async function verify(c, a, d, label) {
  let r = run(c),
    fit = r.fits[a],
    s = await evaluate(
      `(()=>{const t=id=>document.getElementById(id).textContent;return {metrics:['explained','eligible','boundary','heldout'].map(t),audit:['fit-audit','day-audit'].map(id=>[...document.querySelectorAll('#'+id+' dd')].map(e=>e.textContent)),weights:[...document.querySelectorAll('#weights strong')].map(e=>e.textContent),ledger:[...document.querySelectorAll('#ledger tr')].map(e=>[...e.cells].map(e=>e.textContent)),spectrum:[...document.querySelectorAll('#spectrum rect')].map(e=>[Number(e.getAttribute('width')),e.getAttribute('class')]),selected:document.querySelector('#ledger tr.selected')?.cells[0].textContent,selection:t('selection'),w:document.getElementById('timeline').clientWidth,view:document.getElementById('timeline').getAttribute('viewBox'),path:document.querySelector('#timeline path')?.getAttribute('d'),dot:[...document.querySelectorAll('#timeline circle')].map(e=>[Number(e.getAttribute('cx')),Number(e.getAttribute('cy'))])}})()`,
    );
  check(
    label + " metrics",
    eq(s.metrics, [
      (r.explained * 100).toFixed(2) + "%",
      r.fits.filter((f) => f.eligible).length + " / 6",
      "Day " + c.training,
      String(200 - c.training),
    ]),
  );
  check(
    label + " frozen fit7",
    eq(s.audit[0], [
      f(fit.intercept),
      f(fit.phi),
      f(fit.innovationVariance),
      fit.eligible ? "Eligible" : "Not eligible",
      fit.eligible ? f(fit.mean) : "Not available",
      fit.eligible ? f(fit.equilibriumSd) : "Not available",
      fit.eligible ? f(fit.halfLife, 3) : "Not available",
    ]),
  );
  check(
    label + " day audit8",
    eq(s.audit[1], [
      String(d),
      f(r.returns[d - 1][a]),
      f(r.returns[d - 1][a] - r.means[a]),
      f(r.residual[d - 1][a]),
      f(r.levels[d][a]),
      fit.eligible && d > c.training + 1 ? f(r.scores[d - 1][a]) : "Not used",
      state(r.positions[d - 1][a]),
      fit.eligible ? f(r.scores[d][a]) : "Not available",
    ]),
  );
  check(
    label + " hedge6",
    eq(
      s.weights,
      r.projector[a].map((p, j) =>
        f((a === j ? 1 : 0) - (r.scales[a] * p) / r.scales[j]),
      ),
    ),
  );
  check(
    label + " ledger all cells",
    eq(
      s.ledger,
      r.residual.slice(c.training).map((row, j) => {
        let d = c.training + j + 1;
        return [
          String(d),
          f(row[a]),
          f(r.levels[d][a]),
          fit.eligible && j > 0 ? f(r.scores[d - 1][a]) : "Not used",
          state(r.positions[d - 1][a]),
          fit.eligible ? f(r.scores[d][a]) : "Not available",
        ];
      }),
    ),
  );
  check(
    label + " spectrum6",
    s.spectrum.every(
      ([w, cl], k) =>
        Math.abs(w - (100 * r.eigen.values[k]) / 6) < 1e-9 &&
        cl === (k < c.factors ? "retained" : "discarded"),
    ),
  );
  check(label + " selected day", s.selected === String(d));
  let w = s.w,
    h = w < 500 ? 300 : 340,
    max = Math.max(
      2,
      ...r.scores.slice(c.training + 1).map((v) => Math.abs(v[a])),
    ),
    X = (d) => 48 + ((d - c.training - 1) / (199 - c.training)) * (w - 66),
    Y = (y) => 22 + ((max - y) / (2 * max)) * (h - 70),
    expected = r.scores
      .slice(c.training + 1)
      .flatMap((v, j) => [X(c.training + 1 + j), Y(v[a])]),
    coords = (s.path || "")
      .replace(/[ML]/g, " ")
      .trim()
      .split(/[ ,]+/)
      .filter(Boolean)
      .map(Number);
  check(
    label + " full curve pixels",
    !fit.eligible
      ? !s.path
      : coords.length === expected.length &&
          coords.every((v, i) => Math.abs(v - expected[i]) < 1e-8),
  );
  check(
    label + " chosen dot",
    !fit.eligible
      ? s.dot.length === 0
      : Math.abs(s.dot[0][0] - X(d)) < 1e-8 &&
          Math.abs(s.dot[0][1] - Y(r.scores[d][a])) < 1e-8,
  );
  check(label + " viewBox", s.view === `0 0 ${w} ${h}`);
}
await verify(defaults, 0, 150, "default");
await shot("default");
for (let a = 0; a < 6; a++)
  for (const d of [121, 150, 200]) {
    await inspect(a, d);
    await verify(defaults, a, d, `asset${a}day${d}`);
  }
for (const c of [
  { factors: 1, training: 80, seed: 1 },
  { factors: 4, training: 160, seed: 9999 },
  { factors: 3, training: 100, seed: 42 },
]) {
  await apply(c);
  await inspect(5, 200);
  await verify(c, 5, 200, "extreme" + c.seed);
  await shot("scenario" + c.seed);
}
await apply(defaults);
await inspect(0, 150);
let before = await evaluate(`document.getElementById('ledger').innerHTML`);
for (const [k, v] of [
  ["factors", ""],
  ["factors", "5"],
  ["training", "79"],
  ["seed", "0"],
  ["training", "100.5"],
  ["seed", "10000"],
]) {
  await apply(defaults);
  await input(k, v);
  await evaluate(
    `document.getElementById('controls').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));`,
  );
  check(
    "invalid " + k + v,
    (await evaluate(`document.getElementById('ledger').innerHTML`)) === before,
  );
  check(
    "invalid notice",
    await evaluate(
      `document.getElementById('status').textContent.startsWith('Not applied')`,
    ),
  );
}
await apply(defaults);
for (const [k, v] of [
  ["asset", "0"],
  ["day", "120"],
  ["day", "201"],
  ["asset", "1.5"],
  ["day", ""],
]) {
  await inspect(0, 150);
  await input(k, v);
  await evaluate(
    `document.getElementById('day').dispatchEvent(new Event('change',{bubbles:true}));`,
  );
  check(
    "inspector retained " + k + v,
    (await evaluate(`document.getElementById('ledger').innerHTML`)) === before,
  );
  check(
    "inspector notice",
    await evaluate(
      `document.getElementById('selection').textContent.startsWith('Invalid')`,
    ),
  );
}
await inspect(0, 150);
await input("seed", 9999);
await evaluate(
  `document.getElementById('seed').dispatchEvent(new Event('input',{bubbles:true}));`,
);
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 950,
  deviceScaleFactor: 1,
  mobile: false,
});
await waitFor(
  async () =>
    await evaluate(
      `document.getElementById("timeline").getAttribute("viewBox").split(" ")[2]===String(document.getElementById("timeline").clientWidth)`,
    ),
  "dirty resize painted",
);
await verify(defaults, 0, 150, "dirtyResize");
check(
  "editing notice",
  await evaluate(
    `document.getElementById('status').textContent.startsWith('EDITING')`,
  ),
);
await apply(defaults);
for (const width of [1440, 768, 390, 360, 320]) {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height: 950,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((r) => setTimeout(r, 100));
  await verify(defaults, 0, 150, "width" + width);
  const b = await evaluate(
    `(()=>{const B=e=>{const r=e.getBoundingClientRect();return[r.left,r.right,r.height]};return{page:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('input,button')].map(B),core:[...document.querySelectorAll('.metrics,.spectrum,dl,.weights,.intro,#timeline')].map(B),scroll:document.querySelector('.table-scroll').scrollWidth>document.querySelector('.table-scroll').clientWidth}})()`,
  );
  check(width + " page bounds", b.page <= width);
  check(
    width + " margins",
    b.controls.every((v) => v[0] >= 17 && v[1] <= width - 17),
  );
  check(
    width + " control44",
    b.controls.every((v) => v[2] >= 44),
  );
  check(
    width + " core containment",
    b.core.every((v) => v[0] >= 17 && v[1] <= width - 17),
  );
  if (width < 768) check(width + " supplemental scroll", b.scroll);
  await shot("width" + width);
}
check(
  "ledger reachable right edge",
  await evaluate(
    `(()=>{let e=document.querySelector('.table-scroll');e.scrollLeft=e.scrollWidth;return e.scrollLeft>0&&Math.abs(e.scrollLeft-(e.scrollWidth-e.clientWidth))<1})()`,
  ),
);
check(
  "ledger reachable final row",
  await evaluate(
    `(()=>{let e=document.querySelector('.table-scroll');e.scrollTop=e.scrollHeight;return e.scrollTop>0&&Math.abs(e.scrollTop-(e.scrollHeight-e.clientHeight))<1})()`,
  ),
);
await shot("ledger-right320");
await evaluate(
  `document.querySelector('.table-scroll').scrollLeft=0;document.querySelector('.table-scroll').scrollTop=0`,
);
await cdp("Input.dispatchKeyEvent", {
  type: "keyDown",
  key: "Tab",
  code: "Tab",
  windowsVirtualKeyCode: 9,
});
await cdp("Input.dispatchKeyEvent", {
  type: "keyUp",
  key: "Tab",
  code: "Tab",
  windowsVirtualKeyCode: 9,
});
check(
  "keyboard focus",
  await evaluate(
    `(()=>{document.querySelector('button').focus();return getComputedStyle(document.activeElement).outlineStyle!=='none'})()`,
  ),
);
await cdp("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
check(
  "reduced motion",
  await evaluate(
    `getComputedStyle(document.documentElement).scrollBehavior==='auto'`,
  ),
);
await cdp("Emulation.setEmulatedMedia", { features: [] });
await cdp("Network.emulateNetworkConditions", {
  offline: false,
  latency: 250,
  downloadThroughput: 50000,
  uploadThroughput: 50000,
});
await cdp("Page.reload", { ignoreCache: true });
await waitFor(
  async () =>
    await evaluate(`document.querySelectorAll('#ledger tr').length===80`),
  "throttled render",
);
await verify(defaults, 0, 150, "throttled");
await shot("throttled320");
check(
  "same origin",
  requests
    .filter((x) => !x.startsWith("about:"))
    .every(
      (x) => x.startsWith(new URL(url).origin + "/") || x.startsWith("data:"),
    ),
);
check("no exceptions", consoleErrors.length === 0, consoleErrors.join(";"));
check(
  "no storage",
  await evaluate(
    `localStorage.length===0&&sessionStorage.length===0&&document.cookie===''`,
  ),
);
check(
  "CSP",
  await evaluate(
    `document.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes("connect-src 'none'")`,
  ),
);
check(
  "no inline style",
  await evaluate(`document.querySelectorAll('[style]').length===0`),
);
writeFileSync(`${root}browser-checks.json`, JSON.stringify(checks, null, 2));
console.log(
  `${checks.length} Chrome checks, ${checks.filter((c) => !c.ok).length} failures`,
);
clearTimeout(timeout);
ws.close();
await cleanup(checks.some((c) => !c.ok) ? 1 : 0);
