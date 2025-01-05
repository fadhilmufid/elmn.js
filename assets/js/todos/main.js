const initialTodos = [
  { id: 1, text: "Learn Elmn.js", completed: false },
  { id: 2, text: "Build something awesome", completed: false },
];

// Fetch todos from API (simulated)
async function fetchTodos(limit) {
  try {
    // Add 3 second delay
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, 3000);
    });

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
  elmnVarState("todos", [...todosData]);
  elmnVarState("loading", false);

  const filters = ["ongoing", "all", "completed"];
  let randomIndex = Math.floor(Math.random() * filters.length);
  elmnVarState("currentFilter", filters[randomIndex]);

  // Generate a random hex color
  let randomColor = "#" + Math.floor(Math.random() * 16777215).toString(16);
  elmnVarState("backgroundColor", randomColor);
};

const addLoading = () => {
  elmnVarState("loading", true);
  elmnNavigate("/");
};

// Export variables with resolved data
export let variables = {
  todos: [],
  loading: false,
  error: null,
  todosLink: "View All Todos",
  aboutLink: "About",
  currentFilter: "all",
  title: "1",
  placeholder: "What needs to be done?",
  backgroundColor: "#fafafa",
};

// Export functions as plain objects
export let functions = {
  addTodo: addTodo,
  fetchTodos: fetchTodos,
  addLoading: addLoading,
};

elmnDomState("onload", [addTodo]);
