import { motion } from "framer-motion";
import { SchoolLogo } from "../components/SchoolLogo";
import { BrandLogo } from "../components/BrandLogo";

type Props = { connected: boolean; online: number; onStudent: () => void; onHost: () => void };

export function Home({ connected, online, onStudent, onHost }: Props) {
  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--sp-4)",
        padding: "var(--sp-4)",
        textAlign: "center",
      }}
    >
      {/* status de conexão ao vivo */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          position: "fixed",
          zIndex: "var(--z-sticky)",
          top: "var(--sp-3)",
          right: "var(--sp-3)",
          display: "flex",
          alignItems: "center",
          gap: "var(--sp-2)",
          fontSize: "var(--fs-xs)",
          color: "var(--c-text-muted)",
          background: "var(--c-surface)",
          border: "1px solid var(--c-border)",
          padding: "6px 12px",
          borderRadius: "var(--r-pill)",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: connected ? "var(--c-success)" : "var(--c-error)",
            boxShadow: connected ? "var(--glow-dot)" : "none",
          }}
        />
        {connected ? `conectado · ${online} online` : "reconectando…"}
      </motion.div>

      {/* logo da escola — pequena, crédito da ETE acima da marca */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <SchoolLogo maxWidth={120} />
      </motion.div>

      {/* identidade da marca — ClaOdin-Quiz (arte recolorida p/ neo-arcade) */}
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <BrandLogo maxWidth={400} />
      </motion.div>

      {/* entradas — aluno em destaque no topo, professor menor embaixo */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)", width: "100%", maxWidth: 360 }}>
        {/* ALUNO — botão principal, grande, com destaque */}
        <motion.button
          onClick={onStudent}
          whileHover={{ y: -4, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
          style={{
            cursor: "pointer",
            width: "100%",
            textAlign: "left",
            color: "var(--c-text)",
            background: "var(--c-surface)",
            border: "2px solid var(--c-cyan)",
            borderRadius: "var(--r-lg)",
            padding: "var(--sp-5)",
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-4)",
            boxShadow: "var(--glow-cyan-ring), var(--shadow-md)",
          }}
        >
          <span style={{ fontSize: 38 }}>🚀</span>
          <span style={{ display: "flex", flexDirection: "column" }}>
            <span className="display" style={{ fontSize: "var(--fs-xl)", fontWeight: 700 }}>Sou aluno</span>
            <span style={{ color: "var(--c-text-muted)", fontSize: "var(--fs-sm)" }}>Entrar com PIN ou QR</span>
          </span>
          <span style={{ marginLeft: "auto", fontSize: "var(--fs-xl)", color: "var(--c-cyan)" }}>→</span>
        </motion.button>

        {/* PROFESSOR — botão secundário, menor */}
        <motion.button
          onClick={onHost}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          style={{
            cursor: "pointer",
            width: "100%",
            color: "var(--c-text-muted)",
            background: "transparent",
            border: "1px solid var(--c-border)",
            borderRadius: "var(--r-md)",
            padding: "var(--sp-3) var(--sp-4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--sp-2)",
            fontSize: "var(--fs-sm)",
            fontWeight: 500,
          }}
        >
          <span style={{ fontSize: 16 }}>🎬</span> Sou professor · criar sala
        </motion.button>
      </div>

      <p style={{ color: "var(--c-text-faint)", fontSize: "var(--fs-xs)", margin: 0 }}>
        ClaOdin-Quiz · ETE Epitácio Pessoa
      </p>
    </div>
  );
}
