// app/todos/[id]/main.js
const todos = [
    { id: 1, title: 'Buy groceries' },
    { id: 2, title: 'Clean the house' },
    { id: 3, title: 'Finish project' }
];

// Get the ID from the URL
const pathSegments = window.location.pathname.split('/');
const id = parseInt(pathSegments[pathSegments.length - 2], 10);

// Find the To-Do item by ID
const todoItem = todos.find(todo => todo.id === id);

// Set the current data for rendering


export let variables = {
    title: "lala", // Initial number value
};

export let functions = {}
