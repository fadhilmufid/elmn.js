// app/todos/main.js



document.addEventListener('DOMContentLoaded', () => {
    const todosList = document.getElementById('todosList');
    const todoInput = document.getElementById('todoInput');
    const addButton = document.getElementById('addButton');

    let todos = [];

    function renderTodos() {
        todosList.innerHTML = '';
        todos.forEach((todo, index) => {
            const li = document.createElement('li');
            li.textContent = todo;
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Delete';
            deleteButton.onclick = () => {
                deleteTodo(index);
            };
            li.appendChild(deleteButton);
            todosList.appendChild(li);
        });
    }

    function addTodo() {
        const todoText = todoInput.value.trim();
        if (todoText) {
            todos.push(todoText);
            todoInput.value = '';
            renderTodos();
        }
    }

    function deleteTodo(index) {
        todos.splice(index, 1);
        renderTodos();
    }

    addButton.addEventListener('click', addTodo);
});
