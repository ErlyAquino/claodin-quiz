import { useEffect, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { authHeaders } from "../lib/auth";

type Quiz = { id: number; title: string; questions: number; created_at: string; updated_at: string };
type Props = {
  onBack: () => void;
  onAuthExpired: () => void;
  onNew: () => void;
  onEdit: (id: number) => void;
  onPlay: (id: number) => void;
};

export function ProfessorPanel({ onBack, onAuthExpired, onNew, onEdit, onPlay }: Props) {
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null);
  const [pdfBusy, setPdfBusy] = useState<number | null>(null);
  const [pdfError, setPdfError] = useState("");

  async function load() {
    try {
      const r = await fetch("/api/quizzes", { headers: authHeaders() });
      if (r.status === 401) { onAuthExpired(); return; } // sessão de professor expirou → login
      setQuizzes(await r.json());
    } catch {
      setQuizzes([]);
    }
  }
  useEffect(() => { load(); }, []);

  async function remove(id: number, title: string) {
    if (!confirm(`Excluir o quiz "${title}"? Esta ação não pode ser desfeita.`)) return;
    await fetch(`/api/quizzes/${id}`, { method: "DELETE", headers: authHeaders() });
    load();
  }

  // Baixa o PDF do questionário + estatísticas das turmas (usa a sessão de professor).
  async function downloadPdf(id: number, title: string) {
    setPdfError("");
    setPdfBusy(id);
    try {
      const r = await fetch(`/api/quizzes/${id}/report.pdf`, { headers: authHeaders() });
      if (r.status === 401) { onAuthExpired(); return; }
      if (!r.ok) {
        let msg = "Falha ao gerar o PDF.";
        try { const d = await r.json(); msg = d?.error ?? msg; } catch { /* não era JSON */ }
        setPdfError(msg);
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 50) || "quiz"}-estatisticas.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setPdfError("Falha de conexão ao gerar o PDF.");
    } finally {
      setPdfBusy(null);
    }
  }

  return (
    <div style={wrap}>
      <div style={topRow}>
        <h1 className="display" style={{ margin: 0, fontSize: "var(--fs-2xl)" }}>📚 Meus quizzes</h1>
        <button onClick={onBack} style={ghost}>← Início</button>
      </div>

      <button onClick={onNew} style={newBtn}>+ Novo quiz</button>

      {pdfError && <div style={errBox}>{pdfError}</div>}

      {quizzes === null && <p style={{ color: "var(--c-text-muted)" }}>Carregando…</p>}
      {quizzes?.length === 0 && <p style={{ color: "var(--c-text-muted)" }}>Nenhum quiz ainda. Crie o primeiro! 👆</p>}

      <div style={list}>
        {quizzes?.map((q) => (
          <motion.div key={q.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={cardStyle}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="display" style={{ fontWeight: 700, fontSize: "var(--fs-lg)" }}>{q.title}</div>
              <div style={{ color: "var(--c-text-muted)", fontSize: "var(--fs-sm)" }}>
                {q.questions} pergunta{q.questions === 1 ? "" : "s"} · atualizado {q.updated_at}
              </div>
            </div>
            <div style={actions}>
              <button onClick={() => onPlay(q.id)} style={playBtn}>▶ Iniciar jogo</button>
              <button onClick={() => onEdit(q.id)} style={editBtn}>✏️ Editar</button>
              <button onClick={() => downloadPdf(q.id, q.title)} disabled={pdfBusy === q.id} style={pdfBtn} title="Baixar PDF do questionário + estatísticas das turmas que responderam">
                {pdfBusy === q.id ? "Gerando…" : "📄 PDF"}
              </button>
              <button onClick={() => remove(q.id, q.title)} style={delBtn} title="Excluir">🗑</button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const wrap: CSSProperties = { minHeight: "100%", display: "flex", flexDirection: "column", gap: "var(--sp-4)", padding: "var(--sp-5)", maxWidth: 760, margin: "0 auto", width: "100%" };
const topRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center" };
const list: CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--sp-3)" };
const cardStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap", background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: "var(--r-md)", padding: "var(--sp-4)" };
const actions: CSSProperties = { display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" };
const newBtn: CSSProperties = { cursor: "pointer", alignSelf: "flex-start", background: "var(--c-violet-strong)", color: "var(--c-text-on-strong)", border: "none", borderRadius: "var(--r-md)", padding: "var(--sp-3) var(--sp-5)", fontWeight: 700 };
const playBtn: CSSProperties = { cursor: "pointer", background: "var(--c-lime)", color: "var(--c-text-on-accent)", border: "none", borderRadius: "var(--r-sm)", padding: "var(--sp-2) var(--sp-4)", fontWeight: 800 };
const editBtn: CSSProperties = { cursor: "pointer", background: "var(--c-surface-2)", color: "var(--c-text)", border: "1px solid var(--c-border)", borderRadius: "var(--r-sm)", padding: "var(--sp-2) var(--sp-4)", fontWeight: 600 };
const pdfBtn: CSSProperties = { cursor: "pointer", background: "var(--c-surface-2)", color: "var(--c-cyan)", border: "1px solid var(--c-border)", borderRadius: "var(--r-sm)", padding: "var(--sp-2) var(--sp-4)", fontWeight: 700 };
const errBox: CSSProperties = { color: "var(--c-error)", background: "var(--c-surface)", border: "1px solid var(--c-error)", borderRadius: "var(--r-sm)", padding: "var(--sp-3)", fontSize: "var(--fs-sm)" };
const delBtn: CSSProperties = { cursor: "pointer", background: "transparent", color: "var(--c-text-muted)", border: "1px solid var(--c-border)", borderRadius: "var(--r-sm)", padding: "var(--sp-2) var(--sp-3)" };
const ghost: CSSProperties = { cursor: "pointer", background: "transparent", color: "var(--c-text-muted)", border: "1px solid var(--c-border)", borderRadius: "var(--r-md)", padding: "var(--sp-2) var(--sp-4)" };
