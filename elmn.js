// --- Core Globals ---
let functions = {};
let variables = {};
let elmnEffect = {};
let ElmnFunc = {
  elmnVarState: elmnVarState,
  elmnNavigate: elmnNavigate,
  route: route,
  renderTemplate: renderTemplate,
  createDomElement: createDomElement,
};
window.ElmnFunc = ElmnFunc;
window.route = route;

const ELMN_ROUTE_STORAGE_KEY = "elmn:last-route";

function getNavigationMode() {
  return window.ElmnNavigationMode === "pathless" ? "pathless" : "url";
}

function isPathlessMode() {
  return getNavigationMode() === "pathless";
}

function normalizeRoutePath(path) {
  if (path == null) return "/";
  let v = String(path).trim();
  if (v === "") return "/";
  try {
    if (v.startsWith("http://") || v.startsWith("https://")) {
      v = new URL(v).pathname;
    }
  } catch {}
  if (!v.startsWith("/")) v = `/${v}`;
  if (v.length > 1 && v.endsWith("/")) v = v.slice(0, -1);
  return v || "/";
}

function getVirtualPathFromStorage() {
  try {
    const stored = localStorage.getItem(ELMN_ROUTE_STORAGE_KEY);
    return normalizeRoutePath(stored || "/");
  } catch {
    return "/";
  }
}

function setVirtualPath(path) {
  const normalized = normalizeRoutePath(path);
  window.elmnVirtualPath = normalized;
  try {
    localStorage.setItem(ELMN_ROUTE_STORAGE_KEY, normalized);
  } catch {}
}

/** Browsers block pushState/replaceState on file:// and some opaque origins. */
function canUseHistoryApi() {
  try {
    if (typeof history === "undefined" || typeof history.replaceState !== "function") {
      return false;
    }
    if (location.protocol === "file:") return false;
    if (location.origin === "null" || location.origin === "") return false;
    return true;
  } catch {
    return false;
  }
}

function safeHistoryReplace(url) {
  if (!canUseHistoryApi()) return;
  try {
    history.replaceState(null, "", url);
  } catch {
    /* file://, sandboxed iframe, etc. */
  }
}

function safeHistoryPush(url) {
  if (!canUseHistoryApi()) return;
  try {
    history.pushState(null, "", url);
  } catch {
    /* ignore */
  }
}

function normalizeAppBase(value) {
  if (value == null || value === "") return "";
  const s = String(value);
  return s.endsWith("/") && s.length > 1 ? s.slice(0, -1) : s;
}

function isFileProtocol() {
  return location.protocol === "file:";
}

/** Directory containing this HTML file (trailing slash). Used as fetch base on file:// */
function getFileSiteRootDirectory() {
  try {
    let b = new URL(".", location.href).href;
    if (!b.endsWith("/")) b += "/";
    return b;
  } catch {
    return location.href;
  }
}

/**
 * Build an absolute URL for a site path like /pages/index.html.
 * On file://, resolves under the project folder (next to index.html), not location.origin.
 */
