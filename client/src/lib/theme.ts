// Tema claro/escuro. O escuro é o PADRÃO (o :root de tokens.css). O claro é ativado
// colocando data-theme="light" no <html>, que liga o bloco :root[data-theme="light"].
// A escolha persiste em localStorage. (O flash inicial é evitado por um script inline
// no index.html que aplica o tema antes da página pintar.)

export type Theme = "dark" | "light";

const KEY = "quiz-theme";

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "light") root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme"); // escuro = padrão (sem atributo)
}

export function setTheme(theme: Theme): void {
  try { localStorage.setItem(KEY, theme); } catch { /* sem persistência, ok */ }
  applyTheme(theme);
}
