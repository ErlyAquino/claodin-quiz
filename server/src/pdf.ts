// Geração de PDF do relatório de um quiz (questionário + gabarito + estatísticas por turma).
//
// Estratégia: montamos um documento LaTeX a partir do QuizReport e compilamos com o
// pdflatex do MiKTeX em um diretório temporário ISOLADO, com -no-shell-escape (segurança).
// O conteúdo (`text`/`options`) chega como HTML rico + LaTeX cru; convertemos as tags HTML
// básicas para comandos LaTeX, escapamos os caracteres especiais SÓ no texto comum e
// reinserimos os blocos de matemática crus (já são LaTeX).
//
// Limitações conhecidas / melhorias futuras:
//  - Imagens das questões (`question.image`) são omitidas; deixamos a nota "[imagem]".
//    Incluir imagens exigiria baixar URLs / resolver arquivos, o que tiramos de propósito
//    para manter o módulo simples e robusto.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { QuizReport } from "./db.js";

const PDFLATEX_TIMEOUT_MS = 15_000;

// Caminho conhecido do MiKTeX (Windows). Caímos para "pdflatex" do PATH se não existir,
// para não depender de uma instalação específica.
const PDFLATEX_BIN = (() => {
  const known = "C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\pdflatex.exe";
  return existsSync(known) ? known : "pdflatex";
})();

// ======================================================================
// Conversão HTML rico + LaTeX -> LaTeX
// ======================================================================

// Mesmos padrões usados na sanitização do servidor: blocos de matemática que devem
// passar CRUS (já são LaTeX). A ordem importa: $$..$$ antes de $..$.
const MATH_PATTERNS: RegExp[] = [
  /\$\$[\s\S]*?\$\$/g, // $$ ... $$
  /\\\[[\s\S]*?\\\]/g, // \[ ... \]
  /\\\([\s\S]*?\\\)/g, // \( ... \)
  /\$[^$\n]*?\$/g,     // $ ... $
];

// Marcadores em área de uso privado do Unicode — não colidem com texto comum nem
// com comandos LaTeX, então podemos escapar/transformar o texto sem mexer na matemática.
const OPEN = String.fromCharCode(0xe000);
const CLOSE = String.fromCharCode(0xe001);

