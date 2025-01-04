// import { variables } from "./app/test";
let functions = {};
let variables = {};
window.renderTemplate = renderTemplate(window.templatePath);
function getTemplatePath() {
  let path = window.location.pathname;

  // Match dynamic segments and replace them with actual placeholders
  path = path.replace(/\/(\d+)(?=\/|$)/g, "/[id]");

  // Check for root path or index.html
  if (path === "/" || path === "/index.html") {
    return "/app/pages/index.html"; // Root path
  }

  // For nested pages, adjust the path accordingly
  if (path.startsWith("/")) {
    return `/app/pages${path}/index.html`; // Adjusted path for dynamic folders
  }

  return `/app/pages/${path}`; // Fallback for other cases
}

function getAbsoluteTemplatePath() {
  let path = window.location.pathname;

  // Match dynamic segments and replace them with actual placeholders
  path = path.replace(/\/(\d+)(?=\/|$)/g, "/[id]");

  // Check for root path or index.html
  if (path === "/" || path === "/index.html") {
    return "/app/pages/"; // Root path
  }

  // For nested pages, adjust the path accordingly
  if (path.startsWith("/")) {
    return `/app/pages${path}/`; // Adjusted path for dynamic folders
  }

  return `/app/pages/${path}`; // Fallback for other cases
}

function getJsPath(html) {
  const scriptSources = [];
  const regex = /<elmnscript\s+src=["']([^"']+)["'][^>]*>/g;

  let match;
  while ((match = regex.exec(html)) !== null) {
    const src = match[1];
    scriptSources.push(src.startsWith("/") ? src : `${src}`);
  }

  // Remove all elmnscript tags from the HTML
  const elmnscriptRegex = /<elmnscript\s+[^>]*>[\s\S]*?<\/elmnscript>/g;
  html = html.replace(elmnscriptRegex, "");

  return scriptSources;
}

async function injectFunctions(html, functions, variables) {
  // remove all script tags

  // Wait for the removal of scripts to complete before generating the new script
  const scriptTag = document.createElement("script");
  scriptTag.innerHTML += `variables = ${JSON.stringify(variables)};\n`;

  // Iterate over all functions and dynamically create function declarations in the script
  for (const [name, func] of Object.entries(functions)) {
    // Add the function to the script tag in the correct format
    scriptTag.innerHTML += `window.${name} = ${func.toString()};\n`;
  }

  scriptTag.innerHTML += `functions = {${Object.keys(functions)
    .map((key) => `${key}: window.${key}`)
    .join(",")}};\n`;

  // Append the script to the document body
  document.body.appendChild(scriptTag);
}

function processElmnFunc(content, variables, functions) {
  try {
    // Extract the actual content between the tags
    const innerContent = content.match(/<elmnFunc>([\s\S]*?)<\/elmnFunc>/)[1];

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
      .replace(/<>/g, "ratatata += `")
      .replace(/<\/>/g, "`");

    const result = new Function(
      "variables",
      "functions",
      `let ratatata = []; ${processedContent} return ratatata;`
    )(variables, functions);

    // Add elmn-id attribute to the wrapper if variables were found
    const elmnIdAttr = processedElmnIds.length
      ? ` elmn-id="${processedElmnIds.join(" ")}"`
      : "";

    return result === undefined
      ? `<elmnFunc style="display:none"${elmnIdAttr}>${processedContent}</elmnFunc>` +
          `<elmnFunc second-elmn-id="" style="display:none"${elmnIdAttr}></elmnFunc>`
      : `<elmnFunc style="display:none"${elmnIdAttr}>${processedContent}</elmnFunc>` +
          result +
          `<elmnFunc second-elmn-id=""style="display:none"${elmnIdAttr}></elmnFunc>`;
  } catch (err) {
    console.warn("Error processing elmnFunc:", err);
    return `<!-- Error in elmnFunc: ${err.message} -->`;
  }
}

