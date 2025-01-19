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

const goToHome = async () => {
  await ElmnFunc.elmnNavigate("/");
};

const addTodo = async (text) => {
  // elmnVarState("loading", true);

  const filters = ["ongoing", "all", "completed"];
  let randomIndex = Math.floor(Math.random() * filters.length);
  await ElmnFunc.elmnVarState("currentFilter", filters[randomIndex]);
};
const clickButton = async (text) => {
  console.log(text);
  if (text === variables.currentFilter) {
    return;
  } else {
    await ElmnFunc.elmnVarState("currentFilter", text);
  }
};
const addLoading = async (num) => {
  const todosData = await fetchTodos(`${variables.todos.length + num}`);
  await ElmnFunc.elmnVarState("todos", [...todosData]);
  await addColor();
  // await ElmnFunc.elmnNavigate("/");
};

const addColor = async () => {
  let randomColor = "#" + Math.floor(Math.random() * 16777215).toString(16);
  await ElmnFunc.elmnVarState("backgroundColor", randomColor);
};

const AddTimeout = async () => {
  const todosData = await fetchTodos(`${1}`);
  await ElmnFunc.elmnVarState("todos", [...todosData]);
};

export const elmnEffect = {
  onStateChange: [
    {
      variables: ["currentFilter"],
      // functions: addLoading,
      functions: {
        before: addColor,
        after: addLoading,
      },
    },
    {
      variables: ["backgroundColor"],
      // functions: addLoading,
      functions: {
        after: AddTimeout,
      },
    },
  ],
};

// Export variables with resolved data
export const variables = {
  todos: [],
  loading: false,
  error: null,
  todosLink: "View All Todos",
  aboutLink: "About",
  currentFilter: "all",
  title: "1",
  placeholder: "What needs to be done?",
  backgroundColor: "#fafafa",
  currentLoading: 0,
};

// Export functions as plain objects
export const functions = {
  addTodo: addTodo,
  fetchTodos: fetchTodos,
  addLoading: addLoading,
  addColor: addColor,
  AddTimeout: AddTimeout,
  clickButton: clickButton,
  goToHome: goToHome,
};
