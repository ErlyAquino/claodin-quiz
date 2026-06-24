import { useState, type CSSProperties } from "react";
import { getTheme, setTheme, type Theme } from "../lib/theme";

// Botão flutuante para alternar entre modo claro e escuro. Mostra o modo para o qual
// vai trocar. Fica no canto inferior esquerdo (livre em todas as telas de entrada/edição).
export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(getTheme());

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === "dark" ? "Mudar para o modo claro" : "Mudar para o modo escuro"}
      aria-label={theme === "dark" ? "Mudar para o modo claro" : "Mudar para o modo escuro"}
      style={btn}
    >
      <span style={{ fontSize: "1em" }}>{theme === "dark" ? "☀️" : "🌙"}</span>
      <span>{theme === "dark" ? "Claro" : "Escuro"}</span>
    </button>
  );
}

const btn: CSSProperties = {
  position: "fixed",
  zIndex: "var(--z-sticky)" as unknown as number,
  bottom: "var(--sp-3)",
  left: "var(--sp-3)",
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--sp-2)",
  cursor: "pointer",
  background: "var(--c-surface)",
  color: "var(--c-text-muted)",
  border: "1px solid var(--c-border)",
  borderRadius: "var(--r-pill)",
  padding: "6px 14px",
  fontSize: "var(--fs-sm)",
  fontWeight: 600,
  boxShadow: "var(--shadow-sm)",
};
