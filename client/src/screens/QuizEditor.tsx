import { useEffect, useState, type CSSProperties } from "react";
import { ANSWER_SHAPES, ANSWER_COLORS, MIN_OPTIONS, MAX_OPTIONS } from "../components/Shapes";
import { RichEditor } from "../components/RichEditor";
import { MathContent } from "../components/MathContent";
import { authHeaders } from "../lib/auth";

// Detecta se uma alternativa tem HTML ou LaTeX (para mostrar um preview ao vivo).
const looksRich = (s: string) => /[<$]|\\\(|\\\[/.test(s);

type Scoring = "rapido" | "lento";
type EQ = { _id: number; text: string; options: string[]; correctIndex: number; timeLimitSec: number; scoring: Scoring; image?: string };
type Props = { quizId: number | null; onDone: () => void; onCancel: () => void };

let _uid = 0;
const blank = (): EQ => ({ _id: ++_uid, text: "", options: ["", "", "", ""], correctIndex: 0, timeLimitSec: 20, scoring: "rapido" });

export function QuizEditor({ quizId, onDone, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<EQ[]>([blank()]);
  const [loading, setLoading] = useState(quizId !== null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // geração por IA (multi-provedor)
  type Prov = "claude" | "openai" | "gemini";
  const [providers, setProviders] = useState<Record<Prov, boolean> | null>(null);
  const [provider, setProvider] = useState<Prov>("claude");
  const [aiOpen, setAiOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState("médio");
  const [aiOptionCount, setAiOptionCount] = useState(4);
  const [aiScoring, setAiScoring] = useState<Scoring>("rapido");
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState("");

  // importação de quiz no formato GIFT (Moodle)
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        const p: Record<Prov, boolean> = d?.ai ?? { claude: false, openai: false, gemini: false };
        setProviders(p);
        const first = (["claude", "openai", "gemini"] as Prov[]).find((k) => p[k]);
        if (first) setProvider(first);
      })
      .catch(() => setProviders({ claude: false, openai: false, gemini: false }));
  }, []);

  useEffect(() => {
    if (quizId === null) return;
    (async () => {
      try {
        const r = await fetch(`/api/quizzes/${quizId}`, { headers: authHeaders() });
        const q = await r.json();
        setTitle(q.title);
        setQuestions(
          (q.questions ?? []).map((x: any) => ({
            _id: ++_uid, text: x.text, options: x.options, correctIndex: x.correctIndex, timeLimitSec: x.timeLimitSec, scoring: x.scoring, image: x.image,
          }))
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [quizId]);

  const patch = (i: number, p: Partial<EQ>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...p } : q)));
  const setOpt = (i: number, k: number, v: string) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, options: q.options.map((o, m) => (m === k ? v : o)) } : q)));
  const addOption = (i: number) =>
    setQuestions((qs) => qs.map((q, j) => (j === i && q.options.length < MAX_OPTIONS ? { ...q, options: [...q.options, ""] } : q)));
  const removeOption = (i: number, k: number) =>
    setQuestions((qs) =>
      qs.map((q, j) => {
        if (j !== i || q.options.length <= MIN_OPTIONS) return q;
        const options = q.options.filter((_, m) => m !== k);
        // mantém a alternativa correta apontando para a certa após a remoção
        let correctIndex = q.correctIndex;
        if (k === correctIndex) correctIndex = 0;
        else if (k < correctIndex) correctIndex -= 1;
        return { ...q, options, correctIndex };
      })
    );

  async function uploadImage(i: number, file: File) {
    if (!file.type.startsWith("image/")) return;
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await fetch("/api/upload", { method: "POST", headers: authHeaders(), body: fd });
      const data = await r.json();
      if (r.ok && data.url) patch(i, { image: data.url });
      else setError(data?.error ?? "Falha no upload da imagem.");
    } catch {
      setError("Falha no upload da imagem.");
    }
  }

  async function generate(replace: boolean) {
    setGenError("");
    setGenBusy(true);
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ provider, topic, count, difficulty, scoring: aiScoring, optionCount: aiOptionCount }),
      });
      const data = await r.json();
      if (!r.ok) { setGenError(data?.error ?? "Falha ao gerar."); return; }
      const gen: EQ[] = (data.questions ?? []).map((x: any) => ({
        _id: ++_uid, text: x.text, options: x.options, correctIndex: x.correctIndex, timeLimitSec: x.timeLimitSec, scoring: x.scoring,
      }));
      if (!gen.length) { setGenError("A IA não retornou perguntas. Tente de novo."); return; }
      setQuestions((qs) => (replace ? gen : [...qs.filter((q) => q.text.trim() || q.options.some((o) => o.trim())), ...gen]));
      if (!title.trim()) setTitle(topic.slice(0, 60));
    } catch {
      setGenError("Falha de conexão com a IA.");
    } finally {
      setGenBusy(false);
    }
  }

  async function importGift(file: File) {
    setImportError("");
    setImportBusy(true);
    try {
      const content = await file.text();
      const r = await fetch("/api/import/gift", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ content }),
      });
      const data = await r.json();
      if (!r.ok) { setImportError(data?.error ?? "Falha ao importar o GIFT."); return; }
      const imported: EQ[] = (data.questions ?? []).map((x: any) => ({
        _id: ++_uid, text: x.text, options: x.options, correctIndex: x.correctIndex, timeLimitSec: x.timeLimitSec, scoring: x.scoring,
      }));
      if (!imported.length) { setImportError("Nenhuma questão válida encontrada no arquivo."); return; }
      setQuestions((qs) => [...qs.filter((q) => q.text.trim() || q.options.some((o) => o.trim())), ...imported]);
      if (!title.trim()) setTitle(file.name.replace(/\.(gift|txt)$/i, "").slice(0, 60));
    } catch {
      setImportError("Falha ao ler ou importar o arquivo.");
    } finally {
      setImportBusy(false);
    }
  }

  async function save() {
    setError("");
    setSaving(true);
    try {
      const url = quizId === null ? "/api/quizzes" : `/api/quizzes/${quizId}`;
      const method = quizId === null ? "POST" : "PUT";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ title, questions }) });
      const data = await r.json();
      if (!r.ok) setError(data?.error ?? "Erro ao salvar.");
      else onDone();
    } catch {
      setError("Falha de conexão ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={wrap}><p style={{ color: "var(--c-text-muted)" }}>Carregando…</p></div>;

  return (
    <div style={wrap}>
      <div style={topRow}>
        <input style={titleInput} placeholder="Título do quiz" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div style={{ display: "flex", gap: "var(--sp-2)" }}>
          <button onClick={onCancel} style={ghost}>Cancelar</button>
          <button onClick={save} disabled={saving} style={saveBtn}>{saving ? "Salvando…" : "💾 Salvar"}</button>
        </div>
      </div>

      {/* Importar quiz no formato GIFT (Moodle) */}
      <div style={importRow}>
        <label style={{ ...uploadBtn, opacity: importBusy ? 0.6 : 1 }}>
          {importBusy ? "Importando…" : "📥 Importar GIFT"}
          <input type="file" accept=".gift,.txt,text/plain" disabled={importBusy} style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importGift(f); e.target.value = ""; }} />
        </label>
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-faint)" }}>
          Arquivo <code>.gift</code> (Moodle): importa texto, alternativas e a correta — com suporte a equações LaTeX.
        </span>
      </div>
      {importError && <div style={errBox}>{importError}</div>}

      {/* Gerar com IA */}
      <div style={aiPanel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700 }}>✨ Gerar perguntas com IA</span>
          <button onClick={() => setAiOpen((v) => !v)} style={ghost}>{aiOpen ? "fechar" : "abrir"}</button>
        </div>
        {aiOpen && (providers && !providers.claude && !providers.openai && !providers.gemini ? (
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" }}>
            Nenhuma IA configurada. Preencha <code>ANTHROPIC_API_KEY</code>, <code>OPENAI_API_KEY</code> ou <code>GEMINI_API_KEY</code> no <code>.env</code> do servidor e reinicie.
          </div>
        ) : (
          <>
            <div style={{ ...inline, flexWrap: "wrap" }}>
              <span>Modelo de IA:</span>
              {([["claude", "🟣 Claude"], ["openai", "🟢 ChatGPT"], ["gemini", "🔵 Gemini"]] as [Prov, string][]).map(([id, label]) => {
                const enabled = !providers || providers[id];
                return (
                  <button key={id} type="button" disabled={!enabled} onClick={() => setProvider(id)} title={enabled ? "" : "Sem chave no .env"}
                    style={{ ...modeBtn, ...(provider === id ? modeActive : {}), opacity: enabled ? 1 : 0.4, cursor: enabled ? "pointer" : "not-allowed" }}>
                    {label}
                  </button>
                );
              })}
            </div>
            <input style={input} placeholder="Tema (ex.: Revolução Francesa para o 8º ano)" value={topic} onChange={(e) => setTopic(e.target.value)} />
            <div style={{ display: "flex", gap: "var(--sp-4)", flexWrap: "wrap", alignItems: "center" }}>
              <label style={inline}>Quantidade:
                <input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value) || 5)} style={numInput} />
              </label>
              <label style={inline}>Nível:
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={selectStyle}>
                  <option value="fácil">fácil</option>
                  <option value="médio">médio</option>
                  <option value="difícil">difícil</option>
                </select>
              </label>
              <label style={inline}>Opções por pergunta:
                <select value={aiOptionCount} onChange={(e) => setAiOptionCount(Number(e.target.value) || 4)} style={selectStyle}>
                  {Array.from({ length: MAX_OPTIONS - MIN_OPTIONS + 1 }, (_, n) => n + MIN_OPTIONS).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <div style={inline}>
                <span>Pontuação:</span>
                <button type="button" onClick={() => setAiScoring("rapido")} style={{ ...modeBtn, ...(aiScoring === "rapido" ? modeActive : {}) }}>⚡ Rápido</button>
                <button type="button" onClick={() => setAiScoring("lento")} style={{ ...modeBtn, ...(aiScoring === "lento" ? modeActive : {}) }}>🐢 Lento</button>
              </div>
            </div>
            {genError && <div style={errBox}>{genError}</div>}
            <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
              <button onClick={() => generate(false)} disabled={genBusy || !topic.trim()} style={saveBtn}>{genBusy ? "Gerando…" : "Gerar e adicionar"}</button>
              <button onClick={() => generate(true)} disabled={genBusy || !topic.trim()} style={ghost}>Substituir tudo</button>
            </div>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-faint)" }}>Revise sempre as perguntas geradas antes de salvar.</div>
          </>
        ))}
      </div>

      {error && <div style={errBox}>{error}</div>}

      {questions.map((q, i) => (
        <div
          key={q._id}
          style={card}
          onPaste={(e) => {
            const item = [...e.clipboardData.items].find((it) => it.type.startsWith("image/"));
            const f = item?.getAsFile();
            if (f) { e.preventDefault(); uploadImage(i, f); }
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--c-gold-ink)", fontWeight: 700 }}>Pergunta {i + 1}</span>
            {questions.length > 1 && <button onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} style={delBtn}>remover</button>}
          </div>

          <RichEditor value={q.text} onChange={(html) => patch(i, { text: html })} placeholder="Enunciado da pergunta — aceita formatação, HTML e equações LaTeX" />

          {/* imagem (opcional): enviar, colar (Ctrl+V no cartão) ou URL */}
          <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
            <label style={uploadBtn}>📷 Enviar imagem
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(i, f); e.target.value = ""; }} />
            </label>
            <input style={{ ...input, flex: 1, minWidth: 160, fontSize: "var(--fs-sm)" }} placeholder="ou cole a URL / Ctrl+V de um print" value={q.image ?? ""} onChange={(e) => patch(i, { image: e.target.value })} />
          </div>
          {q.image && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
              <img src={q.image} alt="" style={{ maxHeight: 90, maxWidth: "100%", borderRadius: "var(--r-sm)", border: "1px solid var(--c-border)" }} />
              <button onClick={() => patch(i, { image: undefined })} style={delBtn}>remover imagem</button>
            </div>
          )}

          <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-muted)" }}>Alternativas — clique no círculo para marcar a correta:</div>
          {q.options.map((opt, k) => {
            const Shape = ANSWER_SHAPES[k];
            const correct = q.correctIndex === k;
            return (
              <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                  <button type="button" onClick={() => patch(i, { correctIndex: k })} title="Marcar como correta"
                    style={{ ...mark, background: correct ? "var(--c-success)" : "transparent", borderColor: correct ? "var(--c-success)" : "var(--c-border)" }}>
                    {correct ? "✓" : ""}
                  </button>
                  <span style={{ color: ANSWER_COLORS[k], display: "flex" }}><Shape size={18} /></span>
                  <input style={input} placeholder={`Alternativa ${k + 1} — aceita HTML e LaTeX ($...$)`} value={opt} onChange={(e) => setOpt(i, k, e.target.value)} />
                  {q.options.length > MIN_OPTIONS && (
                    <button type="button" onClick={() => removeOption(i, k)} title="Remover alternativa" style={optDelBtn}>✕</button>
                  )}
                </div>
                {looksRich(opt) && (
                  <MathContent html={opt} block style={{ marginLeft: 58, fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" }} />
                )}
              </div>
            );
          })}
          {q.options.length < MAX_OPTIONS && (
            <button type="button" onClick={() => addOption(i)} style={addOptBtn}>
              + Adicionar alternativa <span style={{ color: "var(--c-text-faint)" }}>({q.options.length}/{MAX_OPTIONS})</span>
            </button>
          )}

          <div style={{ display: "flex", gap: "var(--sp-4)", flexWrap: "wrap", alignItems: "center", marginTop: "var(--sp-1)" }}>
            <label style={inline}>⏱ Tempo (s):
              <input type="number" min={5} max={120} value={q.timeLimitSec} onChange={(e) => patch(i, { timeLimitSec: Number(e.target.value) || 20 })} style={numInput} />
            </label>
            <div style={inline}>
              <span>Pontuação:</span>
              <button type="button" onClick={() => patch(i, { scoring: "rapido" })} style={{ ...modeBtn, ...(q.scoring === "rapido" ? modeActive : {}) }}>⚡ Rápido</button>
              <button type="button" onClick={() => patch(i, { scoring: "lento" })} style={{ ...modeBtn, ...(q.scoring === "lento" ? modeActive : {}) }}>🐢 Lento</button>
            </div>
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-faint)" }}>
            {q.scoring === "rapido" ? "Quem responde mais rápido ganha mais pontos." : "Acertar vale a pontuação cheia, sem importar o tempo."}
          </div>
        </div>
      ))}

      <button onClick={() => setQuestions((qs) => [...qs, blank()])} style={addBtn}>+ Adicionar pergunta</button>
      <button onClick={save} disabled={saving} style={{ ...saveBtn, alignSelf: "stretch" }}>{saving ? "Salvando…" : "💾 Salvar quiz"}</button>
    </div>
  );
}

