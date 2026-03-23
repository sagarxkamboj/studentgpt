
document.addEventListener("DOMContentLoaded", () => {
  const navMenu = document.querySelector(".nav-menu");
  const hamburger = document.querySelector(".hamburger");
  const startChatBtn = document.getElementById("startChatBtn");
  const navActions = document.querySelector(".nav-actions");

  // 🔹 Toggle mobile menu
  hamburger.addEventListener("click", () => {
    hamburger.classList.toggle("active");
    navMenu.classList.toggle("active");
  });

  // 🔹 Close menu when clicking a nav link
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      const section = e.target.getAttribute("href").substring(1);

      if (section === "contact") {
        document.body.classList.add("contact-active");
      } else {
        document.body.classList.remove("contact-active");
      }

      hamburger.classList.remove("active");
      navMenu.classList.remove("active");
    });
  });

  // 🔹 Close menu if clicking outside it
  document.addEventListener("click", (e) => {
    if (!navMenu.contains(e.target) && !hamburger.contains(e.target)) {
      navMenu.classList.remove("active");
      hamburger.classList.remove("active");
    }
  });

  // 🔹 Show correct nav actions based on login status
  if (localStorage.getItem("token")) {
    navActions.innerHTML = `
      <a href="chatbot.html" class="nav-signin">Chatbot</a>
      <a href="#" id="logoutBtn" class="nav-signin">Logout</a>
    `;

    // Logout functionality
    document.getElementById("logoutBtn").addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.removeItem("token");
      alert("You have been logged out.");
      window.location.reload();
    });
  } else {
    navActions.innerHTML = `
      <a href="Login.html" class="nav-signin">Login</a>
      <a href="signup.html" class="nav-signin">Signup</a>
    `;
  }

  // 🔹 Start Chatbot Button Logic
  startChatBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (localStorage.getItem("token")) {
      window.location.href = "index.html";
    } else {
      window.location.href = "Login.html";
    }
  });
});
document.addEventListener("DOMContentLoaded", () => {
  const sections = document.querySelectorAll(".page-section");
  const navLinks = document.querySelectorAll(".nav-link");

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();

      const targetSection = e.target.getAttribute("data-section") + "-section";

      // Show the selected section, hide others
      sections.forEach((section) => {
        if (section.id === targetSection) {
          section.style.display = "block";
        } else {
          section.style.display = "none";
        }
      });

      // Optionally update active class on nav links
      navLinks.forEach((l) => l.classList.remove("active"));
      e.target.classList.add("active");
    });
  });

  // Optionally, set the default visible section on page load
  // Show home section by default
  document.querySelector("#home-section").style.display = "block";
  navLinks.forEach((l) => l.classList.remove("active"));
  const homeLink = document.querySelector('.nav-link[data-section="home"]');
  if (homeLink) homeLink.classList.add("active");
});
