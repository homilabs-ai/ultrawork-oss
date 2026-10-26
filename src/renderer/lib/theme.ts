export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function resolveTheme(theme: Theme = getTheme()): "light" | "dark" {
  if (theme !== "system") return theme;
  return prefersDark() ? "dark" : "light";
}

export function applyTheme(theme: Theme = getTheme()): void {
  document.documentElement.classList.toggle(
    "dark",
    resolveTheme(theme) === "dark"
  );
}

export function setTheme(theme: Theme): void {
  if (theme === "system") localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

export function watchSystemTheme(): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (getTheme() === "system") applyTheme("system");
  };
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
