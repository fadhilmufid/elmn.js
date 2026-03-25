import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const pagesDir = path.join(root, "pages");

const SKIP_DIRS = new Set(["_components", "components"]);

function collectRoutes(dir, segments = []) {
  const routes = [];
  const indexHtml = path.join(dir, "index.html");
  if (fs.existsSync(indexHtml)) {
    const template = path.join("pages", ...segments, "index.html").replace(/\\/g, "/");
    routes.push({
      pattern: [...segments],
      template,
    });
  }
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return routes;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    if (!e.isDirectory()) continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const sub = path.join(dir, e.name);
    routes.push(...collectRoutes(sub, [...segments, e.name]));
  }
  return routes;
}

function main() {
  if (!fs.existsSync(pagesDir)) {
    console.error("Missing pages/ directory");
    process.exit(1);
  }
  const routes = collectRoutes(pagesDir);
  routes.sort((a, b) => {
    if (a.pattern.length !== b.pattern.length) return a.pattern.length - b.pattern.length;
    const ap = a.pattern.join("/");
    const bp = b.pattern.join("/");
    if (ap !== bp) return ap.localeCompare(bp);
    return a.template.localeCompare(b.template);
  });
  const manifest = {
    version: 1,
    generated: new Date().toISOString(),
    routes,
  };
  const outPath = path.join(root, "routes.manifest.json");
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`Wrote ${routes.length} route(s) to ${path.relative(root, outPath)}`);
}

main();
