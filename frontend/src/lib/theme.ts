type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "tellingtree:theme";

export function getTheme(): Theme {
  return (localStorage.getItem(STORAGE_KEY) as Theme) || "system";
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  } else {
    root.classList.toggle("dark", theme === "dark");
  }
}

export function initTheme(): void {
  applyTheme(getTheme());
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getTheme() === "system") applyTheme("system");
  });
}
