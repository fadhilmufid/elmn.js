/**
 * Filesystem route resolution (Next-like): static segments beat dynamic `[param]`,
 * then longer (more specific) patterns win.
 * @param {string[]} segments URL pathname segments (no leading/trailing empty)
 * @param {Array<{ pattern: string[], template: string }>} routes
 * @returns {string | null} template path relative to site root, e.g. "pages/todos/index.html"
 */
export function resolveRoute(segments, routes) {
  const candidates = [];
  for (const route of routes) {
    const pat = route.pattern;
    if (pat.length !== segments.length) continue;
    let ok = true;
    for (let i = 0; i < pat.length; i++) {
      const p = pat[i];
      const u = segments[i];
      if (isDynamicSegment(p)) continue;
      if (p !== u) {
        ok = false;
        break;
      }
    }
    if (ok) candidates.push(route);
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const da = dynamicCount(a.pattern);
    const db = dynamicCount(b.pattern);
    if (da !== db) return da - db;
    if (a.pattern.length !== b.pattern.length) return b.pattern.length - a.pattern.length;
    return a.template.localeCompare(b.template);
  });
  return candidates[0].template;
}

function isDynamicSegment(seg) {
  return typeof seg === "string" && seg.startsWith("[") && seg.endsWith("]");
}

function dynamicCount(pattern) {
  return pattern.filter(isDynamicSegment).length;
}

/**
 * @param {string} pathname e.g. "/todos/123" or "/"
 * @returns {string[]}
 */
export function pathnameToSegments(pathname) {
  return pathname.split("/").filter(Boolean);
}
