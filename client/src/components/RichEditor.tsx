import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MathContent } from "./MathContent";
import { sanitizeRich } from "../lib/richText";

// Editor de texto rico do quiz: barra de ferramentas (formatação), inserção de equações LaTeX,
// modo de código HTML e preview ao vivo. O valor é uma string HTML (com LaTeX em \(...\) / $$...$$).

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
};

export function RichEditor({ value, onChange, placeholder, minHeight = 120 }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastHtml = useRef<string>("");
  const prevMode = useRef<"rico" | "html">("rico");
  const [mode, setMode] = useState<"rico" | "html">("rico");

  // Sincroniza o DOM com o valor externo. Reescreve quando o valor externo difere do que
  // emitimos (evita resetar o cursor ao digitar) OU quando acabamos de voltar do modo HTML
  // (o contentEditable remonta vazio e precisa ser re-hidratado). Sempre sanitiza antes
  // de ir ao innerHTML — nunca injeta HTML cru.
  useEffect(() => {
    if (mode !== "rico") { prevMode.current = mode; return; }
    const el = editorRef.current;
    if (!el) return;
    const switchedToRico = prevMode.current !== "rico";
    prevMode.current = mode;
    if (switchedToRico || value !== lastHtml.current) {
      el.innerHTML = sanitizeRich(value ?? "");
      lastHtml.current = value ?? "";
    }
  }, [value, mode]);

  const emit = (html: string) => { lastHtml.current = html; onChange(html); };
  const onInput = () => { const el = editorRef.current; if (el) emit(el.innerHTML); };

  // Executa um comando de formatação mantendo a seleção do editor.
  const exec = (cmd: string, arg?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, arg);
    onInput();
  };

  const insertLatex = (display: boolean) => {
    const tex = window.prompt(display ? "Equação em LaTeX (display, centralizada):" : "Equação em LaTeX (na linha):", display ? "\\frac{a}{b}" : "x^2");
    if (tex == null) return;
    const snippet = display ? `\\[ ${tex} \\]` : `\\( ${tex} \\)`;
    editorRef.current?.focus();
    document.execCommand("insertText", false, snippet);
    onInput();
  };

  const addLink = () => {
    const url = window.prompt("Endereço do link (https://...):", "https://");
    if (!url) return;
    exec("createLink", url);
  };

  const groups: Array<Array<{ label: string; title: string; on: () => void }>> = [
    [
      { label: "B", title: "Negrito", on: () => exec("bold") },
      { label: "I", title: "Itálico", on: () => exec("italic") },
      { label: "U", title: "Sublinhado", on: () => exec("underline") },
      { label: "S̶", title: "Tachado", on: () => exec("strikeThrough") },
    ],
    [
      { label: "x²", title: "Sobrescrito", on: () => exec("superscript") },
      { label: "x₂", title: "Subscrito", on: () => exec("subscript") },
    ],
    [
      { label: "T₁", title: "Título", on: () => exec("formatBlock", "H2") },
      { label: "T₂", title: "Subtítulo", on: () => exec("formatBlock", "H3") },
      { label: "¶", title: "Parágrafo normal", on: () => exec("formatBlock", "P") },
    ],
    [
      { label: "• Lista", title: "Lista com marcadores", on: () => exec("insertUnorderedList") },
      { label: "1. Lista", title: "Lista numerada", on: () => exec("insertOrderedList") },
    ],
    [
      { label: "🔗", title: "Inserir link", on: addLink },
      { label: "∑ Equação", title: "Inserir equação LaTeX (na linha)", on: () => insertLatex(false) },
      { label: "∑ bloco", title: "Inserir equação LaTeX (centralizada)", on: () => insertLatex(true) },
    ],
    [
      { label: "✕ formato", title: "Limpar formatação", on: () => exec("removeFormat") },
    ],
  ];

  return (
    <div style={shell}>
      <div style={toolbar}>
        {groups.map((g, gi) => (
          <div key={gi} style={group}>
            {g.map((b) => (
              <button
                key={b.label}
                type="button"
                title={b.title}
                onMouseDown={(e) => { e.preventDefault(); b.on(); }}
                style={tbtn}
              >
                {b.label}
              </button>
            ))}
          </div>
        ))}
        <div style={{ ...group, marginLeft: "auto" }}>
          <button
            type="button"
            title="Editar o código HTML diretamente"
            onMouseDown={(e) => { e.preventDefault(); setMode((m) => (m === "rico" ? "html" : "rico")); }}
            style={{ ...tbtn, ...(mode === "html" ? tbtnActive : {}) }}
          >
            {"</> HTML"}
          </button>
        </div>
      </div>

      {mode === "rico" ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={onInput}
          data-placeholder={placeholder ?? "Escreva aqui…"}
          style={{ ...editable, minHeight }}
          className="rich-editable"
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => emit(e.target.value)}
          placeholder="HTML (ex.: <b>texto</b>, equações em \\( ... \\) ou $$ ... $$)"
          spellCheck={false}
          style={{ ...editable, minHeight, fontFamily: "ui-monospace, Consolas, monospace", fontSize: "var(--fs-sm)", whiteSpace: "pre-wrap" }}
        />
      )}

      <div style={previewWrap}>
        <span style={previewLabel}>Pré-visualização</span>
        {value.trim()
          ? <MathContent html={value} block style={{ color: "var(--c-text)" }} />
          : <span style={{ color: "var(--c-text-faint)", fontSize: "var(--fs-sm)" }}>—</span>}
      </div>
    </div>
  );
}

const shell: CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--sp-2)", border: "1px solid var(--c-border)", borderRadius: "var(--r-md)", padding: "var(--sp-2)", background: "var(--c-bg-800)" };
const toolbar: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "var(--sp-2)", alignItems: "center" };
const group: CSSProperties = { display: "flex", gap: 2, padding: 2, background: "var(--c-surface)", borderRadius: "var(--r-sm)" };
const tbtn: CSSProperties = { cursor: "pointer", minWidth: 30, height: 30, padding: "0 8px", background: "transparent", color: "var(--c-text)", border: "1px solid transparent", borderRadius: "var(--r-sm)", fontWeight: 700, fontSize: "var(--fs-sm)", lineHeight: 1 };
const tbtnActive: CSSProperties = { background: "var(--c-violet-strong)", color: "var(--c-text-on-strong)" };
const editable: CSSProperties = { width: "100%", background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: "var(--r-sm)", color: "var(--c-text)", padding: "var(--sp-3)", fontSize: "var(--fs-md)", outline: "none", resize: "vertical" };
const previewWrap: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, background: "var(--c-surface)", border: "1px dashed var(--c-border)", borderRadius: "var(--r-sm)", padding: "var(--sp-3)" };
const previewLabel: CSSProperties = { fontSize: "var(--fs-xs)", color: "var(--c-text-faint)", textTransform: "uppercase", letterSpacing: ".5px" };
