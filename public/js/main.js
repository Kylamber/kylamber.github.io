(() => {
  // <stdin>
  document.addEventListener("DOMContentLoaded", () => {
    const checker = document.getElementById("theme-switcher");
    const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");
    let darkModeChecked = false;
    if (prefersDarkScheme.matches) {
      darkModeChecked = true;
    }
    const currentTheme = localStorage.getItem("theme");
    if (currentTheme == "dark") {
      darkModeChecked = true;
    } else if (currentTheme == "light") {
      darkModeChecked = false;
    }
    checker.checked = darkModeChecked;
    toggleTheme(checker);
    checker.addEventListener("input", function() {
      localStorage.setItem("theme", checker.checked ? "dark" : "light");
    });
    checker.addEventListener("input", () => {
      toggleTheme(checker);
    });
  });
  function toggleTheme(checker) {
    const darkSyntaxCSS = document.getElementById("syntax-dark");
    const lightSyntaxCSS = document.getElementById("syntax-light");
    if (checker.checked) {
      darkSyntaxCSS.removeAttribute("disabled");
      lightSyntaxCSS.setAttribute("disabled", "");
      document.body.classList.add("dark");
      document.body.classList.remove("light");
    } else {
      darkSyntaxCSS.setAttribute("disabled", "");
      lightSyntaxCSS.removeAttribute("disabled");
      document.body.classList.add("light");
      document.body.classList.remove("dark");
    }
  }
})();
