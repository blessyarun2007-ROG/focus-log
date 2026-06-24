const API_URL = "http://localhost:3000/tasks";
const CHAT_URL = "http://localhost:3001/chat";

async function showTasks() {
  const list = document.getElementById("list");

  try {
    const res = await fetch(API_URL);
    const tasks = await res.json();

    list.innerHTML = "";

    tasks.forEach(task => {
      const item = document.createElement("li");
      const title = document.createElement("span");
      const editButton = document.createElement("button");
      const deleteButton = document.createElement("button");

      title.textContent = task.title;
      editButton.textContent = "Edit";
      deleteButton.textContent = "Delete";

      editButton.onclick = () => editTask(task.id, task.title);
      deleteButton.onclick = () => deleteTask(task.id);

      item.append(title, editButton, deleteButton);
      list.appendChild(item);
    });
  } catch (error) {
    list.innerHTML = "<li>Could not load tasks. Start JSON Server.</li>";
  }
}

async function addTask() {
  const input = document.getElementById("task");
  const title = input.value.trim();

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

function addChatMessage(sender, text) {
  const chatHistory = document.getElementById("chatHistory");
  const message = document.createElement("div");

  message.className = `chat-message ${sender}`;
  message.textContent = `${sender === "user" ? "You" : "AI"}: ${text}`;

  chatHistory.appendChild(message);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById("chatInput");
  const userMessage = input.value.trim();

  if (!userMessage) return;

  addChatMessage("user", userMessage);
  input.value = "";

  try {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMessage })
    });

    const data = await res.json();

    if (!res.ok) {
      addChatMessage("ai", data.error || "Something went wrong.");
      return;
    }

    addChatMessage("ai", data.reply);
  } catch (error) {
    addChatMessage("ai", "Could not connect to the AI backend.");
  }
}

document.getElementById("chatInput").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    sendMessage();
  }
});

showTasks();
