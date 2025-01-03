async function oneOrZero() {
  return 10;
}

// Function to fetch text asynchronously (this simulates loading content)
async function getText() {
  const response = await fetch("https://jsonplaceholder.typicode.com/posts/3");
  return response.text();
}

// Fetch initial data and set it to variables
const text = await getText();
const number = await oneOrZero();

async function changeNumber(number) {
  let testnumber = getVariable("number");

  newNumber = Number(testnumber) + number;
  changeVariable("number", newNumber);
  return number;
}

export let functions = {
  changeNumber: changeNumber, // Export function as part of the functions object
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
