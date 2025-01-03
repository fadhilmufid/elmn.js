function getTemplatePath() {
  let path = window.location.pathname;

  // Match dynamic segments and replace them with actual placeholders
  path = path.replace(/\/(\d+)(?=\/|$)/g, "/[id]");

  // Check for root path or index.html
  if (path === "/" || path === "/index.html") {
    return "/app/index.html"; // Root path
  }

  // For nested pages, adjust the path accordingly
  if (path.startsWith("/")) {
    return `/app${path}/index.html`; // Adjusted path for dynamic folders
  }

  return `/app/${path}`; // Fallback for other cases
}

function getAbsoluteTemplatePath() {
  let path = window.location.pathname;

  // Match dynamic segments and replace them with actual placeholders
  path = path.replace(/\/(\d+)(?=\/|$)/g, "/[id]");

  // Check for root path or index.html
  if (path === "/" || path === "/index.html") {
    return "/app/"; // Root path
  }

  // For nested pages, adjust the path accordingly
  if (path.startsWith("/")) {
    return `/app${path}/`; // Adjusted path for dynamic folders
  }

  return `/app/${path}`; // Fallback for other cases
}

function getJsPath(html) {
  const scriptSources = [];
  const regex = /<elmnScript\s+src=["']([^"']+)["'][^>]*>/g;

  let match;
  while ((match = regex.exec(html)) !== null) {
    const src = match[1];
    scriptSources.push(src.startsWith("/") ? src : `${src}`);
  }

  return scriptSources;
}

async function injectFunctions(functions, variables) {
  // remove all script tags
  const scriptTags = document.querySelectorAll("script");
  scriptTags.forEach((script) => {
    script.remove();
  });

  // Wait for the removal of scripts to complete before generating the new script
  const scriptTag = document.createElement("script");
  scriptTag.innerHTML += `variables = ${JSON.stringify(variables)};\n`;
  // Iterate over all functions and dynamically create function declarations in the script
  for (const [name, func] of Object.entries(functions)) {
    // Add the function to the script tag in the correct format
    scriptTag.innerHTML += `window.${name} = ${func.toString()};\n`;
  }

  // Append the script to the document body
  document.body.appendChild(scriptTag);
}

// Function to populate variables and components in the HTML
async function populateVariables(html, variables) {
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

async function renderComponent(src, component) {
  const response = await fetch(src);

  if (response.ok) {
    const html = await response.text();

    component.innerHTML = html; // Insert the fetched HTML into the component
  } else {
    console.error(`Failed to load component: ${src}`);
  }
}

// Main function to render the template

let state = {}; // Empty state object, will be populated dynamically based on variables

async function renderTemplate(templatePath) {
  // appDiv.innerHTML = '<div class="loading">Loading...</div>';  // Add loading message or spinner

  try {
    const response = await fetch(templatePath);
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    const html = await response.text();

    const mainJsPath = getJsPath(html);
    console.log(mainJsPath);
    // loadMainJs(getJsPath())
    let functions = {};

    let variables = {};
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

    // Iterate over all keys in variables and add them to state
    for (const [key, value] of Object.entries(variables)) {
      state[key] = value; // Add key-value pair to state dynamically
    }

    // Populate variables and components after inserting the HTML
    const appDiv = document.getElementById("app");
    // const populatedHtml = await populateVariables(html, variables);

    const populatedHtml = await populateVariables(html, variables);

    injectFunctions(functions, variables);

    appDiv.innerHTML = populatedHtml; // Replace with populated HTML

    let components = appDiv.querySelectorAll("elmn-component");

    components.forEach((component) => {
      let src = component.getAttribute("src");
      renderComponent(getAbsoluteTemplatePath() + src, component);
    });

    appDiv.classList.add("loaded");
    if (functions.someFunction) {
      functions.someFunction();
    }
  } catch (error) {
    console.error("Error loading template:", error);
    document.getElementById("app").innerHTML = "<h1>404 - Not Found</h1>";
  }
}

// Function to handle routing
function route() {
  const templatePath = getTemplatePath();
  console.log("Rendering template:", `${templatePath}`);
  renderTemplate(`${templatePath}`);
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
      event.target.tagName === "A"
        ? event.target
        : event.target.parentElement.tagName === "A"
        ? event.target.parentElement
        : event.target;

    // Check if the clicked element is an anchor tag
    if (routeElement.tagName === "A") {
      event.preventDefault(); // Prevent default link behavior (redirect)

      let href = routeElement.getAttribute("href"); // Get the href attribute

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
    }
  });
}

startApp(); // Call the startApp function

// Call initializeApp when elmn.js is loaded

// }

// Function to get the template path based on the current URL