// Caracteres especiais do LaTeX no texto comum. `\ { } $ & # % _ ^ ~`.
// A barra invertida é marcada com um caractere temporário e materializada por ÚLTIMO,
// senão as chaves de `\textbackslash{}` seriam re-escapadas (vira "textbackslash{}" literal).
const BS_MARK = String.fromCharCode(0xe002);
function escapeLatexText(s: string): string {
  return s
    .split(BS_MARK).join("")
    .replace(/\\/g, BS_MARK)
    .replace(/([{}$&#%_])/g, "\\$1")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/~/g, "\\textasciitilde{}")
    .split(BS_MARK).join("\\textbackslash{}");
}

// Comandos TeX/LaTeX perigosos (I/O de arquivo, shell, (re)definição de macro, catcode,
// loops). O conteúdo de matemática do usuário passa CRU para o pdflatex, então neutralizamos
// esses comandos lá dentro (`\input` -> ` input`, texto inerte). Combinado com -no-shell-escape
// e openin_any/openout_any=p no compilador, fecha leitura de arquivo, execução e loop infinito.
const DANGEROUS_TEX = [
  "input", "include", "includeonly", "openin", "openout", "read", "readline", "write", "immediate",
  "special", "directlua", "catcode", "csname", "endcsname", "def", "edef", "gdef", "xdef", "let",
  "futurelet", "expandafter", "scantokens", "detokenize", "newread", "newwrite", "newcommand",
  "renewcommand", "providecommand", "loop", "repeat", "errmessage", "batchmode", "shipout",
  "afterassignment", "aftergroup", "lccode", "uccode", "mathcode", "endinput", "usepackage",
  "RequirePackage", "documentclass", "lstinputlisting", "verbatiminput", "jobname", "escapechar",
  "pdfprimitive", "primitive", "input@path", "filecontents",
];
const DANGEROUS_RE = new RegExp("\\\\(" + DANGEROUS_TEX.join("|") + ")(?![a-zA-Z])", "g");

// Sanitiza um bloco de matemática (LaTeX cru do usuário): neutraliza comandos perigosos e
// escapa `%` (que em LaTeX é comentário — nunca é matemática válida e "comeria" a linha).
function sanitizeMathBlock(m: string): string {
  return m.replace(DANGEROUS_RE, " $1").replace(/%/g, "\\%");
}

// Decodifica entidades HTML comuns ANTES de escapar (assim `&amp;` vira `&` e depois `\&`).
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => {
      const code = Number(d);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    });
}

/**
 * Converte um trecho de HTML rico (com matemática LaTeX embutida) para LaTeX seguro.
 * 1) extrai a matemática para placeholders; 2) decodifica entidades; 3) converte as
 * tags HTML básicas para tokens internos; 4) escapa o texto comum; 5) materializa os
 * tokens em comandos LaTeX; 6) reinsere a matemática crua.
 */
export function htmlToLatex(input: string): string {
  if (!input) return "";

  // --- 1) proteger a matemática ---
  const math: string[] = [];
  // remove marcadores reservados que venham na entrada
  let s = input.replace(new RegExp(`[${OPEN}${CLOSE}]`, "g"), "");
  for (const re of MATH_PATTERNS) {
    re.lastIndex = 0;
    s = s.replace(re, (m) => {
      const tok = `${OPEN}M${math.length}${CLOSE}`;
      math.push(sanitizeMathBlock(m)); // LaTeX do usuário, com comandos perigosos neutralizados
      return tok;
    });
  }

  // --- 2) entidades ---
  s = decodeEntities(s);

  // Tokens internos para comandos LaTeX que NÃO podem ser escapados depois.
  // Usamos os mesmos marcadores PUA com prefixos distintos.
  const cmds: string[] = [];
  const cmd = (latex: string): string => {
    const tok = `${OPEN}C${cmds.length}${CLOSE}`;
    cmds.push(latex);
    return tok;
  };

  // --- 3) listas (precisam virar ambientes; tratadas antes das tags inline) ---
  // <li> ... </li> -> \item ...
  s = s.replace(/<\s*li[^>]*>/gi, () => cmd("\\item "));
  s = s.replace(/<\s*\/\s*li\s*>/gi, () => "");
  s = s.replace(/<\s*ul[^>]*>/gi, () => cmd("\\begin{itemize}"));
  s = s.replace(/<\s*\/\s*ul\s*>/gi, () => cmd("\\end{itemize}"));
  s = s.replace(/<\s*ol[^>]*>/gi, () => cmd("\\begin{enumerate}"));
  s = s.replace(/<\s*\/\s*ol\s*>/gi, () => cmd("\\end{enumerate}"));

  // --- 3b) quebras e parágrafos ---
  s = s.replace(/<\s*br\s*\/?\s*>/gi, () => cmd("\\\\"));
  s = s.replace(/<\s*\/\s*p\s*>/gi, () => cmd("\\par "));
  s = s.replace(/<\s*p[^>]*>/gi, () => "");

  // --- 3c) formatação inline: abrir com comando + chave, fechar com chave ---
  const inline: Array<[RegExp, string]> = [
    [/<\s*(?:b|strong)[^>]*>/gi, "\\textbf{"],
    [/<\s*(?:i|em)[^>]*>/gi, "\\textit{"],
    [/<\s*u[^>]*>/gi, "\\underline{"],
    [/<\s*(?:s|strike|del)[^>]*>/gi, "\\sout{"],
    [/<\s*sub[^>]*>/gi, "\\textsubscript{"],
    [/<\s*sup[^>]*>/gi, "\\textsuperscript{"],
    [/<\s*code[^>]*>/gi, "\\texttt{"],
  ];
  for (const [re, open] of inline) {
    s = s.replace(re, () => cmd(open));
  }
  // fechamento de qualquer uma dessas tags vira uma chave de fechamento
  s = s.replace(/<\s*\/\s*(?:b|strong|i|em|u|s|strike|del|sub|sup|code)\s*>/gi, () => cmd("}"));

  // --- 3d) descarta o resto das tags (ex.: <div>, <span>, <a>, <h1>...) ---
  s = s.replace(/<[^>]+>/g, " ");

  // --- 4) escapar o texto comum (sem tocar nos placeholders PUA) ---
  s = escapeLatexText(s);

  // --- 5) materializar os comandos LaTeX ---
  s = s.replace(new RegExp(`${OPEN}C(\\d+)${CLOSE}`, "g"), (_, i) => cmds[Number(i)] ?? "");

  // --- 6) reinserir a matemática crua ---
  s = s.replace(new RegExp(`${OPEN}M(\\d+)${CLOSE}`, "g"), (_, i) => math[Number(i)] ?? "");

  // normaliza espaços em branco redundantes (sem colapsar \par/\\)
  return s.replace(/[ \t]+/g, " ").trim();
}

// ======================================================================
// Montagem do documento LaTeX
// ======================================================================

const PREAMBLE = String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[brazil]{babel}
\usepackage{amsmath,amssymb}
\usepackage[a4paper,margin=2cm]{geometry}
\usepackage{tabularx}
\usepackage{longtable}
\usepackage{array}
\usepackage{booktabs}
\usepackage[normalem]{ulem}
\usepackage{enumitem}
\usepackage[table]{xcolor}
\usepackage{textcomp}
\setlength{\parindent}{0pt}
\setlength{\parskip}{4pt}
\newcommand{\correcta}{\textbf}
\begin{document}
`;

function fmtDate(raw: string): string {
  // datas vêm como 'YYYY-MM-DD HH:MM:SS' (datetime localtime). Convertemos para BR.
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(raw ?? "");
  if (!m) return escapeLatexText(raw ?? "");
  const [, y, mo, d, h, mi] = m;
  return `${d}/${mo}/${y} ${h}:${mi}`;
}

function fmtTempo(ms: number | null): string {
  if (ms == null) return "--";
  return `${(ms / 1000).toFixed(1)} s`;
}

function buildQuestionnaire(report: QuizReport): string {
  const parts: string[] = [];
  parts.push("\\section*{Questionário}");
  report.quiz.questions.forEach((q, qi) => {
    parts.push(`\\subsection*{Questão ${qi + 1}}`);
    let stem = htmlToLatex(q.text);
    if (q.image) stem += " \\textit{[imagem]}";
    parts.push(stem);
    parts.push("\\begin{itemize}[leftmargin=2em]");
    q.options.forEach((opt, oi) => {
      const body = htmlToLatex(opt);
      const letter = String.fromCharCode(65 + oi); // A, B, C...
      if (oi === q.correctIndex) {
        parts.push(`\\item[\\textbf{${letter})}] \\textbf{${body} \\quad (correta) $\\checkmark$}`);
      } else {
        parts.push(`\\item[${letter})] ${body}`);
      }
    });
    parts.push("\\end{itemize}");
    const gab = String.fromCharCode(65 + q.correctIndex);
    parts.push(`\\noindent\\textit{Gabarito: alternativa \\textbf{${gab}}.}\\par\\vspace{6pt}`);
  });
  return parts.join("\n");
}

function buildClassStats(report: QuizReport): string {
  const parts: string[] = [];
  parts.push("\\section*{Estatísticas por turma}");
  if (report.classes.length === 0) {
    parts.push("Nenhuma turma respondeu este questionário ainda.");
    return parts.join("\n");
  }
  for (const c of report.classes) {
    parts.push(
      `\\subsection*{${escapeLatexText(c.className)} \\quad \\small (${fmtDate(c.date)} — modo: ${escapeLatexText(
        c.mode
      )})}`
    );
    // longtable para aguentar muitas equipes; tabularx interno não quebra página, então
    // usamos longtable com colunas de largura fixa (p{}) para integrantes longos.
    parts.push(String.raw`\begingroup\small
