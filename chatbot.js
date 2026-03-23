// ...existing code...
document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  // --- Element Selectors ---
  const messagesContainer =
    document.getElementById("messages") ||
    document.querySelector(".chat-messages");
  const userInput = document.getElementById("userInput");
  const chatForm = document.getElementById("chatForm");
  const logoutBtnRaw = document.getElementById("logoutBtn");
  const themeToggle = document.getElementById("theme-toggle");
  const welcomeContainer = document.getElementById("welcome-container");
  const nameEl = document.getElementById("userName");
  const emailEl = document.getElementById("userEmail");

  // Basic checks
  if (!messagesContainer) {
    console.error(
      "chatbot.js: messages container not found (id='messages' or class='chat-messages')."
    );
  }
  if (!userInput || !chatForm) {
    console.error(
      "chatbot.js: userInput or chatForm missing. Chat will not work without these."
    );
    return;
  }

  // --- Authentication & User Info ---
  let storedUser = {};
  try {
    const raw = localStorage.getItem("user");
    if (raw) storedUser = JSON.parse(raw) || {};
  } catch (e) {
    storedUser = {};
  }

  const name =
    localStorage.getItem("userName") ||
    localStorage.getItem("name") ||
    storedUser.name ||
    "";
  const email =
    localStorage.getItem("userEmail") ||
    localStorage.getItem("email") ||
    storedUser.email ||
    "";
  const token = localStorage.getItem("token");

  if (!token) {
    // not authenticated -> redirect to login
    console.warn("No auth token found; redirecting to login.");
    window.location.href = "Login.html";
    return;
  }

  // Update UI with user info if elements exist
  const displayName = name || (email ? email.split("@")[0] : "");
  if (nameEl)
    nameEl.textContent = displayName ? `Welcome, ${displayName}` : "Welcome";
  if (emailEl) emailEl.textContent = email || "";

  // --- API URL ---
  const API_BASE =
    ["localhost", "127.0.0.1", ""].includes(window.location.hostname) ||
    window.location.protocol === "file:"
      ? "http://localhost:4000"
      : "https://studentgpt-4zbc.onrender.com";
  const CHATBOT_API_URL = `${API_BASE}/chatbot-api-endpoint`;

  // --- Theme Handling ---
  const applyTheme = (theme) => {
    if (theme === "light") {
      document.body.classList.add("light-mode");
      document.body.classList.remove("dark-mode");
      if (themeToggle) themeToggle.checked = true;
    } else {
      document.body.classList.remove("light-mode");
      document.body.classList.add("dark-mode");
      if (themeToggle) themeToggle.checked = false;
    }
  };

  if (themeToggle) {
    themeToggle.addEventListener("change", () => {
      const newTheme = themeToggle.checked ? "light" : "dark";
      localStorage.setItem("theme", newTheme);
      applyTheme(newTheme);
    });
  }
  const savedTheme = localStorage.getItem("theme") || "dark";
  applyTheme(savedTheme);

  // --- Chat Helpers ---
  function addMessage(message, isUser = false) {
    if (welcomeContainer && welcomeContainer.style.display !== "none") {
      welcomeContainer.style.display = "none";
    }

    if (!messagesContainer) return;

    const messageWrapper = document.createElement("div");
    messageWrapper.classList.add(
      "message",
      isUser ? "user-message" : "bot-message"
    );

    const messageContent = document.createElement("div");
    messageContent.classList.add("message-content");
    messageContent.textContent = message;

    const timestamp = document.createElement("div");
    timestamp.classList.add("message-time");
    timestamp.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    messageWrapper.appendChild(messageContent);
    messageWrapper.appendChild(timestamp);

    messagesContainer.appendChild(messageWrapper);
    // scroll to bottom
    messagesContainer.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: "smooth",
    });
  }

  async function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;

    addMessage(message, true);
    userInput.value = "";

    try {
      const res = await fetch(CHATBOT_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      // normalize response
      let botResponse = "";
      if (typeof data.response === "string") botResponse = data.response;
      else if (data.response && typeof data.response === "object") {
        botResponse =
          data.response.text ||
          data.response.message ||
          JSON.stringify(data.response);
      } else if (data.responseText) {
        botResponse = data.responseText;
      } else if (data.message) {
        botResponse = data.message;
      } else {
        botResponse = "No response from chatbot.";
      }

      addMessage(botResponse, false);
    } catch (err) {
      console.error("Chatbot API error:", err);
      addMessage(`Error: ${err.message || "Failed to get response"}`, false);
    }
  }

  // --- Event Listeners ---
  // Attach logout with robust confirmation handling: cancel must prevent logout.
  if (logoutBtnRaw) {
    // Replace node to remove any existing handlers and avoid double-binding
    try {
      const clone = logoutBtnRaw.cloneNode(true);
      logoutBtnRaw.parentNode.replaceChild(clone, logoutBtnRaw);
      // now select the fresh node
      const logoutBtn = document.getElementById("logoutBtn");
      if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const ok = confirm("Are you sure you want to log out?");
          if (!ok) {
            // user cancelled -> do nothing
            return;
          }

          // Clear only auth-related keys
          localStorage.removeItem("token");
          localStorage.removeItem("userName");
          localStorage.removeItem("userEmail");
          localStorage.removeItem("user");

          alert("You have been logged out.");
          window.location.href = "Login.html";
        });
      } else {
        console.warn("chatbot.js: logout button replacement failed.");
      }
    } catch (err) {
      // fallback if replacement fails
      logoutBtnRaw.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = confirm("Are you sure you want to log out?");
        if (!ok) return;
        localStorage.removeItem("token");
        localStorage.removeItem("userName");
        localStorage.removeItem("userEmail");
        localStorage.removeItem("user");
        alert("You have been logged out.");
        window.location.href = "Login.html";
      });
    }
  } else {
    console.warn("logoutBtn not found (id='logoutBtn').");
  }

  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
  });

  // Allow Enter to send (no shift)
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Small debug helper - show current localStorage user keys in console
  console.debug(
    "chatbot.js loaded. userName:",
    localStorage.getItem("userName"),
    "userEmail:",
    localStorage.getItem("userEmail")
  );
});
// ...existing


