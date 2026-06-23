let tasks = JSON.parse(localStorage.getItem("tasks")) || [];

function addTask() {
  const task = document.getElementById("task").value;
  tasks.push(task);
  localStorage.setItem("tasks", JSON.stringify(tasks));
  showTasks();
}

function showTasks() {
  const list = document.getElementById("list");
  list.innerHTML = "";
  tasks.forEach((t, i) => {
    list.innerHTML += `<li>${t}
      <button onclick="editTask(${i})">✏️</button>
      <button onclick="deleteTask(${i})">❌</button>
    </li>`;
  });
}

function editTask(index) {
  const newTask = prompt("Edit task:", tasks[index]);
  if (newTask) {
    tasks[index] = newTask;
    localStorage.setItem("tasks", JSON.stringify(tasks));
    showTasks();
  }
}

function deleteTask(index) {
  tasks.splice(index, 1);
  localStorage.setItem("tasks", JSON.stringify(tasks));
  showTasks();
}

function logout() {
  localStorage.removeItem("user");
  window.location.href = "login.html";
}

showTasks();