async function executeFunctions(html, variables, functions) {
  const promises = [];

  let processedHtml = html.replace(
    /<elmnFunc>([\s\S]*?)<\/elmnFunc>/g,
    (content) => processElmnFunc(content, variables, functions)
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

// Function to populate variables and components in the HTML
async function populateVariables(html, variables, functions) {
  const promises = [];

  // let processedHtml = html.replace(
  //   /<elmnFunc>([\s\S]*?)<\/elmnFunc>/g,
  //   (match, content) => processElmnFunc(content, variables, functions)
  // );

  let processedHtml = html.replace(
    /<elmnTag-(\w+)(.*?)>(.*?)<\/elmnTag-\1>/gs,
    (match, tagName, attributes, content) => {
      try {
        // Process attributes first - look for {variables.xxx} in attributes
        let processedAttributes = attributes.replace(
          /\{variables\.([\w\.]+)\}/g,
          (match, varName) => {
            let value = variables[varName];
            return value !== undefined ? value : match;
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
        const hasVariables = content.match(/\{variables\.([\w\.]+)\}/g);
        const processedElmnIds = [];

        if (hasVariables) {
          // Clean up the tag name by removing elmnTag- prefix and trimming
          const cleanTagName = tagName.replace("elmnTag-", "").trim();

          // First, let's find all variables in the original attributes before processing
          const originalAttributes =
            attributes
              .replace(/[\n\t]/g, "")
              .match(/(\w+)=["']([^"']*\{variables\.[^"']+[^"']*)["']/g) || [];

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
            content.replace(/[\n\t]/g, "").match(/\{variables\.([\w\.]+)\}/g) ||
            [];
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

        return `<${tagName}${processedAttributes}${elmnIdAttr}>${processedContent}</${tagName}>`;
      } catch (err) {
        console.warn("Error processing elmnTag:", err);
        return match;
      }
    }
  );

  // Resolve all promises

  // Process expressions like {variables.xxx}
  processedHtml = processedHtml.replace(
    /\{(variables\.[^\}]+)\}/g,
    (match, expression) => {
      return evaluateExpression(expression, variables, functions);
    }
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

let state = {}; // Empty state object, will be populated dynamically based on variables

async function renderTemplate(templatePath, appDiv) {
  if (appDiv) {
    try {
      const response = await fetch(templatePath);
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      const html = await response.text();
      window.globalHtml = html; // Store the HTML in the global variable

      let scriptTags = document.body.querySelectorAll("script");
      scriptTags.forEach((script) => {
        script.remove();
      });

      scriptTags = document.head.querySelectorAll("script");
      scriptTags.forEach((script) => {
        script.getAttribute("elmn-type") === "elmn-script" && script.remove();
      });

      const mainJsPath = getJsPath(html);

      // Add script tag to header for each JS path
      mainJsPath.forEach((path) => {
        const script = document.createElement("script");
        script.setAttribute("elmn-type", "elmn-script");
        script.type = "module";
        script.src = "/app" + path;
        document.head.appendChild(script);
      });
      // Generate script headers from mainJsPath array
      // loadMainJs(getJsPath())
      try {
        // Loop through each path and import
        for (let path of mainJsPath) {
          const module = await import("/app" + path);
          // Merge variables and functions from each module
          variables = { ...variables, ...(module.variables || {}) };
          functions = { ...functions, ...(module.functions || {}) };
        }
      } catch (err) {
        console.warn(`Error importing scripts:`, err);
      }

      state = {}; // Reset the state object

      for (const [key, value] of Object.entries(variables)) {
        state[key] = value; // Add key-value pair to state dynamically
      }

      const varialblePopulatedHtml = await populateVariables(
        html,
        variables,
        functions
      );

      const populatedHtml = await executeFunctions(
        varialblePopulatedHtml,
        variables,
        functions
      );

      await injectFunctions(populatedHtml, functions, variables);

      try {
        appDiv.innerHTML = populatedHtml; // Replace with populated HTML
      } catch (error) {
        console.warn("Error setting innerHTML:", error);
      }

      let components = appDiv.querySelectorAll("elmn-component");

      components.forEach((component) => {
        let src = component.getAttribute("src");
        // renderComponent(c, component);
        renderTemplate("/app/pages" + src, component);
      });

      appDiv.classList.add("loaded");
      if (functions.someFunction) {
        functions.someFunction();
      }
    } catch (error) {
      console.error("Error loading template:", error);
      // document.getElementById("app").innerHTML = "<h1>404 - Not Found</h1>";
    }
  }
}

// Function to handle routing
function route() {
  variables = {};
  functions = {};
  const templatePath = getTemplatePath();
  window.templatePath = templatePath;
  let appDiv = document.getElementById("app");
  renderTemplate(`${templatePath}`, appDiv);
}

// Function to get the template path based on the current URL

// Main entry point for the SPA
function startApp() {
  // Handle the initial route
  route();

  // Listen for back/forward navigation
  window.onpopstate = route;

  // Handle link clicks to enable client-side navigation
  document.addEventListener("click", (event) => {
    let routeElement =
      event.target.tagName === "A" ? event.target : event.target;

    let href = routeElement.getAttribute("href"); // Get the href attribute

    // Check if the clicked element is an anchor tag
    if (routeElement.tagName === "A" && href.trim() !== "/") {
      event.preventDefault(); // Prevent default link behavior (redirect)

      // Remove trailing slash if it exists
      if (href.endsWith("/")) {
        href = href.slice(0, -1); // Remove the trailing slash
      }

      try {
        history.pushState(null, "", href); // Update the URL in the browser
        route(); // Call route function to load the new content
      } catch (error) {
        alert("Error pushing state: " + error); // Catch any errors
      }
    } else if (routeElement.tagName === "A" && href.trim() === "/") {
      event.preventDefault(); // Prevent default link behavior (redirect)
      history.pushState(null, "", href); // Update the URL in the browser
      route(); // Call route function to load the new content
    }
  });
}

startApp();

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
    // return "";
  }
}

async function elmnState(variableName, value) {
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
  async function processElmnFunc(content, variables, functions) {
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
        .replace(/<>/g, "ratatata += `")
        .replace(/<\/>/g, "`");

      const result = new Function(
        "variables",
        "functions",
        `let ratatata = []; ${processedContent} return ratatata;`
      )(variables, functions);

      // Add elmn-id attribute to the wrapper if variables were found
      const elmnIdAttr = processedElmnIds.length
        ? ` elmn-id="${processedElmnIds.join(" ")}"`
        : "";

      return result === undefined
        ? `<elmnFunc style="display:none"${elmnIdAttr}>${processedContent}</elmnFunc>` +
            `<elmnFunc second-elmn-id="" style="display:none"${elmnIdAttr}></elmnFunc>`
        : `<elmnFunc style="display:none"${elmnIdAttr}>${processedContent}</elmnFunc>` +
            result +
            `<elmnFunc second-elmn-id=""style="display:none"${elmnIdAttr}></elmnFunc>`;
    } catch (err) {
      console.warn("Error processing elmnFunc:", err);
      return `<!-- Error in elmnFunc: ${err.message} -->`;
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
  // Update the variable in the global scope

  let docs = document.getElementById("app");
  while (!docs.classList.contains("loaded")) {
    // Keep checking until class is found
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms between checks
  }

  const elements = Array.from(docs.querySelectorAll("[elmn-id]"));
  elements.forEach((element) => {
    const elmnIdValues = element.getAttribute("elmn-id").split(" ");

    elmnIdValues.forEach(async (idValue) => {
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
          let currentValue = element.innerHTML;
          const start = parseInt(startPos);
          const end = parseInt(endPos);
          const prefix = currentValue.substring(0, start);
          const suffix = currentValue.substring(currentValue.length - end);
          currentValue = prefix + value + suffix;
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

            const data = await processElmnFunc(
              element.innerHTML,
              variables,
              functions
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
              element.outerHTML = data;
            } else {
              const currentElmnId = element.getAttribute("elmn-id");

              let docs = document.getElementById("app");
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
          let currentValue = element.getAttribute(attribute) || "";
          const start = parseInt(startPos);
          const end = parseInt(endPos);
          const prefix = currentValue.substring(0, start);
          const suffix = currentValue.substring(currentValue.length - end);
          currentValue = prefix + value + suffix;
          element.setAttribute(attribute, currentValue);
        }
      }
    });
  });
}

export { elmnState };
