document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const form = document.getElementById("loginForm");
  if (!form) {
    console.error("loginForm not found in DOM.");
    return;
  }

  const emailInput = document.getElementById("login-email");
  const passInput = document.getElementById("login-password");
  const submitBtn = form.querySelector('button[type="submit"]');
  const modeBtn = document.getElementById("mode-btn");
  const API_BASE =
    ["localhost", "127.0.0.1", ""].includes(window.location.hostname) ||
    window.location.protocol === "file:"
      ? "http://localhost:4000"
      : "https://studentgpt-4zbc.onrender.com";
  const API_URL = `${API_BASE}/login`;

  // Apply saved theme on load
  try {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") document.body.classList.add("light-mode");
    else document.body.classList.remove("light-mode");
    if (modeBtn)
      modeBtn.textContent = savedTheme === "light" ? "Light Mode" : "Dark Mode";
  } catch (e) {
    /* ignore */
  }

  // Theme toggle handler
  if (modeBtn) {
    modeBtn.addEventListener("click", () => {
      const isLight = document.body.classList.toggle("light-mode");
      localStorage.setItem("theme", isLight ? "light" : "dark");
      modeBtn.textContent = isLight ? "Light Mode" : "Dark Mode";
      modeBtn.setAttribute("aria-pressed", isLight ? "true" : "false");
    });
  }

  if (!emailInput || !passInput) {
    console.error("login-email or login-password input missing.");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passInput.value;

    if (!email || !password) {
      alert("Please enter email and password.");
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Login failed (${res.status})`);
      }

      const data = await res.json().catch(() => ({}));
      const token = data.token || data.accessToken || "";
      const name =
        data.name || data.username || (data.user && data.user.name) || "";
      const userEmail = data.email || (data.user && data.user.email) || email;
      const avatar = data.avatar || (data.user && data.user.avatar) || "";
      const isAdmin = Boolean(data.isAdmin || (data.user && data.user.isAdmin));

      if (!token) throw new Error("No token returned from server.");

      const displayName = name || userEmail.split("@")[0];

      localStorage.setItem("token", token);
      localStorage.setItem("userName", displayName);
      localStorage.setItem("userEmail", userEmail);
      localStorage.setItem("isAdmin", String(isAdmin));
      localStorage.setItem(
        "user",
        JSON.stringify({ name: displayName, email: userEmail, avatar, isAdmin })
      );

      // show success feedback then redirect
      alert("Login successful");
      window.location.href = "chat.html";
    } catch (err) {
      console.error("Login error:", err);
      alert("Login failed: " + (err.message || "Check console for details."));
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
});






