document
  .getElementById("signupForm")
  .addEventListener("submit", async function (e) {
    const API_BASE =
      window.location.hostname === "localhost"
        ? "http://localhost:4000"
        : "https://studentgpt-4zbc.onrender.com";
    e.preventDefault();

    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const phone = document.getElementById("signup-phone").value.trim();
    const password = document.getElementById("signup-password").value.trim();
    const confirmPassword = document
      .getElementById("signup-confirm")
      .value.trim();

    // Frontend validation all field must be checked before sending request
    if (!name || !email || !phone || !password || !confirmPassword) {
      alert("Please fill all fields.");
      return;
    }

    if (password !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, password }),
      });

      if (!res.ok) {
        const errorMsg = await res.text();
        alert(errorMsg || "Signup failed.");
        return;
      }

      alert("Signup successful! Please login.");
      window.location.href = "Login.html";
    } catch (err) {
      console.error(err);
      alert("Error creating account. Please try again later.");
    }
  });


