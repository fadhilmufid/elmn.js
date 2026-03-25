import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { resolveRoute, pathnameToSegments } from "../scripts/resolve-route.mjs";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const manifestPath = path.join(root, "routes.manifest.json");

function loadManifest() {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

describe("resolveRoute", () => {
  const routes = loadManifest().routes;

  it("resolves home (empty segments)", () => {
    expect(resolveRoute([], routes)).toBe("pages/index.html");
  });

  it("resolves /todos", () => {
    expect(resolveRoute(["todos"], routes)).toBe("pages/todos/index.html");
  });

  it("prefers static todos/new over dynamic [id]", () => {
    expect(resolveRoute(["todos", "new"], routes)).toBe("pages/todos/new/index.html");
  });

  it("resolves dynamic segment as [id]", () => {
    expect(resolveRoute(["todos", "123"], routes)).toBe("pages/todos/[id]/index.html");
  });

  it("returns null when no route matches", () => {
    expect(resolveRoute(["unknown", "path"], routes)).toBe(null);
  });

  it("pathnameToSegments matches URL parts", () => {
    expect(pathnameToSegments("/todos/42")).toEqual(["todos", "42"]);
    expect(pathnameToSegments("/")).toEqual([]);
  });
});

describe("generate-routes.mjs", () => {
  it("runs and produces a valid manifest with routes", () => {
    execSync("node scripts/generate-routes.mjs", { cwd: root, stdio: "pipe" });
    const m = loadManifest();
    expect(m.version).toBe(1);
    expect(Array.isArray(m.routes)).toBe(true);
    expect(m.routes.length).toBeGreaterThan(0);
    const templates = m.routes.map((r) => r.template);
    expect(templates).toContain("pages/index.html");
    expect(templates.some((t) => t.includes("[id]"))).toBe(true);
  });
});
