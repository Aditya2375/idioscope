import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { run, packed } from "../web/src/model.js";
let checks = 0,
  configs = 0;
function cmp(a, b) {
  if (Array.isArray(a)) {
    assert.equal(a.length, b.length);
    a.forEach((v, i) => cmp(v, b[i]));
  } else if (typeof a === "boolean") {
    assert.equal(a, b);
    checks++;
  } else {
    assert(Number.isFinite(a) && Number.isFinite(b));
    assert(Math.abs(a - b) <= 2e-9 * Math.max(1, Math.abs(b)), `${a} != ${b}`);
    checks++;
  }
}
for (const seed of [1, 17, 9999])
  for (const training of [80, 120, 160])
    for (const factors of [1, 2, 3, 4]) {
      let c = { factors, training, seed },
        j = JSON.parse(
          execFileSync(
            process.env.JAVA || "java",
            ["-cp", "build/classes", "Dump", factors, training, seed].map(
              String,
            ),
            { encoding: "utf8" },
          ),
        );
      cmp(packed(run(c)), j);
      configs++;
    }
console.log(
  `${checks} Java/JS numeric comparisons, ${configs} full configurations passed at scaled2e-9`,
);
