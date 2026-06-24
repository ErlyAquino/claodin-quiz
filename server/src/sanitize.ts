import sanitizeHtml from "sanitize-html";

// Sanitização de HTML rico no servidor (defense-in-depth). Limpa o HTML em volta
// (remove <script>, on*, javascript:, etc.) mas PRESERVA os blocos de matemática (LaTeX)
// crus — o cliente os escapa na hora de renderizar (lib/richText) e os exports (PDF/DOCX)
// precisam do LaTeX original. Isso evita dupla-escapagem entre servidor e cliente.

const MATH_PATTERNS = [
  /\$\$[\s\S]*?\$\$/g, // $$ ... $$
  /\\\[[\s\S]*?\\\]/g, // \[ ... \]
  /\\\([\s\S]*?\\\)/g, // \( ... \)
  /\$[^$\n]*?\$/g,     // $ ... $
];

// Marcadores em área de uso privado do Unicode (não aparecem em texto comum).
const OPEN = String.fromCharCode(0xe000);
const CLOSE = String.fromCharCode(0xe001);

const OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    "b", "strong", "i", "em", "u", "s", "strike", "sub", "sup",
    "p", "div", "br", "span", "ul", "ol", "li", "h1", "h2", "h3",
    "blockquote", "code", "pre", "a", "img",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt", "title", "width", "height"],
    "*": ["style"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  allowedStyles: {
    "*": {
      color: [/^[\w#(),.%\s-]+$/],
      "background-color": [/^[\w#(),.%\s-]+$/],
      "text-align": [/^(left|right|center|justify)$/],
      "font-weight": [/^(normal|bold|\d{3})$/],
      "font-style": [/^(normal|italic)$/],
      "text-decoration": [/^(none|underline|line-through)$/],
    },
  },
};

// Limite de tamanho por equação (anti-DoS no MathJax do cliente). Equações legítimas de
// sala de aula ficam bem abaixo disso; mas uma matriz gigante pode travar o navegador.
export const MAX_EQUATION_LEN = 1000;

export function hasOversizedEquation(html: string): boolean {
  for (const re of MATH_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      if (m[0].length > MAX_EQUATION_LEN) return true;
    }
  }
  return false;
}

export function sanitizeRichHtml(html: string): string {
  if (!html) return "";
  const store: string[] = [];
  // remove marcadores reservados que venham na entrada (evita falsificar placeholders)
  let out = html.replace(new RegExp(`[${OPEN}${CLOSE}]`, "g"), "");
  for (const re of MATH_PATTERNS) {
    out = out.replace(re, (m) => {
      const tok = `${OPEN}${store.length}${CLOSE}`;
      store.push(m); // matemática preservada crua
      return tok;
    });
  }
  let clean = sanitizeHtml(out, OPTS);
  clean = clean.replace(new RegExp(`${OPEN}(\\d+)${CLOSE}`, "g"), (_, i) => store[Number(i)] ?? "");
  return clean;
}
