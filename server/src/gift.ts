// Importador de quizzes no formato GIFT (Moodle) → modelo do ClaOdin-Quiz.
//
// O DESAFIO: o GIFT usa caracteres de controle (`= ~ { } # : \`) para marcar a estrutura
// (`{ }` = bloco de respostas, `=` = correta, `~` = errada). Mas o LaTeX também usa muitos
// deles (`x = 2`, `\frac{a}{b}`, `\sqrt{}`). Sem cuidado, o `=` de uma equação seria lido
// como "início de resposta correta".
//
// A SOLUÇÃO: antes de interpretar QUALQUER estrutura GIFT, extraímos os blocos de matemática
// ($...$, $$...$$, \(...\), \[...\]) e os trocamos por marcadores neutros. O parser GIFT então
// só vê a estrutura real; no fim, restauramos o LaTeX original nos textos e alternativas.
// Assim o LaTeX convive com o GIFT sem nenhum conflito.

import type { Question, ScoringMode } from "./quiz.js";
import { MIN_OPTIONS, MAX_OPTIONS } from "./quiz.js";
import { sanitizeRichHtml, hasOversizedEquation } from "./sanitize.js";

const MAX_IMPORT_QUESTIONS = 100;
const DEFAULT_TIME = 20;
const DEFAULT_SCORING: ScoringMode = "rapido";

const OPEN = String.fromCharCode(0xe000);
const CLOSE = String.fromCharCode(0xe001);

const MATH_PATTERNS = [
  /\$\$[\s\S]*?\$\$/g, // $$ ... $$
  /\\\[[\s\S]*?\\\]/g, // \[ ... \]
  /\\\([\s\S]*?\\\)/g, // \( ... \)
  /\$[^$\n]*?\$/g,     // $ ... $
];

function protectMath(text: string, store: string[]): string {
  let out = text;
  for (const re of MATH_PATTERNS) {
    out = out.replace(re, (m) => {
      const tok = `${OPEN}${store.length}${CLOSE}`;
      store.push(m);
      return tok;
    });
  }
  return out;
}

function restoreMath(text: string, store: string[]): string {
  return text.replace(new RegExp(`${OPEN}(\\d+)${CLOSE}`, "g"), (_, i) => store[Number(i)] ?? "");
}

// Remove os escapes nativos do GIFT (`\=` → `=`, `\{` → `{`, etc.; `\n` → quebra de linha).
// Roda DEPOIS da proteção de matemática, então nunca toca em LaTeX (que está escondido).
function giftUnescape(s: string): string {
  return s.replace(/\\(.)/g, (_, c) => (c === "n" ? "\n" : c));
}

// Índice do primeiro `ch` não-escapado (pula pares `\X`).
function findUnescaped(s: string, ch: string, from = 0): number {
  for (let i = from; i < s.length; i++) {
    if (s[i] === "\\") { i++; continue; }
    if (s[i] === ch) return i;
  }
  return -1;
}

type Parsed = { options: string[]; correctIndex: number; isMC: boolean };

