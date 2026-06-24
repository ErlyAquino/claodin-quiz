import DOMPurify from "dompurify";

// Sanitização de conteúdo rico (HTML do usuário) preservando equações LaTeX.
//
// Problema: o HTML e o LaTeX se misturam, e desigualdades como `$a < b$` contêm `<`,
// que um sanitizador trataria como início de tag — quebrando a equação.
// Solução: extrair os blocos de matemática, sanitizar SÓ o HTML em volta, e reinserir
// o LaTeX já com `< > &` escapados. Assim o innerHTML é seguro (matemática vira texto,
// nunca tag) e o MathJax lê o textContent decodificado, preservando a equação.

const MATH_PATTERNS = [
  /\$\$[\s\S]*?\$\$/g, // $$ ... $$  (display)
  /\\\[[\s\S]*?\\\]/g, // \[ ... \]  (display)
  /\\\([\s\S]*?\\\)/g, // \( ... \)  (inline)
  /\$[^$\n]*?\$/g,     // $ ... $    (inline)
];

// Marcadores em área de uso privado do Unicode: não aparecem em texto comum
// e sobrevivem intactos à sanitização.
const OPEN = "";
const CLOSE = "";

// Decodifica entidades HTML com segurança (textarea trata o conteúdo como texto puro,
// então nada executa). Usado para normalizar a matemática antes de re-escapar.
function decodeEntities(s: string): string {
  const ta = document.createElement("textarea");
  ta.innerHTML = s;
  return ta.value;
}

// Escape idempotente: decodifica primeiro, então re-escapa. Assim `$a < b$` e `$a &lt; b$`
// produzem o mesmo resultado (`$a &lt; b$`) — sem dupla-escapagem no ida-e-volta do editor.
function escapeHtml(s: string): string {
  return decodeEntities(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sanitizeRich(html: string): string {
  if (!html) return "";
  const store: string[] = [];
  // remove marcadores reservados que venham na entrada (evita falsificar placeholders)
  let out = html.replace(new RegExp(`[${OPEN}${CLOSE}]`, "g"), "");
  for (const re of MATH_PATTERNS) {
    out = out.replace(re, (m) => {
      const tok = `${OPEN}${store.length}${CLOSE}`;
      store.push(escapeHtml(m)); // matemática escapada: segura como innerHTML, intacta para o MathJax
      return tok;
    });
  }
  let clean = DOMPurify.sanitize(out, { USE_PROFILES: { html: true } });
  clean = clean.replace(new RegExp(`${OPEN}(\\d+)${CLOSE}`, "g"), (_, i) => store[Number(i)] ?? "");
  return clean;
}
