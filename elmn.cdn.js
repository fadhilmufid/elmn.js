;(async function bootstrapElmnFromCdn() {
  try {
    var script = document.currentScript;
    var src = script && script.src ? script.src : "";
    var base = src ? src.slice(0, src.lastIndexOf("/") + 1) : "";

    var rootAttr = script && script.getAttribute("data-root");
    var navAttr = script && script.getAttribute("data-navigation");
    var runtimeAttr = script && script.getAttribute("data-runtime");

    function inferRootFromLocation() {
      var p = window.location.pathname || "/";
      // /test/index.html -> /test, /test/ -> /test, / -> ""
      p = p.replace(/\/index\.html$/i, "");
      if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
      return p === "/" ? "" : p;
    }

    if (window.ElmnRoot === undefined) {
      window.ElmnRoot = rootAttr !== null ? rootAttr : inferRootFromLocation();
    }
    if (window.ElmnNavigationMode === undefined) {
      window.ElmnNavigationMode = navAttr || "pathless";
    }

    var runtimeUrl = runtimeAttr || base + "elmn.js";
    await import(runtimeUrl);
  } catch (err) {
    console.error("Elmn CDN bootstrap failed:", err);
  }
})();