\setlength{\tabcolsep}{5pt}
\renewcommand{\arraystretch}{1.3}
\begin{longtable}{@{}c >{\raggedright\arraybackslash}p{2.8cm} >{\raggedright\arraybackslash}p{4.2cm} c c c c@{}}
\toprule
\textbf{Pos.} & \textbf{Apelido/Equipe} & \textbf{Integrantes} & \textbf{Acertos} & \textbf{Precisão} & \textbf{Pontos} & \textbf{Tempo médio} \\
\midrule
\endfirsthead
\toprule
\textbf{Pos.} & \textbf{Apelido/Equipe} & \textbf{Integrantes} & \textbf{Acertos} & \textbf{Precisão} & \textbf{Pontos} & \textbf{Tempo médio} \\
\midrule
\endhead
\bottomrule
\endfoot`);
    for (const r of c.ranking) {
      const integrantes = r.integrantes.length
        ? r.integrantes.map((n) => escapeLatexText(n)).join(", ")
        : "--";
      const row = [
        String(r.posicao),
        escapeLatexText(r.nick),
        integrantes,
        `${r.acertos}/${r.respondidas}`,
        `${r.precisao}\\%`,
        String(r.pontos),
        fmtTempo(r.tempo_medio_ms),
      ].join(" & ");
      parts.push(`${row} \\\\`);
    }
    parts.push(String.raw`\end{longtable}\endgroup`);
  }
  return parts.join("\n");
}

export function buildLatexDocument(report: QuizReport): string {
  const title = htmlToLatex(report.quiz.title);
  const body = [
    `\\begin{center}{\\LARGE\\bfseries ${title}}\\end{center}`,
    "\\vspace{8pt}",
    buildQuestionnaire(report),
    "\\vspace{12pt}",
    buildClassStats(report),
  ].join("\n\n");
  return `${PREAMBLE}\n${body}\n\\end{document}\n`;
}

// ======================================================================
// Compilação
// ======================================================================

function runPdflatex(dir: string, texFile: string): Promise<{ ok: boolean; log: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      PDFLATEX_BIN,
      [
        "-interaction=nonstopmode",
        "-halt-on-error",
        "-no-shell-escape",
        `-output-directory=${dir}`,
        texFile,
      ],
      {
        cwd: dir,
        windowsHide: true,
        // Confina o I/O de arquivo do TeX ao diretório de trabalho (modo paranoico):
        // bloqueia \input/\openin de caminhos absolutos, "..", ou dot-files — defesa de
        // fundo contra leitura de arquivos do sistema, mesmo se algo escapar do blocklist.
        env: { ...process.env, openin_any: "p", openout_any: "p", shell_escape: "f" },
      }
    );

    let out = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, PDFLATEX_TIMEOUT_MS);

    child.stdout?.on("data", (d) => (out += d.toString()));
    child.stderr?.on("data", (d) => (out += d.toString()));
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, log: out || "falha ao iniciar o pdflatex" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed) resolve({ ok: false, log: "tempo de compilação excedido" });
      else resolve({ ok: code === 0, log: out });
    });
  });
}

// Serializa a geração de PDF: só 1 pdflatex por vez (evita esgotar CPU/processos com vários
// relatórios simultâneos durante a aula), com fila limitada para não acumular indefinidamente.
let pdfChain: Promise<unknown> = Promise.resolve();
let pdfQueued = 0;
const MAX_PDF_QUEUED = 4;

async function serializePdf<T>(fn: () => Promise<T>): Promise<T> {
  if (pdfQueued >= MAX_PDF_QUEUED) {
    throw new Error("Muitos PDFs sendo gerados ao mesmo tempo. Tente novamente em instantes.");
  }
  pdfQueued++;
  const prev = pdfChain;
  let release!: () => void;
  pdfChain = new Promise<void>((r) => (release = r));
  try {
    await prev.catch(() => {});
    return await fn();
  } finally {
    pdfQueued--;
    release();
  }
}

/**
 * Gera o PDF do relatório do quiz. Lança Error com mensagem curta (sem vazar caminhos
 * do sistema nem o log inteiro) caso o pdflatex falhe. Serializado (1 compilação por vez).
 */
export function generateQuizReportPdf(report: QuizReport): Promise<Buffer> {
  return serializePdf(() => generateReportPdfInternal(report));
}

async function generateReportPdfInternal(report: QuizReport): Promise<Buffer> {
  const tex = buildLatexDocument(report);
  const dir = await mkdtemp(join(tmpdir(), "quizpdf-"));
  const base = "report";
  const texPath = join(dir, `${base}.tex`);
  const pdfPath = join(dir, `${base}.pdf`);

  try {
    await writeFile(texPath, tex, "utf8");

    // Duas passadas: a primeira resolve o conteúdo, a segunda acerta longtable/refs.
    let last = await runPdflatex(dir, `${base}.tex`);
    if (last.ok) last = await runPdflatex(dir, `${base}.tex`);

    let pdf: Buffer;
    try {
      pdf = await readFile(pdfPath);
    } catch {
      // sem PDF -> compilação falhou de fato
      throw new Error(buildCompileError(last.log));
    }
    if (!last.ok && pdf.length === 0) {
      throw new Error(buildCompileError(last.log));
    }
    if (pdf.subarray(0, 4).toString("latin1") !== "%PDF") {
      throw new Error("Falha ao gerar o PDF: saída inválida do compilador.");
    }
    return pdf;
  } finally {
    // limpa todos os temporários (.aux/.log/.tex/.pdf) mesmo em erro.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Extrai as linhas de erro relevantes do log do TeX sem vazar caminhos do sistema.
function buildCompileError(log: string): string {
  const lines = (log ?? "").split(/\r?\n/);
  // linhas de erro do TeX começam com "! ".
  const errs = lines.filter((l) => l.startsWith("!")).slice(0, 3);
  if (errs.length) {
    const detail = errs.join(" ").replace(/[A-Za-z]:\\[^\s]+/g, "").slice(0, 300);
    return `Falha ao compilar o PDF (LaTeX): ${detail}`.trim();
  }
  return "Falha ao compilar o PDF (LaTeX).";
}
