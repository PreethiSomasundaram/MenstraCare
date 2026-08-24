// Shared behaviour across all pages: theme toggle, active nav link, mobile menu.

const API_BASE = window.location.origin;

function initTheme() {
  const saved = localStorage.getItem("menstracare-theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  updateToggleLabel(saved);
}

function updateToggleLabel(theme) {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.innerHTML = theme === "dark" ? "&#9728; Light" : "&#9790; Dark";
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("menstracare-theme", next);
  updateToggleLabel(next);
  window.dispatchEvent(new CustomEvent("menstracare-theme-changed", { detail: next }));
}

function initNav() {
  const current = document.body.getAttribute("data-page");
  document.querySelectorAll(".nav-link").forEach((link) => {
    if (link.getAttribute("data-page") === current) {
      link.classList.add("active");
    }
  });

  const toggleBtn = document.getElementById("theme-toggle");
  if (toggleBtn) toggleBtn.addEventListener("click", toggleTheme);

  const navToggleBtn = document.getElementById("nav-toggle-btn");
  const navLinks = document.getElementById("nav-links");
  if (navToggleBtn && navLinks) {
    navToggleBtn.addEventListener("click", () => {
      navLinks.classList.toggle("open");
    });
  }
}

function chartThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    text: styles.getPropertyValue("--text").trim(),
    muted: styles.getPropertyValue("--text-muted").trim(),
    grid: styles.getPropertyValue("--chart-grid").trim(),
    accent: styles.getPropertyValue("--accent").trim(),
    positive: styles.getPropertyValue("--positive").trim(),
    negative: styles.getPropertyValue("--negative").trim(),
  };
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initNav();
});
