document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const messagesContainer =
    document.getElementById("messages") ||
    document.querySelector(".chat-messages");
  const userInput = document.getElementById("userInput");
  const chatForm = document.getElementById("chatForm");
  const logoutBtnRaw = document.getElementById("logoutBtn");
  const profileLink = document.getElementById("profileLink");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");
  const adminLink = document.getElementById("adminLink");
  const exportChatBtn = document.getElementById("exportChatBtn");
  const providerSelect = document.getElementById("providerSelect");
  const themeToggle = document.getElementById("theme-toggle");
  const welcomeContainer = document.getElementById("welcome-container");
  const nameEl = document.getElementById("userName");
  const emailEl = document.getElementById("userEmail");
  const userBadgeText = document.getElementById("userBadgeText");
  const userAvatar = document.getElementById("userAvatar");

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
  const isAdmin =
    localStorage.getItem("isAdmin") === "true" ||
    Boolean(storedUser.isAdmin);
  const avatar = storedUser.avatar || "";
  const token = localStorage.getItem("token");
  const selectedProvider = localStorage.getItem("chatProvider") || "gemini";

  if (!token) {
    console.warn("No auth token found; redirecting to login.");
    window.location.href = "Login.html";
    return;
  }

  const displayName = name || (email ? email.split("@")[0] : "");
  if (nameEl) {
    nameEl.textContent = displayName ? `Welcome, ${displayName}` : "Welcome";
  }
  if (emailEl) {
    emailEl.textContent = email || "";
  }
  if (providerSelect) {
    providerSelect.value = selectedProvider;
    providerSelect.addEventListener("change", () => {
      localStorage.setItem("chatProvider", providerSelect.value);
    });
  }

  if (userAvatar && userBadgeText) {
    if (avatar) {
      userAvatar.src = avatar;
      userAvatar.hidden = false;
      userBadgeText.hidden = true;
    } else {
      userAvatar.hidden = true;
      userBadgeText.hidden = false;
      userBadgeText.textContent = (displayName || "AI").slice(0, 1).toUpperCase();
    }
  }

  if (profileLink) {
    profileLink.addEventListener("click", () => {
      window.location.href = "profile.html";
    });
  }

  if (adminLink && isAdmin) {
    adminLink.hidden = false;
    adminLink.addEventListener("click", () => {
      window.location.href = "admin.html";
    });
  }

  const API_BASE =
    ["localhost", "127.0.0.1", ""].includes(window.location.hostname) ||
    window.location.protocol === "file:"
      ? "http://localhost:4000"
      : "https://studentgpt-4zbc.onrender.com";
  const CHATBOT_API_URL = `${API_BASE}/chatbot-api-endpoint`;
  const CHAT_HISTORY_API_URL = `${API_BASE}/chat-history`;

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
  applyTheme(localStorage.getItem("theme") || "dark");

  function formatTime(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) {
      return new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function setWelcomeVisibility(shouldShow) {
    if (!welcomeContainer) return;
    welcomeContainer.style.display = shouldShow ? "grid" : "none";
  }

  function removeRenderedMessages() {
    if (!messagesContainer) return;
    messagesContainer.querySelectorAll(".message").forEach((node) => node.remove());
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatInline(text) {
    return escapeHtml(text).replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  function renderRichMessage(message, isUser = false) {
    if (isUser) {
      return `<p>${escapeHtml(message)}</p>`;
    }

    const parts = String(message || "").split(/```/);
    return parts
      .map((part, index) => {
        if (index % 2 === 1) {
          const lines = part.replace(/^\n+|\n+$/g, "").split("\n");
          const language = escapeHtml((lines.shift() || "").trim()) || "code";
          const code = escapeHtml(lines.join("\n"));
          return `
            <pre class="code-block">
              <div class="code-toolbar">
                <div class="code-label">${language}</div>
                <button class="copy-code-btn" type="button">Copy</button>
              </div>
              <code>${code}</code>
            </pre>
          `;
        }

        const trimmed = part.trim();
        if (!trimmed) return "";

        const blocks = trimmed
          .split(/\n\s*\n/)
          .map((block) => block.trim())
          .filter(Boolean);

        return blocks
          .map((block) => {
            const lines = block
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);
            if (!lines.length) return "";

            const isBulletList = lines.every((line) => /^[-*]\s+/.test(line));
            if (isBulletList) {
              return `<ul>${lines
                .map((line) => `<li>${formatInline(line.replace(/^[-*]\s+/, ""))}</li>`)
                .join("")}</ul>`;
            }

            const isNumberList = lines.every((line) => /^\d+\.\s+/.test(line));
            if (isNumberList) {
              return `<ol>${lines
                .map((line) => `<li>${formatInline(line.replace(/^\d+\.\s+/, ""))}</li>`)
                .join("")}</ol>`;
            }

            if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0])) {
              const level = Math.min((lines[0].match(/^#+/) || [""])[0].length, 3);
              const text = lines[0].replace(/^#{1,3}\s+/, "");
              return `<h${level + 2}>${formatInline(text)}</h${level + 2}>`;
            }

            return `<p>${lines.map((line) => formatInline(line)).join("<br>")}</p>`;
          })
          .join("");
      })
      .join("");
  }

  function getProviderLabel(provider) {
    const value = String(provider || "").trim().toLowerCase();
    if (value === "qwen") return "Qwen";
    if (value === "deepseek") return "DeepSeek";
    return "Gemini";
  }

  function createMessageNode(message, isUser = false, createdAt, provider) {
    const messageWrapper = document.createElement("div");
    messageWrapper.classList.add(
      "message",
      isUser ? "user-message" : "bot-message"
    );

    const messageContent = document.createElement("div");
    messageContent.classList.add("message-content");
    messageContent.innerHTML = renderRichMessage(message, isUser);

    const footer = document.createElement("div");
    footer.classList.add("message-footer");

    const timestamp = document.createElement("div");
    timestamp.classList.add("message-time");
    timestamp.textContent = formatTime(createdAt);
    footer.appendChild(timestamp);

    if (!isUser) {
      const providerKey = String(provider || "gemini").trim().toLowerCase();
      const providerBadge = document.createElement("span");
      providerBadge.classList.add("provider-badge", providerKey);
      providerBadge.textContent = getProviderLabel(providerKey);
      footer.appendChild(providerBadge);
    }

    messageWrapper.appendChild(messageContent);
    messageWrapper.appendChild(footer);
    return messageWrapper;
  }

  function addMessage(message, isUser = false, createdAt, provider) {
    if (!messagesContainer) return;
    setWelcomeVisibility(false);
    const node = createMessageNode(message, isUser, createdAt, provider);
    messagesContainer.appendChild(node);
    messagesContainer.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: "smooth",
    });
  }

  async function loadChatHistory() {
    try {
      const res = await fetch(CHAT_HISTORY_API_URL, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to load history (${res.status})`);
      }

      const data = await res.json();
      const messages = Array.isArray(data.messages) ? data.messages : [];
      removeRenderedMessages();

      if (!messages.length) {
        setWelcomeVisibility(true);
        return;
      }

      setWelcomeVisibility(false);
      messages.forEach((entry) => {
        addMessage(entry.content, entry.role === "user", entry.createdAt, entry.provider || null);
      });
    } catch (err) {
      console.error("Chat history load error:", err);
      setWelcomeVisibility(true);
    }
  }

  function exportChat() {
    const renderedMessages = Array.from(
      messagesContainer?.querySelectorAll(".message") || []
    );

    if (!renderedMessages.length) {
      alert("No chat messages available to export.");
      return;
    }

    const safeName = (displayName || "studentgpt-chat").replace(/[^a-z0-9_-]+/gi, "-");
    const exportedAt = new Date().toLocaleString();
    const messageHtml = renderedMessages
      .map((messageNode) => {
        const role = messageNode.classList.contains("user-message") ? "You" : "StudentGPT";
        const time = messageNode.querySelector(".message-time")?.textContent || "";
        const content = messageNode.querySelector(".message-content")?.innerHTML || "";
        return `
          <section class="pdf-message ${role === "You" ? "user" : "bot"}">
            <div class="pdf-meta">
              <strong>${role}</strong>
              <span>${time}</span>
            </div>
            <div class="pdf-content">${content}</div>
          </section>
        `;
      })
      .join("");

    const exportWindow = window.open("", "_blank", "width=960,height=720");
    if (!exportWindow) {
      alert("Popup blocked. Please allow popups to export the chat as PDF.");
      return;
    }

    exportWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>${safeName}-chat-export</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              color: #102038;
              margin: 0;
              padding: 28px;
              background: #f4f7fb;
            }
            .pdf-shell {
              max-width: 900px;
              margin: 0 auto;
              background: #ffffff;
              border: 1px solid #d9e2f1;
              border-radius: 20px;
              padding: 28px;
            }
            h1 {
              margin: 0 0 8px;
              font-size: 28px;
            }
            .pdf-sub {
              color: #5f6f86;
              margin-bottom: 24px;
              line-height: 1.6;
            }
            .pdf-message {
              border: 1px solid #d9e2f1;
              border-radius: 16px;
              padding: 18px;
              margin-bottom: 16px;
              page-break-inside: avoid;
            }
            .pdf-message.user {
              background: #eef4ff;
            }
            .pdf-message.bot {
              background: #f8fbff;
            }
            .pdf-meta {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 12px;
              margin-bottom: 12px;
              font-size: 14px;
            }
            .pdf-meta span {
              color: #5f6f86;
            }
            .pdf-content {
              line-height: 1.7;
              word-break: break-word;
            }
            .pdf-content pre {
              white-space: pre-wrap;
              background: #101828;
              color: #f8fbff;
              border-radius: 12px;
              padding: 14px;
              overflow: hidden;
            }
            .pdf-content code {
              font-family: Consolas, monospace;
            }
            .pdf-content .copy-code-btn,
            .pdf-content .code-label,
            .pdf-content .code-toolbar button {
              display: none !important;
            }
            @media print {
              body {
                background: #ffffff;
                padding: 0;
              }
              .pdf-shell {
                border: none;
                border-radius: 0;
                padding: 0;
              }
            }
          </style>
        </head>
        <body>
          <main class="pdf-shell">
            <h1>StudentGPT Chat Export</h1>
            <div class="pdf-sub">
              <div><strong>User:</strong> ${displayName || email || "Unknown"}</div>
              <div><strong>Email:</strong> ${email || "N/A"}</div>
              <div><strong>Exported:</strong> ${exportedAt}</div>
            </div>
            ${messageHtml}
          </main>
          <script>
            window.onload = function () {
              setTimeout(function () {
                window.print();
              }, 250);
            };
          <\/script>
        </body>
      </html>
    `);
    exportWindow.document.close();
  }

  async function clearHistory() {
    const ok = confirm("Clear all saved chat history?");
    if (!ok) return;

    try {
      const res = await fetch(CHAT_HISTORY_API_URL, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to clear history (${res.status})`);
      }
      removeRenderedMessages();
      setWelcomeVisibility(true);
      alert("Chat history cleared.");
    } catch (err) {
      console.error("Clear history error:", err);
      alert(`Could not clear history: ${err.message || "Unknown error"}`);
    }
  }

  async function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;

    addMessage(message, true, new Date().toISOString());
    userInput.value = "";

    try {
      const res = await fetch(CHATBOT_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message,
          provider: providerSelect?.value || selectedProvider || "gemini",
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
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

      addMessage(botResponse, false, new Date().toISOString(), data.provider || providerSelect?.value || selectedProvider || "gemini");
    } catch (err) {
      console.error("Chatbot API error:", err);
      addMessage(`Error: ${err.message || "Failed to get response"}`, false);
    }
  }

  if (logoutBtnRaw) {
    try {
      const clone = logoutBtnRaw.cloneNode(true);
      logoutBtnRaw.parentNode.replaceChild(clone, logoutBtnRaw);
      const logoutBtn = document.getElementById("logoutBtn");
      if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const ok = confirm("Are you sure you want to log out?");
          if (!ok) return;

          localStorage.removeItem("token");
          localStorage.removeItem("userName");
          localStorage.removeItem("userEmail");
          localStorage.removeItem("user");
          localStorage.removeItem("isAdmin");

          alert("You have been logged out.");
          window.location.href = "Login.html";
        });
      }
    } catch (err) {
      logoutBtnRaw.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = confirm("Are you sure you want to log out?");
        if (!ok) return;
        localStorage.removeItem("token");
        localStorage.removeItem("userName");
        localStorage.removeItem("userEmail");
        localStorage.removeItem("user");
        localStorage.removeItem("isAdmin");
        alert("You have been logged out.");
        window.location.href = "Login.html";
      });
    }
  }

  if (exportChatBtn) {
    exportChatBtn.addEventListener("click", exportChat);
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", clearHistory);
  }

  messagesContainer?.addEventListener("click", async (event) => {
    const copyBtn = event.target.closest(".copy-code-btn");
    if (!copyBtn) return;

    const codeEl = copyBtn.closest(".code-block")?.querySelector("code");
    const codeText = codeEl?.textContent || "";
    if (!codeText) return;

    try {
      await navigator.clipboard.writeText(codeText);
      const original = copyBtn.textContent;
      copyBtn.textContent = "Copied";
      setTimeout(() => {
        copyBtn.textContent = original;
      }, 1400);
    } catch (err) {
      console.error("Copy code error:", err);
      alert("Copy failed. Please copy manually.");
    }
  });

  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
  });

  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  loadChatHistory();

  console.debug(
    "chatbot.js loaded. userName:",
    localStorage.getItem("userName"),
    "userEmail:",
    localStorage.getItem("userEmail")
  );
});












