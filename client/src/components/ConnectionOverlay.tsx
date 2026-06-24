import { useEffect, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { socket } from "../lib/socket";

/** Mostra "reconectando…" quando a conexão cai (ex.: celular dorme). Só aparece em jogo. */
export function ConnectionOverlay({ active }: { active: boolean }) {
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on("connect", on);
    socket.on("disconnect", off);
    return () => { socket.off("connect", on); socket.off("disconnect", off); };
  }, []);

  if (connected || !active) return null;

  return (
    <div style={overlay} role="status" aria-live="polite">
      <div style={card}>
        <div style={{ fontSize: "var(--fs-3xl)" }}>🔌</div>
        <div className="display" style={{ fontWeight: 800, fontSize: "var(--fs-lg)" }}>Conexão perdida</div>
        <div style={{ color: "var(--c-text-muted)" }}>Reconectando você ao quiz…</div>
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={spinner} />
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: "var(--z-overlay)" as unknown as number,
  background: "var(--c-veil)",
  backdropFilter: "blur(3px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--sp-5)",
};
const card: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "var(--sp-3)",
  textAlign: "center",
  background: "var(--c-surface)",
  border: "1px solid var(--c-border)",
  borderRadius: "var(--r-lg)",
  padding: "var(--sp-6)",
  boxShadow: "var(--shadow-lg)",
};
const spinner: CSSProperties = {
  width: 28,
  height: 28,
  border: "3px solid var(--c-border)",
  borderTopColor: "var(--c-cyan)",
  borderRadius: "50%",
};