function joinSitePath(dirnameNorm, pathWithLeadingSlash) {
  const p = pathWithLeadingSlash.startsWith("/")
    ? pathWithLeadingSlash
    : "/" + pathWithLeadingSlash;
  if (isFileProtocol()) {
    try {
      return new URL(p.replace(/^\//, ""), getFileSiteRootDirectory()).href;
    } catch {
      return getFileSiteRootDirectory() + p.replace(/^\//, "");
    }
  }
  return location.origin + (dirnameNorm || "") + p;
}

/**
 * GitHub Pages project sites live under a path (e.g. /repo-name/).
 * When ElmnRoot is not set, infer it from the current URL so fetches use /test/pages/... not /pages/...
 * On file://, ElmnRoot path segment is always "" — site root is the folder of index.html.
 */
function inferElmnRootFromLocation() {
  if (isFileProtocol()) return "";
  let p = window.location.pathname || "/";
  p = p.replace(/\/index\.html$/i, "");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p === "/" ? "" : p;
}

function getEffectiveElmnRoot() {
  return typeof window.ElmnRoot === "string"
    ? window.ElmnRoot
    : inferElmnRootFromLocation();
}

/** Maps <elmn-component src> to a path under the site root (with optional ElmnRoot prefix). */
function componentFsPathFromSrc(src) {
  const d = window.globalDirname ? window.globalDirname : "";
  if (src.startsWith("/components/")) {
    return `${d}/pages/_components/${src.slice("/components/".length)}`;
  }
  return `${d}/pages${src}`;
}

window.thisElmnPages = {};

let state = {}; // Empty state object, will be populated dynamically based on variables

// Reserved for alternative module loading path (currently loadModules uses blob-based import)
async function createElmnScriptTag(mainJsPath) {
  mainJsPath.forEach((path) => {
    if (path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    const script = document.createElement("script");
    script.setAttribute("elmn-type", "elmn-script");
    script.type = "module";
    script.src = `${window.globalDirname}/app` + path;
    document.head.appendChild(script);
  }  );
}

// --- DOM / Components ---
async function createDomElement(populatedHtml) {
  try {
    const createdAppDiv = document.createElement("div");

    createdAppDiv.innerHTML = populatedHtml; // Replace with populated HTML
    createdAppDiv.classList.add("loaded");
    return createdAppDiv;
  } catch (error) {
    console.warn("Error creating element:", error);
    return null;
  }
}

async function renderElmnComponent(component) {
  let src = component.getAttribute("src");
  let i =
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
  let componentTemplatePath = joinSitePath("", componentFsPathFromSrc(src));
  component.setAttribute("id", `elmn-component-${i}`);
  renderTemplate(
    componentTemplatePath,
    component,
    null,
    component.getAttribute("id")
  );
}

async function renderTemplate(templatePath, appDiv, rootType, templateType) {
  function evaluateExpression(expression, variables, functions) {
    try {
      let newExpression = expression
        .replace(/<>/g, "return `")
        .replace(/<\/>/g, "`")
        .replace(/\s+<\/>/g, "</>") // Remove whitespace before closing tag
        .replace(/<>\s+/g, "<>");

      return new Function("variables", "functions", `return ${newExpression}`)(
        variables,
        functions
      );
    } catch (error) {
      console.warn("Error evaluating expression:", error);
    }
  }

  /** Must live inside renderTemplate so executeFunctions can resolve it (same as evaluateExpression). */
  function processElmnFragment(content, variables, functions, id) {
    try {
      const innerContent = content.match(
        /<elmn-fragment>([\s\S]*?)<\/elmn-fragment>/
      )[1];

      const varMatches = innerContent.match(/variables\.([\w\.]+)/g) || [];
      const processedElmnIds = [];

      varMatches.forEach((varMatch) => {
        const varName = varMatch.replace("variables.", "");
        const startPos = innerContent.indexOf(varMatch);
        const endPos = innerContent.length - startPos - varMatch.length;
        processedElmnIds.push(
          `variables-${varName}-function-${startPos}-${endPos}`
        );
      });

      let processedContent = innerContent
        .replace(/[\s\n\t]+<\/>/g, "</>")
        .replace(/<>[\s\n\t]+/g, "<>")
        .replace(/<>/g, "htmlFragments += `")
        .replace(/<\/>/g, "`");

      const result = new Function(
        "variables",
        "functions",
        `let htmlFragments = []; ${processedContent} return htmlFragments;`
      )(variables, functions);

      const elmnIdAttr = processedElmnIds.length
        ? ` elmn-id="${processedElmnIds.join(" ")}"`
        : "";

      const randomId = id ? id : Math.random().toString(36).substring(2, 15);

      const pageId = document.getElementById("elmn").getAttribute("page-id");

      return result === undefined
        ? `<elmn-fragment elmn-page-id="${pageId}" first-elmn-id="${randomId}" style="display:none"${elmnIdAttr}>${processedContent}</elmn-fragment>` +
            `<elmn-fragment second-elmn-id="" style="display:none"${elmnIdAttr}></elmn-fragment>`
        : `<elmn-fragment elmn-page-id="${pageId}" first-elmn-id="${randomId}" style="display:none"${elmnIdAttr}>${processedContent}</elmn-fragment>` +
            result +
            `<elmn-fragment second-elmn-id=""style="display:none"${elmnIdAttr}></elmn-fragment>`;
    } catch (err) {
      console.warn("Error processing elmn-fragment:", err);
      return `<!-- Error in elmn-fragment: ${err.message} -->`;
    }
  }

  function getJsModules(html, templatePath) {
    const modules = [];
    const dirname = window.globalDirname ? window.globalDirname : "";
    const tagRegex = /<elmn-script(\s[^>]*)?>([\s\S]*?)<\/elmn-script>/gi;

    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      const attrs = (match[1] || "").trim();
      const content = (match[2] || "").trim();

      const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
      if (srcMatch) {
        let src = srcMatch[1].trim();
        let resolvedPath;
        if (
          src.startsWith("/") ||
          src.startsWith("http://") ||
          src.startsWith("https://") ||
          src.startsWith("file:")
        ) {
          resolvedPath = src;
        } else {
          const base = /^(https?:|file:)\/\//.test(templatePath)
            ? templatePath
            : joinSitePath(
                dirname,
                templatePath.startsWith("/") ? templatePath : "/" + templatePath
              );
          resolvedPath = new URL(src, base).href;
        }
        modules.push({ type: "external", path: resolvedPath });
      }

      if (content) {
        modules.push({ type: "inline", content });
      }
    }

    return modules;
  }

  /** If pages/.../index.js exists next to index.html, load it via native dynamic import (no blob wrapper). */
  async function appendColocatedPageModule(modules, templatePath) {
    if (!templatePath || typeof templatePath !== "string") return;
    if (!templatePath.includes("index.html")) return;
    const dirname = window.globalDirname ? window.globalDirname : "";
    const baseForParse =
      /^https?:\/\//i.test(templatePath) || /^file:/i.test(templatePath)
        ? templatePath
        : joinSitePath(
            dirname,
            templatePath.startsWith("/") ? templatePath : `/${templatePath}`
          );
    let pathname;
    try {
      pathname = new URL(baseForParse, window.location.href).pathname;
    } catch {
      return;
    }
    if (dirname && pathname.startsWith(dirname)) {
      pathname = pathname.slice(dirname.length) || "/";
    }
    if (!pathname.endsWith("/index.html")) return;
    const jsPath = pathname.replace(/\/index\.html$/, "/index.js");
    const moduleUrl = joinSitePath(dirname, jsPath);
    try {
      const res = await fetch(moduleUrl, { method: "GET", cache: "no-cache" });
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      if (!buf.byteLength) return;
      const first = new Uint8Array(buf.slice(0, 1))[0];
      if (first === 0x3c) return;
    } catch {
      return;
    }
    modules.push({ type: "external", path: jsPath, loadViaImport: true });
  }

  async function removeBodyScriptTag() {
    let scriptTags = document.body.querySelectorAll("script");
    scriptTags.forEach((script) => {
      script.remove();
    });
  }
  async function fetchTemplate(templatePath) {
    const originalConsoleError = console.error;
    console.error = function (message) {
      if (!message.includes("Failed to load resource")) {
        originalConsoleError.apply(console, arguments);
      }
    };

    try {
      let response = await fetch(templatePath).then((response) => {
        if (!response.ok) {
          return null;
          // throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response;
      });

      let html = await response.text();
      html = html.replace(
        /<link\s+[^>]*href=["'][^"']*docs\.css[^"']*["'][^>]*>\s*/gi,
        ""
      );

      // Create a temporary DOM element to parse the HTML
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;

      // Check if there is a <div> with id "elmn"
      const elmnDiv = tempDiv.querySelector("#elmn");

      if (elmnDiv) {
        return null;
      }
      return html;
    } catch (error) {
      // console.warn("Error fetching template:", error);
      return null;
    } finally {
      console.error = originalConsoleError;
    }
  }

  // --- Routing ---
  async function getTemplatePath(type) {
    let pathSourceRaw =
      window.elmnVirtualPath !== undefined
        ? window.elmnVirtualPath
        : window.location.pathname;
    if (isFileProtocol() && window.elmnVirtualPath === undefined) {
      const pn = window.location.pathname || "";
      if (/index\.html$/i.test(pn)) {
        pathSourceRaw = "/";
      }
    }
    const pathSource = normalizeRoutePath(pathSourceRaw || "/");
    const path = pathSource;

    let dirname = normalizeAppBase(getEffectiveElmnRoot());

    window.globalDirname = dirname;

    let currentScript;
    const scripts = document.head.getElementsByTagName("script");
    for (let script of scripts) {
      if (script.src.endsWith("elmn.js")) {
        currentScript = script;
        break;
      }
    }

    const scriptSrc = currentScript ? currentScript.src : "";

    window.elmnJsPath = scriptSrc !== "" ? scriptSrc : window.globalDirname;

    const finalPath = dirname ? path.replace(dirname, "") : path;

    if (type === "root") {
      return joinSitePath(dirname, "/pages/index.html");
    }

    if (
      finalPath === "/public/" ||
      finalPath === "/" ||
      finalPath === "/index.html" ||
      finalPath === "/public/index.html"
    ) {
      return joinSitePath(dirname, "/pages/index.html");
    }

    const pathArray = finalPath.split("/").filter((item) => item !== "");

    async function urlExists(url) {
      if (isFileProtocol()) {
        try {
          const get = await fetch(url);
          return !!get.ok;
        } catch {
          return false;
        }
      }
      try {
        const head = await fetch(url, { method: "HEAD" });
        if (head.ok) return true;
      } catch {}
      try {
        const get = await fetch(url);
        return !!get.ok;
      } catch {
        return false;
      }
    }

    function combinationsWithId(segments) {
      const result = [];
      const n = segments.length;
      if (n === 0) return result;
      for (let mask = 1; mask < 1 << n; mask++) {
        const replaced = [...segments];
        let count = 0;
        for (let i = 0; i < n; i++) {
          if (mask & (1 << i)) {
            replaced[i] = "[id]";
            count++;
          }
        }
        result.push({ replaced, count });
      }
      result.sort((a, b) => a.count - b.count);
      return result.map((r) => r.replaced);
    }

    const candidates = [];
    if (pathArray.length > 0) {
      const joined = pathArray.join("/");
      candidates.push(`/pages/${joined}/index.html`);
      candidates.push(`/pages/${joined}.html`);
      const idCombos = combinationsWithId(pathArray);
      for (const seg of idCombos) {
        candidates.push(`/pages/${seg.join("/")}/index.html`);
      }
    } else {
      candidates.push("/pages/index.html");
    }

    for (const candidate of candidates) {
      const url = joinSitePath(dirname, candidate);
      if (await urlExists(url)) {
        return url;
      }
    }

    console.warn("Elmn: no route for", finalPath);
    return null;
  }

  // --- Module Loading ---
  async function loadModules(jsModules) {
    async function loadAndImportModule(moduleDef) {
      let fileContent;
      if (moduleDef.type === "external") {
        const dirname = window.globalDirname ? window.globalDirname : "";
        const thisLoadModulePath = /^(https?:|file:)\/\//.test(moduleDef.path)
          ? moduleDef.path
          : joinSitePath(dirname, moduleDef.path);
        if (moduleDef.loadViaImport) {
          return await import(thisLoadModulePath);
        }
        const response = await fetch(thisLoadModulePath);
        if (!response.ok) {
          throw new Error(`Network response was not ok: ${moduleDef.path}`);
        }
        fileContent = await response.text();
      } else {
        fileContent = moduleDef.content;
        if (!/export\s+/.test(fileContent)) {
          fileContent =
            "let variables = {};\nlet functions = {};\nlet elmnEffect = {};\n" +
            fileContent +
            "\nexport { variables, functions, elmnEffect };";
        }
      }

      fileContent = "let ElmnFunc\n" + fileContent;

      const blob = new Blob([fileContent], { type: "text/javascript" });
      const blobUrl = URL.createObjectURL(blob);

      const module = await import(blobUrl);

      const scriptElement = document.createElement("script");
      scriptElement.type = "module";
      scriptElement.setAttribute("elmn-type", "elmn-script");
      scriptElement.src = blobUrl;
      scriptElement.onload = () => URL.revokeObjectURL(blobUrl);
      document.head.appendChild(scriptElement);

      return module;
    }

    try {
      for (const moduleDef of jsModules) {
        if (moduleDef.type === "external" && moduleDef.path.endsWith("/")) {
          continue;
        }
        try {
          const module = await loadAndImportModule(moduleDef);
          if (module) {
            variables = { ...variables, ...(module.variables || {}) };
            functions = { ...functions, ...(module.functions || {}) };
            elmnEffect = { ...elmnEffect, ...(module.elmnEffect || {}) };
          }
        } catch (err) {
          const label = moduleDef.type === "external" ? moduleDef.path : "inline script";
          console.warn(`Error importing ${label}:`, err);
          continue;
        }
      }

      // Add built-in functions
      functions = {
        ...functions,
      };

      elmnEffect = {
        ...elmnEffect,
      };

      variables = {
        ...variables,
      };
      return true;
    } catch (err) {
      console.warn(`Error importing scripts:`, err);
      return false;
    }
  }

  // --- Variable Population ---
  async function populateVariables(html, variables, functions) {
    const promises = [];
    let processedHtml = html.replace(
      /<elmnTag-(\w+)(.*?)>(.*?)<\/elmnTag-\1>/gs,
      (match, tagName, attributes, content) => {
        try {
          // Process attributes first - look for {variables.xxx} in attributes
          let processedAttributes = attributes.replace(
            /\{variables\.([\w\.]+)\}/g,
            (match, varName) => {
              let value = variables[varName];
              if (value instanceof Promise) {
                promises.push(
                  value.then((resolved) => ({ key: varName, resolved }))
                );
                return match;
              }

              if (value !== undefined) {
                return value;
              }
              return match;
            }
          );

          // Process content between tags
          let processedContent = content.replace(
            /\{variables\.([\w\.]+)\}/g,
            (match, varName) => {
              let value = variables[varName];
              if (value instanceof Promise) {
                promises.push(
                  value.then((resolved) => ({ key: varName, resolved }))
                );
                return match;
              }

              if (value !== undefined) {
                return value;
              }
              return match;
            }
          );

          // Add elmn-id for any content that contains variables
          const hasVariables =
            content.match(/\{variables\.([\w\.]+)\}/g) ||
            attributes.match(/\{variables\.([\w\.]+)\}/g);

          const processedElmnIds = [];

          if (hasVariables) {
            const originalAttributes =
              attributes.match(/(\w+="[^"]+"|\w+='[^']+'|\w+=[^\s]+|\w+)/g) ||
              [];
            originalAttributes.forEach((attr) => {
              const [attrName, ...attrValueParts] = attr.split("=");
              const attrValue = attrValueParts
                .join("=")
                .replace(/["']/g, "")
                .trim();
              const varMatches =
                attrValue.match(/\{variables\.([\w\.]+)\}/g) || [];

              varMatches.forEach((varMatch) => {
                const varName = varMatch.match(/\{variables\.([\w\.]+)\}/)[1];
                const startPos = attrValue.indexOf(varMatch);
                const endPos = attrValue.length - startPos - varMatch.length;

                processedElmnIds.push(
                  `variables-${varName}-${attrName.trim()}-${startPos}-${endPos}`
                );
              });
            });

            // Process innerHTML variables
            const innerVars =
              content
                .replace(/[\n\t]/g, "")
                .match(/\{variables\.([\w\.]+)\}/g) || [];
            innerVars.forEach((varMatch) => {
              const varName = varMatch.match(/\{variables\.([\w\.]+)\}/)[1];
              const startPos = content.trim().indexOf(varMatch);
              const endPos = content.trim().length - startPos - varMatch.length;
              processedElmnIds.push(
                `variables-${varName}-innerHTML-${startPos}-${endPos}`
              );
            });
          }

          const elmnIdAttr = processedElmnIds.length
            ? ` elmn-id="${processedElmnIds.join(" ")}"`
            : "";

          const pageId = document
            .getElementById("elmn")
            .getAttribute("page-id");
          return `<${tagName} elmn-page-id="${pageId}"${processedAttributes}${elmnIdAttr}>${processedContent}</${tagName}>`;
        } catch (err) {
          console.warn("Error processing elmnTag:", err);
          return match;
        }
      }
    );

    // Resolve all promises

    const resolvedPromises = await Promise.all(promises);

    resolvedPromises.forEach(({ key, resolved }) => {
      const regex = new RegExp(
        `<\\w+.*?elmn-id="variables_${key}".*?>.*?</\\w+>`,
        "g"
      );
      processedHtml = processedHtml.replace(regex, resolved);
    });

    // Process expressions like {variables.xxx}
    processedHtml = processedHtml.replace(
      /\{(variables\.[^\}]+)\}/g,
      (match, expression) => {
        return evaluateExpression(expression, variables, functions);
      }
    );

    return processedHtml;
  }

  async function executeFunctions(html, variables, functions) {
    const promises = [];

    let processedHtml = html.replace(
      /<elmn-fragment>([\s\S]*?)<\/elmn-fragment>/g,
      (content) => processElmnFragment(content, variables, functions)
    );
    const resolvedPromises = await Promise.all(promises);
    resolvedPromises.forEach(({ key, resolved }) => {
      const regex = new RegExp(
        `<\\w+.*?elmn-id="variables_${key}".*?>.*?</\\w+>`,
        "g"
      );
      processedHtml = processedHtml.replace(regex, resolved);
    });

    return processedHtml;
  }

  // --- Function Injection ---
  async function injectFunctions(functions, variables) {
    async function removeHeadElmnScriptTag() {
      let scriptTags = document.head.querySelectorAll("script");
      scriptTags.forEach((script) => {
        script.getAttribute("elmn-type") === "elmn-script" && script.remove();
      });
    }
    await removeHeadElmnScriptTag();

    // remove all script tags

    // Wait for the removal of scripts to complete before generating the new script
    const scriptTag = document.createElement("script");

    scriptTag.innerHTML += `variables = ${JSON.stringify(variables)};\n`;

    let newElmnEffect = {};
    for (const [key, value] of Object.entries(elmnEffect)) {
      let keyValue = [];
      value.forEach((item) => {
        keyValue.push({
          variables: item.variables,
          functions: {
            before: item.functions?.before?.name || "",
            after: item.functions?.after?.name || "",
          },
        });
      });
      newElmnEffect[key] = keyValue;
    }

    scriptTag.innerHTML += `elmnEffect = ${JSON.stringify(newElmnEffect)};\n`;

    let idElmnFunc = {
      elmnVarState: Math.random()
        .toString(36)
        .replace(/[^a-zA-Z]/g, "")
        .substring(2, 8)
        .toUpperCase(),
      elmnNavigate: Math.random()
        .toString(36)
        .replace(/[^a-zA-Z]/g, "")
        .substring(2, 8)
        .toUpperCase(),
      route: "route",
      renderTemplate: "renderTemplate",
      createDomElement: "createDomElement",
    };

    const escapeForRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    for (const [name, func] of Object.entries(functions)) {
      // Rewrite bare API names to window.<obfuscated id> for the injected script.
      // Do NOT replace inside `ElmnFunc.elmnNavigate` etc. — that would become `ElmnFunc.GFLDRC` while ElmnFunc keeps keys elmnNavigate / elmnVarState.
      let funcStr = func.toString();
      for (const [key, value] of Object.entries(idElmnFunc)) {
        if (key === value) continue;
        funcStr = funcStr.replace(
          new RegExp(`(?<!ElmnFunc\\.)\\b${escapeForRegex(key)}\\b`, "g"),
          value
        );
      }
      scriptTag.innerHTML += `${name} = ${funcStr};\n`;
    }

    scriptTag.innerHTML += `functions = {${Object.keys(functions)
      .map((key) => `${key}: ${key}`)
      .join(",")}};\n`;

    const tempFile = new File([scriptTag.innerHTML], "temp.js", {
      type: "text/javascript",
    });

    const scriptUrl = URL.createObjectURL(tempFile);
    const scriptElement = document.createElement("script");
    scriptElement.type = "text/javascript";
    scriptElement.setAttribute("elmn-type", "elmn-script");

    scriptElement.src = scriptUrl;
    document.head.appendChild(scriptElement);
  }

  async function resolveComponentsInHtml(html, variables, functions) {
    const componentRegex =
      /<elmn-component\s+src=["']([^"']+)["'][^>]*>[\s\S]*?<\/elmn-component>/gi;
    let match;
    let result = html;
    const matches = [];
    while ((match = componentRegex.exec(html)) !== null) {
      matches.push({ fullTag: match[0], src: match[1].trim() });
    }
    for (const { fullTag, src } of matches) {
      const componentPath = joinSitePath("", componentFsPathFromSrc(src));
      let componentHtml = await fetchTemplate(componentPath);
      if (!componentHtml) continue;
      const componentJsModules = getJsModules(componentHtml, componentPath);
      if (componentJsModules.length > 0) {
        await loadModules(componentJsModules);
        await injectFunctions(functions, variables);
      }
      let componentPopulated = await populateVariables(
        componentHtml,
        variables,
        functions
      );
      let componentProcessed = await executeFunctions(
        componentPopulated,
        variables,
        functions
      );
      componentProcessed = await resolveComponentsInHtml(
        componentProcessed,
        variables,
        functions
      );
      componentProcessed = componentProcessed.replace(
        /<elmn-script[\s\S]*?<\/elmn-script>/gi,
        ""
      );
      result = result.replace(fullTag, componentProcessed);
    }
    return result;
  }

  async function renderAllElmnComponents(appDiv) {
    try {
      let components = appDiv.querySelectorAll("elmn-component");
      for (let component of components) {
        await renderElmnComponent(component);
      }
      return true;
    } catch (error) {
      console.error("Error loading template:", error);
      return false;
    }
  }

  async function replaceHtml(appDiv, newAppDiv, templateType) {
    const appDivInDocument = document.body.contains(appDiv);
    if (!appDivInDocument) {
      console.warn("Target appDiv is not in the document");
      return false;
    }
    try {
      if (templateType) {
        appDiv.outerHTML = newAppDiv.innerHTML; // Replace with populated HTML
      } else {
        appDiv.innerHTML = newAppDiv.innerHTML; // Replace with populated HTML
      }
      return true;
    } catch (error) {
      console.warn("Error setting innerHTML:", error);
      return false;
    }
  }

  async function removeElmnScriptTag(html) {
    const elmnScriptTags = html.querySelectorAll("elmn-script");
    elmnScriptTags.forEach((script) => {
      script.remove();
    });
    return true;
  }
  templatePath
    ? templatePath
    : (templatePath = await getTemplatePath(rootType));

  if (!templatePath) {
    console.error("Elmn: could not resolve template path");
    return false;
  }

  if (appDiv) {
    try {
      let templateFile = await fetchTemplate(templatePath);
      if (!templateFile) {
        let pageTemplatePath = templatePath.replace("/index.html", ".html");
        templateFile = await fetchTemplate(pageTemplatePath);
        if (templateFile) {
          templatePath = pageTemplatePath;
        }
        if (!templateFile) {
          console.error("Template not found");
          return false;
        }
      }
      const jsModules = getJsModules(templateFile, templatePath);
      await appendColocatedPageModule(jsModules, templatePath);
      await loadModules(jsModules);
      await injectFunctions(functions, variables);
      if (!templateType) {
        window.globalHtml = templateFile; // Store the HTML in the global variable
      }

      removeBodyScriptTag();

      state = {}; // Reset the state object

      for (const [key, value] of Object.entries(variables)) {
        state[key] = value; // Add key-value pair to state dynamically
      }

      let variablePopulatedHtml = await populateVariables(
        templateFile,
        variables,
        functions
      );

      let populatedHtml;

      if (!window.thisElmnPages) {
        window.thisElmnPages = {};
      }
      if (
        window &&
        window.thisElmnPages &&
        window.thisElmnPages[templatePath] &&
        window.thisElmnPages[templatePath].page
      ) {
        populatedHtml = await window.thisElmnPages[templatePath].page;
      } else {
        populatedHtml = await executeFunctions(
          variablePopulatedHtml,
          variables,
          functions
        );
        populatedHtml = await resolveComponentsInHtml(
          populatedHtml,
          variables,
          functions
        );
        populatedHtml = populatedHtml.replace(
          /<elmn-script[\s\S]*?<\/elmn-script>/gi,
          ""
        );
        window.thisElmnPages[templatePath] = {
          template: templateFile,
          page: populatedHtml,
          variables: variables,
          functions: functions,
        };
      }

      if (templateType) {
        const newAppDiv = await createDomElement(populatedHtml);
        await renderAllElmnComponents(newAppDiv);
        appDiv = document.getElementById(`${templateType}`);
        let htmlReplaced = await replaceHtml(appDiv, newAppDiv, true);
        if (htmlReplaced) {
          removeElmnScriptTag(appDiv);
        }
      } else {
        let newAppDiv = await createDomElement(populatedHtml);
        await renderAllElmnComponents(newAppDiv);

        let htmlReplaced = await replaceHtml(appDiv, newAppDiv);
        removeElmnScriptTag(appDiv);
        if (htmlReplaced) {
          const randomId = Math.random().toString(36).substring(2, 15);
          appDiv.classList.add("loaded");
          if (functions.someFunction) {
            functions.someFunction();
          }
        }
      }
      return true;
    } catch (error) {
      console.warn("Normal Render Template Not Working Force To Root:", error);
      try {
        templatePath = await getTemplatePath("root");
      } catch (error) {
        console.error("Error fetching template:", error);
      }
      return false;
    }
  }
}

// Function to handle routing
async function route(pathOverride) {
  variables = {};
  functions = {};
  let appDiv = document.getElementById("elmn");
  const randomId = Math.random().toString(36).substring(2, 15);
  appDiv.setAttribute("page-id", `elmn-${randomId}`);
  if (pathOverride !== undefined && pathOverride !== null) {
    setVirtualPath(pathOverride);
  }
  if (isPathlessMode() && !window.elmnVirtualPath) {
    setVirtualPath(getVirtualPathFromStorage());
  }
  await renderTemplate(null, appDiv);
  // Set flag indicating route has completed
  window.routeCompleted = true;
  // window.isElmnVarState = window.location.pathname;
  return true;
}

// Function to get the template path based on the current URL

// Main entry point for the SPA
function startApp() {
  if (isPathlessMode()) {
    const rootPath = normalizeRoutePath(getEffectiveElmnRoot() || "/");
    safeHistoryReplace(rootPath || "/");
    setVirtualPath(getVirtualPathFromStorage());
  }
  route();
  window.onpopstate = canUseHistoryApi() ? () => route() : null;
}

function routingListener() {
  document.addEventListener("click", (event) => {
    const navEl = event.target.closest("[data-elmn-nav]");
    if (navEl) {
      const raw = navEl.getAttribute("data-elmn-nav");
      if (raw == null || String(raw).trim() === "") return;
      event.preventDefault();
      event.stopPropagation();
      window.routeCompleted = false;
      let p = String(raw).trim();
      if (p.endsWith("/")) p = p.slice(0, -1);
      try {
        elmnNavigate(p);
      } catch (error) {}
      return;
    }

    const routeElement = event.target.closest("a[href]");
    if (!routeElement) return;
    let href = routeElement.getAttribute("href");

    if (routeElement.tagName === "A" && href && href.trim() !== "/") {
      if (href.startsWith("https://") || href.startsWith("http://")) {
        return;
      }
      event.preventDefault();
      window.routeCompleted = false;
      if (href.endsWith("/")) {
        href = href.slice(0, -1);
      }
      try {
        elmnNavigate(href);
      } catch (error) {}
    } else if (routeElement.tagName === "A" && href && href.trim() === "/") {
      event.preventDefault();
      if (href.startsWith("https://") || href.startsWith("http://")) {
        return;
      }
      try {
        elmnNavigate(href);
      } catch (error) {}
    }
  });
}
routingListener();
startApp();

async function elmnNavigate(path) {
  if (path) {
    const targetPath = normalizeRoutePath(path);
    if (isPathlessMode()) {
      setVirtualPath(targetPath);
    } else {
      const dirname = window.globalDirname ? window.globalDirname : "";
      const browserPath = dirname
        ? `${dirname}${targetPath === "/" ? "" : targetPath}`
        : targetPath;
      safeHistoryPush(browserPath);
      window.elmnVirtualPath = undefined;
    }
    const finishedRoute = await route(targetPath); // Call route function to load the new content
    if (finishedRoute) {
      return true;
    }
  } else {
    console.warn("Path not exist:", path);
  }
}

async function removeAttributesAndGetOuterHTML(element) {
  // Clone the element to avoid modifying the original
  const clonedElement = element.cloneNode(true);

  // Remove all attributes from the cloned element
  while (clonedElement.attributes.length > 0) {
    clonedElement.removeAttribute(clonedElement.attributes[0].name);
  }

  // Return the outerHTML of the modified cloned element
  return clonedElement.outerHTML;
}

// --- State & elmnVarState ---
async function elmnVarState(variableName, value) {
  const functionName = Object.keys(window).find(
    (key) => window[key] === elmnVarState
  );

  // Get the current function's stack trace

  async function processElmnFragment(content, variables, functions, id) {
    function decodeHTMLEntities(text) {
      const decoder = document.createElement("textarea");
      decoder.innerHTML = text;
      return decoder.value;
    }
    try {
      const innerContent = decodeHTMLEntities(content);
      // Find all variables.xxx references in the content
      // Find all variables.xxx references in the content
      const varMatches = innerContent.match(/variables\.([\w\.]+)/g) || [];
      const processedElmnIds = [];

      // Extract variable names and create elmn-ids
      varMatches.forEach((varMatch) => {
        const varName = varMatch.replace("variables.", "");
        const startPos = innerContent.indexOf(varMatch);
        const endPos = innerContent.length - startPos - varMatch.length;
        processedElmnIds.push(
          `variables-${varName}-function-${startPos}-${endPos}`
        );
      });

      // Transform fragment syntax to template literals
      let processedContent = innerContent
        .replace(/[\s\n\t]+<\/>/g, "</>")
        .replace(/<>[\s\n\t]+/g, "<>")
        .replace(/<>/g, "htmlFragments += `")
        .replace(/<\/>/g, "`");

      const result = new Function(
        "variables",
        "functions",
        `let htmlFragments = []; ${processedContent} return htmlFragments;`
      )(variables, functions);

      // Add elmn-id attribute to the wrapper if variables were found
      const elmnIdAttr = processedElmnIds.length
        ? ` elmn-id="${processedElmnIds.join(" ")}"`
        : "";

      const randomId = id ? id : Math.random().toString(36).substring(2, 15);
      const pageId = document.getElementById("elmn").getAttribute("page-id");

      return result === undefined
        ? `<elmn-fragment elmn-page-id="${pageId}" first-elmn-id="${randomId}" style="display:none"${elmnIdAttr}>${processedContent}</elmn-fragment>` +
            `<elmn-fragment second-elmn-id="" style="display:none"${elmnIdAttr}></elmn-fragment>`
        : `<elmn-fragment elmn-page-id="${pageId}" first-elmn-id="${randomId}" style="display:none"${elmnIdAttr}>${processedContent}</elmn-fragment>` +
            result +
            `<elmn-fragment second-elmn-id=""style="display:none"${elmnIdAttr}></elmn-fragment>`;
    } catch (err) {
      console.warn("Error processing elmn-fragment:", err);
      return `<!-- Error in elmn-fragment: ${err.message} -->`;
    }
  }
  async function replaceVariable(variableName, value) {
    if (window.variables && window.variables.hasOwnProperty(variableName)) {
      if (
        typeof window.variables[variableName] === "object" &&
        !Array.isArray(window.variables[variableName])
      ) {
        // For objects, merge the new value with existing object
        window.variables[variableName] = {
          ...window.variables[variableName],
          ...value,
        };
      } else {
        // For primitive values and arrays, directly assign
        window.variables[variableName] = value;
      }
    }
  }

  async function processVariable(variableName, value, idValue, docs, element) {
    if (
      idValue.startsWith("variables-") &&
      idValue.split(".")[0].split("-")[1] === variableName
    ) {
      // Parse the elmn-id to get the attribute and position information
      const [_, varName, attribute, startPos, endPos] = idValue.split("-");

      replaceVariable(variableName, value);

      if (
        attribute === "innerHTML" &&
        !element.hasAttribute("second-elmn-id")
      ) {
        let originalValue = element.innerHTML;
        const start = parseInt(startPos);
        const end = parseInt(endPos);
        const prefix = originalValue.substring(0, start);
        const suffix = originalValue.substring(originalValue.length - end);
        let currentValue = prefix + value + suffix;
        element.innerHTML = currentValue;
      } else if (
        attribute === "function" &&
        !element.hasAttribute("second-elmn-id")
      ) {
        // Get all elements with elmn-id containing this variable
        const allElements = Array.from(docs.querySelectorAll("[elmn-id]"));

        // Find current element's index
        const currentIndex = allElements.indexOf(element);

        // Find next element with same elmn-id
        const nextElement = allElements.slice(currentIndex + 1).find((el) => {
          const elmnIds = el.getAttribute("elmn-id").split(" ");
          return elmnIds.some((id) => id === idValue);
        });

        if (nextElement) {
          // Get all nodes between current and next element
          let content = "";
          let currentNode = element.nextSibling;

          while (currentNode && currentNode !== nextElement) {
            content +=
              currentNode.nodeType === 3
                ? currentNode.textContent
                : currentNode.outerHTML;
            currentNode = currentNode.nextSibling;
          }

          content = value;
          currentNode = element.nextSibling;
          const elmnFunctionId = element.getAttribute("first-elmn-id");

          const data = await processElmnFragment(
            element.innerHTML,
            variables,
            functions,
            elmnFunctionId
          );

          while (currentNode && currentNode !== nextElement) {
            let insideElement = currentNode.nextSibling;
            currentNode.remove();
            currentNode = insideElement;
          }

          if (currentNode) {
            try {
              currentNode.remove();
            } catch (error) {
              console.warn("Error removing node:", error);
            }

            if (element.parentElement) {
              element.outerHTML = data;
            }
          } else {
            const currentElmnId = element.getAttribute("elmn-id");

            let docs = document.getElementById("elmn");
            while (!docs.classList.contains("loaded")) {
              // Keep checking until class is found
              await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms between checks
            }

            let elements = Array.from(docs.querySelectorAll("[elmn-id]"));

            // Find the element with the specific elmn-id
            let newElement = elements.find((element) => {
              const elmnIds = element.getAttribute("elmn-id");
              return elmnIds.includes(currentElmnId);
            });

            if (newElement) {
              let currentNode = newElement.nextSibling;

              while (currentNode && currentNode !== nextElement) {
                let insideElement = currentNode.nextSibling;
                currentNode.remove();
                currentNode = insideElement;
              }
              newElement.outerHTML = data;
            }
          }
        }
      } else if (!element.hasAttribute("second-elmn-id")) {
        // For other attributes, get the current value and update the specific portion
        let originalValue = element.getAttribute(attribute) || "";
        const start = parseInt(startPos);
        const end = parseInt(endPos);
        const prefix = originalValue.substring(0, start);
        const suffix = originalValue.substring(originalValue.length - end);
        let currentValue = prefix + value + suffix;
        element.setAttribute(attribute, currentValue);
      }
    }
    return true;
  }

  async function processElmnComponent(variableName, value) {
    let docs = document.getElementById("elmn");
    while (!docs.classList.contains("loaded")) {
      // Keep checking until class is found
      await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms between checks
    }

    const elements = Array.from(docs.querySelectorAll("[elmn-id]"));
    let processPromises = [];

    elements.forEach((element) => {
      const elmnIdValues = element.getAttribute("elmn-id").split(" ");

      elmnIdValues.forEach((idValue) => {
        if (
          idValue.startsWith("variables-") &&
          idValue.split(".")[0].split("-")[1] === variableName
        ) {
          processPromises.push(
            processVariable(variableName, value, idValue, docs, element)
          );
        }
      });
    });

    await Promise.all(processPromises);
    return true;
  }

  async function processElmnEffect(variableName, type) {
    async function executeEffect(functionToExecute) {
      if (typeof functions[functionToExecute] === "function") {
        try {
          const functionExecuted = await functions[functionToExecute]();
          if (functionExecuted) {
            return true;
          }
        } catch (error) {
          // console.warn(`Error executing ${functionToExecute} function:`, error);
          return false;
        }
      } else {
        console.warn(
          `Function ${functionToExecute} is not defined or not a function`
        );
      }
    }
    async function executeOnStateChangeEffect(type) {
      let allEffectsExecuted = true;
      for (const effect of elmnEffect.onStateChange) {
        // Handle both array and single variable cases
        const effectVars = Array.isArray(effect.variables)
          ? effect.variables
          : [effect.variables];

        if (effectVars.includes(variableName)) {
          const functionToExecute =
            type === "after" ? effect.functions.after : effect.functions.before;

          if (functionToExecute === "") {
          } else {
            const executed = await executeEffect(functionToExecute);
            if (!executed) {
              allEffectsExecuted = false;
            }
          }
        }
      }
      return allEffectsExecuted;
    }
    if (elmnEffect.onStateChange) {
      await executeOnStateChangeEffect(type);
      return true;
    }
  }

  await processElmnEffect(variableName, "before");

  const finishedElmnComponent = await processElmnComponent(variableName, value);
  if (finishedElmnComponent) {
    const finishedElmnEffect = await processElmnEffect(variableName, "after");
    if (finishedElmnEffect) {
      return true;
    }
  }
}
