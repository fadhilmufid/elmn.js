import { elmnState } from "/elmn.js";

// Initial todos data
const initialTodos = [
  { id: 1, text: "Learn Elmn.js", completed: false },
  { id: 2, text: "Build something awesome", completed: false },
];

// Fetch todos from API (simulated)
async function fetchTodos(limit) {
  try {
    const response = await fetch(
      `https://jsonplaceholder.typicode.com/todos?_limit=${limit}`
    );
    const data = await response.json();
    return data.map((todo) => ({
      id: todo.id,
      text: todo.title,
      completed: todo.completed,
    }));
  } catch (error) {
    console.error("Error fetching todos:", error);
    return initialTodos;
  }
}

const addTodo = async (text) => {
  const todosData = await fetchTodos(`${variables.todos.length + 1}`);
  elmnState("todos", [...todosData]);
  elmnState("loading", false);

  const filters = ["ongoing", "all", "completed"];
  let randomIndex = Math.floor(Math.random() * filters.length);
  elmnState("currentFilter", filters[randomIndex]);

  // Generate a random hex color
  let randomColor = "#" + Math.floor(Math.random() * 16777215).toString(16);
  elmnState("backgroundColor", randomColor);
};

// Initialize data first
const todosData = await fetchTodos(1);
const currentDate = new Date().toLocaleDateString();

// Export variables with resolved data
export let variables = {
  todos: [...todosData],
  loading: false,
  error: null,
  todosLink: "View All Todos",
  aboutLink: "About",
  currentFilter: "all",
  title: "1",
  placeholder: "What needs to be done?",
  lastUpdated: currentDate,
  stats: {
    total: todosData.length,
    completed: todosData.filter((todo) => todo.completed).length,
    active: todosData.filter((todo) => !todo.completed).length,
  },

  backgroundColor: "#fafafa",
};

// Export functions as plain objects
export let functions = {
  addTodo: addTodo,
  elmnState: elmnState,
  fetchTodos: fetchTodos,
};