function parseAnswers(raw: string, store: string[]): Parsed {
  const tf = raw.trim().toUpperCase();
  if (tf === "T" || tf === "TRUE") return { options: ["Verdadeiro", "Falso"], correctIndex: 0, isMC: true };
  if (tf === "F" || tf === "FALSE") return { options: ["Verdadeiro", "Falso"], correctIndex: 1, isMC: true };

  // Tokeniza por marcadores `=`/`~` não-escapados.
  type Tok = { type: "=" | "~"; text: string };
  const tokens: Tok[] = [];
  let i = 0;
  while (i < raw.length && raw[i] !== "=" && raw[i] !== "~") {
    if (raw[i] === "\\") i++;
    i++;
  }
  while (i < raw.length) {
    const type = raw[i] as "=" | "~";
    i++;
    let buf = "";
    while (i < raw.length && raw[i] !== "=" && raw[i] !== "~") {
      if (raw[i] === "\\") { buf += (raw[i] ?? "") + (raw[i + 1] ?? ""); i += 2; continue; }
      buf += raw[i];
      i++;
    }
    tokens.push({ type, text: buf });
  }

  const options: string[] = [];
  let correctIndex = -1;
  let wrongCount = 0;
  for (const t of tokens) {
    let txt = t.text;
    txt = txt.replace(/^\s*%-?\d+(\.\d+)?%/, ""); // peso opcional (%50%, %-25%)
    const h = findUnescaped(txt, "#");            // remove feedback (#...)
    if (h >= 0) txt = txt.slice(0, h);
    txt = restoreMath(giftUnescape(txt), store).trim();
    if (!txt) continue;
    if (t.type === "=" && correctIndex < 0) correctIndex = options.length;
    if (t.type === "~") wrongCount++;
    options.push(txt);
  }
  // Só é múltipla escolha se houver pelo menos um distrator (~). Sem isso é
  // resposta-curta (`{=a =b}`) ou associação (`{=a -> b}`), que pulamos.
  return { options, correctIndex, isMC: wrongCount > 0 };
}

function parseBlock(block: string, store: string[]): Question | null {
  let s = block.trim();
  if (!s) return null;
  s = s.replace(/^::([\s\S]*?)::/, "").trim();             // título por questão (ignorado)
  s = s.replace(/^\[(html|markdown|moodle|plain)\]/i, ""); // marcador de formato

  const open = findUnescaped(s, "{");
  if (open < 0) return null;                  // sem bloco de respostas (descrição/dissertativa) → pula
  const close = findUnescaped(s, "}", open + 1);
  if (close < 0) return null;

  const text = restoreMath(giftUnescape(s.slice(0, open)).trim(), store).trim();
  if (!text) return null;

  let { options, correctIndex, isMC } = parseAnswers(s.slice(open + 1, close), store);
  if (!isMC || correctIndex < 0 || options.length < MIN_OPTIONS) return null; // não é MC de uma correta com distratores

  if (options.length > MAX_OPTIONS) {
    if (correctIndex >= MAX_OPTIONS) {        // garante que a correta sobreviva ao corte
      const c = options[correctIndex];
      options.splice(correctIndex, 1);
      options.unshift(c);
      correctIndex = 0;
    }
    options = options.slice(0, MAX_OPTIONS);
  }

  const cleanText = sanitizeRichHtml(text);
  const cleanOptions = options.map((o) => sanitizeRichHtml(o));
  if (!cleanText.trim() || cleanOptions.some((o) => !o.trim())) return null;
  if (hasOversizedEquation(cleanText) || cleanOptions.some((o) => hasOversizedEquation(o))) return null;

  return { text: cleanText, options: cleanOptions, correctIndex, timeLimitSec: DEFAULT_TIME, scoring: DEFAULT_SCORING };
}

/** Interpreta um arquivo GIFT e devolve as questões de múltipla escolha (uma correta). */
export function parseGift(content: string): Question[] {
  const store: string[] = [];
  // 0) remove os caracteres marcadores (área de uso privado) caso venham no arquivo,
  //    para não permitir falsificação de placeholders de matemática.
  const safe = content.replace(/[]/g, "");
  // 1) protege a matemática ANTES de qualquer parsing estrutural
  let text = protectMath(safe.replace(/\r\n/g, "\n"), store);
  // 2) remove linhas de comentário (// ...)
  text = text.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  // 3) separa as questões por linhas em branco
  const blocks = text.split(/\n[ \t]*\n/);

  const questions: Question[] = [];
  for (const block of blocks) {
    if (questions.length >= MAX_IMPORT_QUESTIONS) break;
    try {
      const q = parseBlock(block, store);
      if (q) questions.push(q);
    } catch {
      /* um bloco malformado nunca derruba o import inteiro */
    }
  }
  return questions;
}
