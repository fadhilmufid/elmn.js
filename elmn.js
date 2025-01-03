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

function getJsPath() {
  let pathWithoutHtml = window.location.pathname.replace(
    /\/(\d+)(?=\/|$)/g,
    "/[id]"
  );
  return `/app${pathWithoutHtml}/main.js`; // Adjusted for main.js path
}

async function injectFunctions(functions) {
  const scriptTag = document.createElement("script");

  // Iterate over all functions and dynamically create function declarations in the script
  for (const [name, func] of Object.entries(functions)) {
    // Add the function to the script tag in the correct format
    scriptTag.innerHTML += `window.${name} = ${func.toString()};\n`;
  }
  const changeVariable = (name, value) => {
    const appDiv = document.getElementById("app");
    let trimmedKey = name.trim();

    if (appDiv) {
      document.getElementById(`variables_${trimmedKey}`).innerHTML = value;
    }
  };

  const getVariable = (variable) => {
    const appDiv = document.getElementById("app");
    let trimmedKey = variable.trim();
    if (appDiv) {
      return document.getElementById(`variables_${trimmedKey}`).innerHTML;
    }
  };

  scriptTag.innerHTML += `window.updateUI = ${changeVariable.toString()};\n`;
  scriptTag.innerHTML += `window.getVariable = ${getVariable.toString()};\n`;
  scriptTag.innerHTML += `window.changeVariable = ${changeVariable.toString()};\n`;

  // Append the script to the document body
  document.body.appendChild(scriptTag);
}

// Function to populate variables and components in the HTML
async function populateVariables(html, variables) {
  const promises = [];

  // First, try to execute any JavaScript expressions inside {{ }}
  let processedHtml = html.replace(/{{(.*?)}}/gs, (match, p1) => {
    try {
      let newMatch = p1
        .replace(/{{|}}/g, "")
        .trim()
        .replace(/<>/g, "return `")
        .trim()
        .replace(/<\/>/g, "`")
        .trim();

      const value = new Function("variables", `return (${newMatch})`)(
        variables
      );
      return `<span>${value}</span>`;
    } catch (err) {
      // If it fails to execute as JavaScript, try the regular variable replacement
      const trimmedKey = p1.trim();
      if (trimmedKey.startsWith("variables.")) {
        let value = variables[trimmedKey.substring(10)];
        if (value) {
          if (value instanceof Promise) {
            promises.push(
              value.then((resolved) => ({ key: trimmedKey, resolved }))
            );

            return `<span id="variables_${trimmedKey}">${match}</span>`;
          } else {
            try {
              value = new Function(
                "variables",
                `return variables.${trimmedKey.substring(10)};`
              )(variables);
            } catch (err) {
              console.warn(`Error getting variable ${trimmedKey}: ${err}`);
            }

            return value !== undefined
              ? `<span id="variables_${trimmedKey}">${value}</span>`
              : `<span id="variables_${trimmedKey}">${match}</span>`;
          }
        }
      }

      let newMatch = match
        .replace(/{{|}}/g, "")
        .trim()
        .replace(/<>/g, "return `")
        .trim()
        .replace(/<\/>/g, "`")
        .trim();

      let value = new Function("variables", newMatch)(variables);
      return value;
    }
  });

  // Resolve all promises
  const resolvedPromises = await Promise.all(promises);
  resolvedPromises.forEach(({ key, resolved }) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
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

    // Insert HTML into the DOM
    // document.getElementById('app').innerHTML = html;

    // Load the main.js for the current page if it exists
    const mainJsPath = getJsPath();
    // loadMainJs(getJsPath())
    let functions = {};

    let variables = {};
    try {
      // Dynamically import the page-specific JavaScript
      const module = await import(mainJsPath);
      variables = module.variables || {};
      functions = module.functions || {}; // Import functions as well        } catch (err) {
    } catch (err) {
      console.warn(`No main.js found for ${templatePath}`);
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

    injectFunctions(functions);

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

// Function to initialize the app
function initializeApp() {
  startApp(); // Call the startApp function
}

// Call initializeApp when elmn.js is loaded
initializeApp();

// }

// Function to get the template path based on the current URL
