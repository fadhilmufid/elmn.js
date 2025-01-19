async function oneOrZero() {
  return 10;
}

// Function to fetch text asynchronously (this simulates loading content)

// Fetch initial data and set it to variables
const text = "testing";
const number = await oneOrZero();

async function changeName() {
  console.log(variables.text);
}

export let functions = {
  changeNumber: changeName, // Export function as part of the functions object
};

export let variables = {
  number: number, // Initial number value
  homeLink: "/",
  home: "home",
  todos: "Todos",
  about: "About",
  contact: "Contact",
  text: text,
};
