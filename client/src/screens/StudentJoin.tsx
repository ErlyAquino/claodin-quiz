import { useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { socket } from "../lib/socket";
import { setMembership } from "../lib/session";

type Props = { onBack: () => void; onJoined: (nick: string) => void; initialPin?: string };
type Mode = "solo" | "dupla" | "grupo";
type Member = { firstName: string; lastName: string };

const GROUP_MAX = 5;

export function StudentJoin({ onBack, onJoined, initialPin = "" }: Props) {
  const [step, setStep] = useState<"pin" | "form">("pin");
  const [pin, setPin] = useState(() => initialPin.replace(/\D/g, "").slice(0, 4));
  const [mode, setMode] = useState<Mode>("solo");
  const [nick, setNick] = useState("");
  const [members, setMembers] = useState<Member[]>([{ firstName: "", lastName: "" }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function peek(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (pin.trim().length < 4) return setError("Digite o PIN de 4 dígitos.");
    setBusy(true);
    socket.emit("player:peek", { pin: pin.trim() }, (res: { ok?: boolean; mode?: Mode; error?: string }) => {
      setBusy(false);
      if (res?.error) return setError(res.error);
      const m = res.mode ?? "solo";
      setMode(m);
      setMembers(m === "solo" ? [{ firstName: "", lastName: "" }] : [{ firstName: "", lastName: "" }, { firstName: "", lastName: "" }]);
      setStep("form");
    });
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!nick.trim()) return setError(mode === "solo" ? "Escolha um apelido." : "Dê um nome à equipe.");
    const filled = members.filter((m) => m.firstName.trim() && m.lastName.trim());
    if (mode === "solo" && filled.length !== 1) return setError("Preencha seu nome e sobrenome.");
    if (mode === "dupla" && filled.length !== 2) return setError("A dupla precisa de 2 integrantes completos.");
    if (mode === "grupo" && (filled.length < 2 || filled.length > GROUP_MAX)) return setError(`O grupo precisa de 2 a ${GROUP_MAX} integrantes.`);

    setBusy(true);
    socket.emit("player:join", { pin: pin.trim(), nick: nick.trim(), members: filled }, (res: { ok?: boolean; error?: string; token?: string }) => {
      setBusy(false);
      if (res?.error) setError(res.error);
      else if (res?.ok) {
        if (res.token) setMembership({ role: "player", pin: pin.trim(), token: res.token, nick: nick.trim() });
        onJoined(nick.trim());
      }
    });
  }

  const setMember = (i: number, patch: Partial<Member>) =>
    setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const label = mode === "solo" ? "Apelido (o que todos vão ver)" : "Nome da equipe (o que todos vão ver)";
  const memberTitle = mode === "solo" ? "Seu nome real" : "Integrantes da equipe (nomes reais)";

  return (
    <div style={wrap}>
      <motion.form onSubmit={step === "pin" ? peek : join} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={card}>
        {step === "pin" ? (
          <>
            <h2 className="display" style={{ margin: 0, fontSize: "var(--fs-xl)" }}>Entrar no quiz 🚀</h2>
            <Field label="PIN da sala">
              <input style={{ ...input, letterSpacing: "6px", fontWeight: 700, textAlign: "center", fontSize: "var(--fs-xl)" }} inputMode="numeric" placeholder="0000" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} autoFocus />
            </Field>
            {error && <div style={errBox}>{error}</div>}
            <button type="submit" disabled={busy} style={btnPrimary}>{busy ? "Procurando…" : "Continuar"}</button>
            <button type="button" onClick={onBack} style={btnGhost}>Voltar</button>
          </>
        ) : (
          <>
            <div style={modeBadge}>{mode === "solo" ? "🙋 Solo" : mode === "dupla" ? "👯 Dupla" : "👥 Grupo"}</div>

            <Field label={label}>
              <input style={input} placeholder={mode === "solo" ? "ex.: Rafa🦊" : "ex.: Os Invencíveis"} maxLength={24} value={nick} onChange={(e) => setNick(e.target.value)} autoFocus />
            </Field>

            <div style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)", marginTop: "var(--sp-1)" }}>{memberTitle}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              {members.map((m, i) => (
                <div key={i} style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
                  <input style={input} placeholder="Nome" value={m.firstName} onChange={(e) => setMember(i, { firstName: e.target.value })} />
                  <input style={input} placeholder="Sobrenome" value={m.lastName} onChange={(e) => setMember(i, { lastName: e.target.value })} />
                  {mode === "grupo" && members.length > 2 && (
                    <button type="button" onClick={() => setMembers((ms) => ms.filter((_, j) => j !== i))} style={removeBtn} title="Remover">✕</button>
                  )}
                </div>
              ))}
            </div>
            {mode === "grupo" && members.length < GROUP_MAX && (
              <button type="button" onClick={() => setMembers((ms) => [...ms, { firstName: "", lastName: "" }])} style={addBtn}>+ adicionar integrante</button>
            )}

            <div style={notice}>🔒 Os colegas veem <b>só o {mode === "solo" ? "apelido" : "nome da equipe"}</b>. Os <b>nomes reais</b> são visíveis <b>apenas para o professor</b>, para lançar a nota.</div>
            {error && <div style={errBox}>{error}</div>}

            <button type="submit" disabled={busy} style={btnPrimary}>{busy ? "Entrando…" : "Entrar"}</button>
            <button type="button" onClick={() => { setStep("pin"); setError(""); }} style={btnGhost}>Voltar</button>
          </>
        )}
      </motion.form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)", textAlign: "left" }}>
      <span style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

