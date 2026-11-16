import { mkdirSync, copyFileSync } from "node:fs";
mkdirSync("docs/src", { recursive: true });
for (const f of ["index.html", "styles.css", "src/model.js", "src/app.js"])
  copyFileSync("web/" + f, "docs/" + f);
