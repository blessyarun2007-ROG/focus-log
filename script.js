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
      <button onclick="deleteTask(${i})">❌</button>
    </li>`;
  });
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
