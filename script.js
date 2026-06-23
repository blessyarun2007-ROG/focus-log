const API_URL = "http://localhost:3000/tasks";

async function showTasks() {
  const res = await fetch(API_URL);
  const tasks = await res.json();

  const list = document.getElementById("list");
  list.innerHTML = "";

  tasks.forEach(task => {
    list.innerHTML += `
      <li>
        ${task.title}
        <button onclick="editTask(${task.id}, '${task.title}')">✏️</button>
        <button onclick="deleteTask(${task.id})">❌</button>
      </li>
    `;
  });
}

async function addTask() {
  const input = document.getElementById("task");
  const title = input.value;

  if (!title) return;

  await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  });

  input.value = "";
  showTasks();
}

async function deleteTask(id) {
  await fetch(`${API_URL}/${id}`, {
    method: "DELETE"
  });
  showTasks();
}

async function editTask(id, oldTitle) {
  const newTitle = prompt("Edit task", oldTitle);
  if (!newTitle) return;

  await fetch(`${API_URL}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: newTitle })
  });

  showTasks();
}

function logout() {
  localStorage.removeItem("user");
  window.location.href = "login.html";
}

showTasks();