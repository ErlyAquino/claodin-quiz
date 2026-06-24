import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { MIN_OPTIONS, MAX_OPTIONS, DEFAULT_OPTIONS } from "./quiz.js";
import type { Question, ScoringMode } from "./quiz.js";

export type Provider = "claude" | "openai" | "gemini";

// Modelo padrão de cada provedor (trocável por env).
// Lido por requisição (não no import), pois o .env só carrega depois deste módulo.
function modelFor(p: Provider): string {
  if (p === "claude") return process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
  if (p === "openai") return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  return process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
}

function hasKey(p: Provider): boolean {
  if (p === "claude") return !!process.env.ANTHROPIC_API_KEY;
  if (p === "openai") return !!process.env.OPENAI_API_KEY;
  return !!process.env.GEMINI_API_KEY;
}

/** Quais provedores de IA estão configurados (têm chave). */
export function aiProviders(): Record<Provider, boolean> {
  return { claude: hasKey("claude"), openai: hasKey("openai"), gemini: hasKey("gemini") };
}
export function aiAvailable(): boolean {
  return hasKey("claude") || hasKey("openai") || hasKey("gemini");
}

// Clientes preguiçosos (chave lida em tempo de requisição, após o .env carregar).
let _anthropic: Anthropic | null = null;
let _openai: OpenAI | null = null;
let _gemini: GoogleGenAI | null = null;
const anthropic = () => (_anthropic ??= new Anthropic());
const openai = () => (_openai ??= new OpenAI());
const gemini = () => (_gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));

// Esquema (Claude usa tool use; OpenAI/Gemini recebem a forma no prompt + modo JSON).
function toolSchema(optionCount: number) {
  return {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "Enunciado claro e factual." },
            options: {
              type: "array",
              items: { type: "string" },
              minItems: optionCount,
              maxItems: optionCount,
              description: `Exatamente ${optionCount} alternativas curtas.`,
            },
            correctIndex: { type: "integer", description: `Índice (0 a ${optionCount - 1}) da alternativa correta.` },
          },
          required: ["text", "options", "correctIndex"],
          additionalProperties: false,
        },
      },
    },
    required: ["questions"],
    additionalProperties: false,
  };
}

function prompts(topic: string, count: number, difficulty: string, optionCount: number) {
  const example = `["${Array.from({ length: optionCount }, (_, i) => String.fromCharCode(97 + i)).join('","')}"]`;
  const system =
    "Você cria quizzes escolares em português do Brasil. Gere perguntas de múltipla escolha factuais, " +
    `claras e adequadas à sala de aula, cada uma com EXATAMENTE ${optionCount} alternativas curtas e apenas UMA correta. ` +
    "Varie a posição da alternativa correta. Evite ambiguidade, pegadinhas e perguntas de opinião.";
  const user =
    `Tema: "${topic}". Nível: ${difficulty}. Gere ${count} perguntas, cada uma com ${optionCount} alternativas.\n` +
    `Responda APENAS com um JSON válido, sem texto fora dele, no formato: ` +
    `{"questions":[{"text":"enunciado","options":${example},"correctIndex":0}]} ` +
    `(correctIndex é o índice 0–${optionCount - 1} da alternativa correta).`;
  return { system, user };
}

async function rawClaude(system: string, user: string, optionCount: number): Promise<any[]> {
  const resp = await anthropic().messages.create({
    model: modelFor("claude"),
    max_tokens: 16000,
    system,
    tools: [{ name: "save_questions", description: "Salva as perguntas geradas do quiz.", input_schema: toolSchema(optionCount), strict: true } as any],
    tool_choice: { type: "tool", name: "save_questions" },
    messages: [{ role: "user", content: user }],
  });
  const tu = resp.content.find((b) => b.type === "tool_use");
  const data: any = (tu && "input" in tu ? tu.input : {}) ?? {};
  return Array.isArray(data.questions) ? data.questions : [];
}

async function rawOpenAI(system: string, user: string): Promise<any[]> {
  const r = await openai().chat.completions.create({
    model: modelFor("openai"),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const data = JSON.parse(r.choices[0]?.message?.content ?? "{}");
  return Array.isArray(data.questions) ? data.questions : [];
}

async function rawGemini(system: string, user: string): Promise<any[]> {
  const r = await gemini().models.generateContent({
    model: modelFor("gemini"),
    contents: user,
    config: { systemInstruction: system, responseMimeType: "application/json" } as any,
  });
  const text = typeof (r as any).text === "function" ? (r as any).text() : (r as any).text;
  const data = JSON.parse(text ?? "{}");
  return Array.isArray(data.questions) ? data.questions : [];
}

export async function generateQuestions(opts: {
  provider: Provider;
  topic: string;
  count: number;
  difficulty: string;
  scoring: ScoringMode;
  timeLimitSec: number;
  optionCount?: number;
}): Promise<Question[]> {
  if (!hasKey(opts.provider)) throw new Error("NO_KEY");
  const count = Math.min(20, Math.max(1, Math.round(opts.count || 5)));
  const optionCount = Math.min(MAX_OPTIONS, Math.max(MIN_OPTIONS, Math.round(opts.optionCount || DEFAULT_OPTIONS)));
  const difficulty = ["fácil", "médio", "difícil"].includes(opts.difficulty) ? opts.difficulty : "médio";
  const { system, user } = prompts(opts.topic, count, difficulty, optionCount);

  const raw =
    opts.provider === "claude" ? await rawClaude(system, user, optionCount)
    : opts.provider === "openai" ? await rawOpenAI(system, user)
    : await rawGemini(system, user);

  const scoring: ScoringMode = opts.scoring === "lento" ? "lento" : "rapido";
  const time = Number.isFinite(opts.timeLimitSec) && opts.timeLimitSec >= 5 ? Math.min(120, Math.round(opts.timeLimitSec)) : 20;

  return raw
    .slice(0, count)
    .map((q): Question => {
      let options = Array.isArray(q?.options) ? q.options.map((o: any) => String(o ?? "").trim().slice(0, 200)) : [];
      while (options.length < optionCount) options.push("");
      options = options.slice(0, optionCount);
      let ci = Number(q?.correctIndex);
      if (!(ci >= 0 && ci < optionCount)) ci = 0;
      return { text: String(q?.text ?? "").trim().slice(0, 500), options, correctIndex: ci, timeLimitSec: time, scoring };
    })
    .filter((q) => q.text && q.options.every((o) => o));
}