const wrap: CSSProperties = { minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--sp-4)" };
const card: CSSProperties = { width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: "var(--sp-3)", background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: "var(--r-lg)", padding: "var(--sp-6)", boxShadow: "var(--shadow-lg)" };
const input: CSSProperties = { width: "100%", background: "var(--c-bg-800)", border: "1px solid var(--c-border)", borderRadius: "var(--r-sm)", color: "var(--c-text)", padding: "var(--sp-3)", fontSize: "var(--fs-md)" };
const modeBadge: CSSProperties = { alignSelf: "flex-start", background: "var(--c-surface-2)", border: "1px solid var(--c-violet)", borderRadius: "var(--r-pill)", padding: "4px 14px", fontWeight: 700, fontSize: "var(--fs-sm)" };
const notice: CSSProperties = { fontSize: "var(--fs-sm)", color: "var(--c-text-muted)", background: "var(--c-bg-800)", border: "1px solid var(--c-border)", borderRadius: "var(--r-sm)", padding: "var(--sp-3)", lineHeight: "var(--lh-normal)" };
const errBox: CSSProperties = { color: "var(--c-error)", fontSize: "var(--fs-sm)" };
const btnPrimary: CSSProperties = { cursor: "pointer", background: "var(--c-violet-strong)", color: "var(--c-text-on-strong)", border: "none", borderRadius: "var(--r-md)", padding: "var(--sp-4)", fontWeight: 700, fontSize: "var(--fs-md)" };
const btnGhost: CSSProperties = { cursor: "pointer", background: "transparent", color: "var(--c-text-muted)", border: "none", fontSize: "var(--fs-sm)" };
const addBtn: CSSProperties = { cursor: "pointer", background: "transparent", color: "var(--c-cyan)", border: "1px dashed var(--c-border)", borderRadius: "var(--r-sm)", padding: "var(--sp-2)", fontSize: "var(--fs-sm)", fontWeight: 600 };
const removeBtn: CSSProperties = { cursor: "pointer", background: "transparent", color: "var(--c-error)", border: "1px solid var(--c-border)", borderRadius: "var(--r-sm)", padding: "6px 10px", fontWeight: 700 };