const wrap: CSSProperties = { minHeight: "100%", display: "flex", flexDirection: "column", gap: "var(--sp-3)", padding: "var(--sp-5)", maxWidth: 720, margin: "0 auto", width: "100%" };
const topRow: CSSProperties = { display: "flex", gap: "var(--sp-3)", alignItems: "center", flexWrap: "wrap" };
const titleInput: CSSProperties = { flex: 1, minWidth: 200, background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: "var(--r-sm)", color: "var(--c-text)", padding: "var(--sp-3)", fontSize: "var(--fs-lg)", fontWeight: 700, fontFamily: "var(--font-display)" };
const importRow: CSSProperties = { display: "flex", gap: "var(--sp-3)", alignItems: "center", flexWrap: "wrap" };
const aiPanel: CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--sp-3)", background: "var(--c-surface)", border: "1px solid var(--c-violet)", borderRadius: "var(--r-md)", padding: "var(--sp-4)" };
const card: CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--sp-2)", background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: "var(--r-md)", padding: "var(--sp-4)" };
const input: CSSProperties = { width: "100%", background: "var(--c-bg-800)", border: "1px solid var(--c-border)", borderRadius: "var(--r-sm)", color: "var(--c-text)", padding: "var(--sp-3)", fontSize: "var(--fs-md)" };
const numInput: CSSProperties = { width: 64, background: "var(--c-bg-800)", border: "1px solid var(--c-border)", borderRadius: "var(--r-sm)", color: "var(--c-text)", padding: "6px", fontWeight: 700, textAlign: "center" };
const selectStyle: CSSProperties = { background: "var(--c-bg-800)", border: "1px solid var(--c-border)", borderRadius: "var(--r-sm)", color: "var(--c-text)", padding: "6px", fontWeight: 600 };
const uploadBtn: CSSProperties = { cursor: "pointer", background: "var(--c-surface-2)", color: "var(--c-text)", border: "1px solid var(--c-border)", borderRadius: "var(--r-sm)", padding: "var(--sp-2) var(--sp-3)", fontSize: "var(--fs-sm)", fontWeight: 600, whiteSpace: "nowrap" };
const mark: CSSProperties = { cursor: "pointer", width: 26, height: 26, borderRadius: "50%", border: "2px solid var(--c-border)", color: "var(--c-text-on-state)", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
const inline: CSSProperties = { display: "flex", alignItems: "center", gap: "var(--sp-2)", fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" };
const modeBtn: CSSProperties = { cursor: "pointer", background: "var(--c-surface-2)", color: "var(--c-text-muted)", border: "1px solid var(--c-border)", borderRadius: "var(--r-pill)", padding: "4px 12px", fontWeight: 700, fontSize: "var(--fs-sm)" };
const modeActive: CSSProperties = { background: "var(--c-violet-strong)", color: "var(--c-text-on-strong)", border: "1px solid var(--c-violet-strong)" };
const addBtn: CSSProperties = { cursor: "pointer", background: "transparent", color: "var(--c-cyan)", border: "1px dashed var(--c-border)", borderRadius: "var(--r-md)", padding: "var(--sp-3)", fontWeight: 700 };
const saveBtn: CSSProperties = { cursor: "pointer", background: "var(--c-lime)", color: "var(--c-text-on-accent)", border: "none", borderRadius: "var(--r-md)", padding: "var(--sp-3) var(--sp-5)", fontWeight: 800 };
const ghost: CSSProperties = { cursor: "pointer", background: "transparent", color: "var(--c-text-muted)", border: "1px solid var(--c-border)", borderRadius: "var(--r-md)", padding: "var(--sp-2) var(--sp-4)" };
const delBtn: CSSProperties = { cursor: "pointer", background: "transparent", color: "var(--c-error)", border: "1px solid var(--c-border)", borderRadius: "var(--r-sm)", padding: "4px 10px", fontSize: "var(--fs-sm)" };
const optDelBtn: CSSProperties = { cursor: "pointer", background: "transparent", color: "var(--c-text-faint)", border: "1px solid var(--c-border)", borderRadius: "var(--r-sm)", width: 32, height: 32, flexShrink: 0, fontWeight: 800, lineHeight: 1 };
const addOptBtn: CSSProperties = { alignSelf: "flex-start", cursor: "pointer", background: "transparent", color: "var(--c-cyan)", border: "1px dashed var(--c-border)", borderRadius: "var(--r-sm)", padding: "var(--sp-2) var(--sp-3)", fontWeight: 700, fontSize: "var(--fs-sm)" };
const errBox: CSSProperties = { color: "var(--c-error)", background: "var(--c-surface)", border: "1px solid var(--c-error)", borderRadius: "var(--r-sm)", padding: "var(--sp-3)", fontSize: "var(--fs-sm)" };
