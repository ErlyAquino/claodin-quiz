import { useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { professorLogin } from "../lib/auth";
import { SchoolLogo } from "../components/SchoolLogo";

type Props = { onSuccess: (usingDefault: boolean) => void; onBack: () => void };

// Tela de login do professor — protege os quizzes e gabaritos dos alunos.
export function ProfessorLogin({ onSuccess, onBack }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!password) return setError("Digite a senha do professor.");
    setBusy(true);
    const res = await professorLogin(password);
    setBusy(false);
    if (res.ok) onSuccess(!!res.defaultPassword);
    else setError(res.error ?? "Senha incorreta.");
  }

  return (
    <div style={wrap}>
      <motion.form onSubmit={submit} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={card}>
        <div style={{ alignSelf: "center" }}><SchoolLogo maxWidth={170} /></div>
        <h2 className="display" style={{ margin: 0, fontSize: "var(--fs-xl)" }}>🔒 Área do professor</h2>
        <p style={{ color: "var(--c-text-muted)", fontSize: "var(--fs-sm)", margin: 0 }}>
          Digite a senha para acessar os quizzes, gabaritos e estatísticas.
        </p>
        <input
          type="password"
          style={input}
          placeholder="Senha do professor"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <div style={errBox}>{error}</div>}
        <button type="submit" disabled={busy} style={btnPrimary}>{busy ? "Entrando…" : "Entrar"}</button>
        <button type="button" onClick={onBack} style={btnGhost}>Voltar</button>
      </motion.form>
    </div>
  );
}

const wrap: CSSProperties = { minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--sp-4)" };
const card: CSSProperties = { width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: "var(--sp-3)", textAlign: "center", background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: "var(--r-lg)", padding: "var(--sp-6)", boxShadow: "var(--shadow-lg)" };
const input: CSSProperties = { width: "100%", background: "var(--c-bg-800)", border: "1px solid var(--c-border)", borderRadius: "var(--r-sm)", color: "var(--c-text)", padding: "var(--sp-3)", fontSize: "var(--fs-md)", textAlign: "center" };
const errBox: CSSProperties = { color: "var(--c-error)", fontSize: "var(--fs-sm)" };
const btnPrimary: CSSProperties = { cursor: "pointer", background: "var(--c-violet-strong)", color: "var(--c-text-on-strong)", border: "none", borderRadius: "var(--r-md)", padding: "var(--sp-4)", fontWeight: 700, fontSize: "var(--fs-md)" };
const btnGhost: CSSProperties = { cursor: "pointer", background: "transparent", color: "var(--c-text-muted)", border: "none", fontSize: "var(--fs-sm)" };
