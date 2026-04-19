// StudentGPT | Dimensional Workspace Logic
document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  // --- Element Selectors ---
  const messagesContainer = document.getElementById("messages");
  const messagesWrapper = document.getElementById("messagesWrapper");
  const userInput = document.getElementById("userInput");
  const chatForm = document.getElementById("chatForm");
  const welcomeContainer = document.getElementById("welcome-container");
  const nameEl = document.getElementById("userName");
  const emailEl = document.getElementById("userEmail");
  const logoutBtn = document.getElementById("logoutBtn");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");
  const exportPdfBtn = document.getElementById("exportPdfBtn");
  const sessionsList = document.getElementById("sessionsList");
  const newChatBtn = document.getElementById("newChatBtn");
  const userInitial = document.getElementById("userInitial");

  // --- State ---
  let currentConversationId = null;
  let isProcessing = false;
  let selectedModel = "gemini";

  // --- Auth & API Initialization ---
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "Login.html";
    return;
  }

    const API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ? "http://localhost:4000"
      : "https://studentgpt-4zbc.onrender.com";
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  // UI Initialization
  const displayName = user.name || localStorage.getItem("userName") || "Student";
  if (nameEl) nameEl.textContent = displayName;
  if (emailEl) emailEl.textContent = user.email || localStorage.getItem("userEmail") || "";
  if (userInitial) userInitial.textContent = displayName.charAt(0).toUpperCase();

  // --- Model Selection Logic ---
  const modelBtns = document.querySelectorAll(".model-btn");
  modelBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      modelBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedModel = btn.getAttribute("data-value");
    });
  });

  // --- Markdown & Highlighting Setup ---
  marked.setOptions({
    highlight: function (code, lang) {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
      return hljs.highlightAuto(code).value;
    },
    breaks: true
  });

  // --- Session Management ---
  async function loadSessions() {
    try {
      const res = await fetch(`${API_BASE}/api/chat-history`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.conversations) {
        renderSessions(data.conversations);
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
    }
  }

  function renderSessions(conversations) {
    if (!sessionsList) return;
    sessionsList.innerHTML = "";
    conversations.forEach(conv => {
      const item = document.createElement("div");
      item.classList.add("session-item");
      if (conv._id === currentConversationId) item.classList.add("active");

      const title = document.createElement("span");
      title.textContent = conv.title || "Untitled Dimension";
      title.style.flex = "1";
      item.appendChild(title);

      const delBtn = document.createElement("button");
      delBtn.innerHTML = "✕";
      delBtn.style.cssText = "background:none; border:none; color:inherit; opacity:0.6; cursor:pointer; font-size:12px; margin-left:10px;";
      delBtn.onclick = (e) => {
        e.stopPropagation();
        deleteSession(conv._id);
      };

      item.appendChild(delBtn);
      item.onclick = () => selectSession(conv);
      sessionsList.appendChild(item);
    });
  }

  async function deleteSession(id) {
    if (!confirm("Delete this dimension permanently?")) return;
    try {
      await fetch(`${API_BASE}/api/conversation/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (currentConversationId === id) startNewChat();
      loadSessions();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }

  async function selectSession(conv) {
    currentConversationId = conv._id;
    if (messagesWrapper) messagesWrapper.innerHTML = "";
    if (welcomeContainer) welcomeContainer.style.display = "none";

    const titleEl = document.getElementById("currentChatTitle");
    if (titleEl) titleEl.textContent = conv.title || "AI Workspace";

    conv.messages.forEach(msg => {
      if (msg.role !== "system") addMessage(msg.content, msg.role === "user", msg.provider);
    });

    loadSessions();
  }

  function startNewChat() {
    currentConversationId = null;
    if (messagesWrapper) messagesWrapper.innerHTML = "";
    if (welcomeContainer) welcomeContainer.style.display = "block";
    const titleEl = document.getElementById("currentChatTitle");
    if (titleEl) titleEl.textContent = "AI Workspace";
    userInput.value = "";
    loadSessions();
  }

  // --- Chat Logic ---
  function addMessage(message, isUser = false, provider = null) {
    if (welcomeContainer && isUser) welcomeContainer.style.display = "none";

    const group = document.createElement("div");
    group.classList.add("msg-group", isUser ? "user" : "bot");

    const bubble = document.createElement("div");
    bubble.classList.add("msg-bubble");

    if (isUser) {
      bubble.textContent = message;
    } else {
      bubble.innerHTML = marked.parse(message);
      bubble.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
    }

    const meta = document.createElement("div");
    meta.classList.add("msg-meta");
    const time = document.createElement("span");
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    meta.appendChild(time);

    if (!isUser && provider) {
      const badge = document.createElement("span");
      badge.classList.add("provider-badge");
      badge.textContent = provider.toUpperCase();
      meta.appendChild(badge);
    }

    group.appendChild(bubble);
    group.appendChild(meta);
    messagesWrapper.appendChild(group);

    // Auto-scroll
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return bubble;
  }

  async function sendMessage() {
    const message = userInput.value.trim();
    if (!message || isProcessing) return;

    addMessage(message, true);
    userInput.value = "";
    userInput.style.height = 'auto'; // Reset textarea height

    isProcessing = true;

    // Create a temporary bot bubble for streaming
    const botBubble = addMessage("Thinking...", false, selectedModel);
    let fullResponse = "";

    try {
      const res = await fetch(`${API_BASE}/chatbot-api-endpoint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          message,
          model: selectedModel,
          stream: true,
          conversationId: currentConversationId
        })
      });

      if (!res.ok) throw new Error("Connection failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      botBubble.textContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Keep partial line

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith("data: ")) continue;
          
          const dataStr = trimmedLine.slice(6);
          if (dataStr === "[DONE]") break;
          
          try {
            const data = JSON.parse(dataStr);
            if (data.chunk) {
              fullResponse += data.chunk;
              botBubble.innerHTML = marked.parse(fullResponse);
              botBubble.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
            if (data.conversationId && !currentConversationId) {
              currentConversationId = data.conversationId;
              loadSessions();
            }
            if (data.error) throw new Error(data.error);
          } catch (e) {
            // Silently handle parse errors for partial chunks
          }
        }
      }
    } catch (err) {
      botBubble.textContent = "Error: " + err.message;
    } finally {
      isProcessing = false;
    }
  }

  // --- Final Event Listeners ---
  chatForm.addEventListener("submit", (e) => { e.preventDefault(); sendMessage(); });

  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  newChatBtn.onclick = startNewChat;

  logoutBtn.onclick = () => {
    if (confirm("Terminate session?")) {
      localStorage.clear();
      window.location.href = "Login.html";
    }
  };

  clearHistoryBtn.onclick = async () => {
    if (confirm("Wipe all dimension history?")) {
      try {
        await fetch(`${API_BASE}/api/chat-history`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${token}` }
        });
        startNewChat();
      } catch (e) { }
    }
  };

  exportPdfBtn.onclick = () => {
    alert("Exporting dimensional logs to PDF...");
    window.print();
  };

  // Initial Load
  loadSessions();
});
