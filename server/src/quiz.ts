export type ScoringMode = "rapido" | "lento";

// SEGURANÇA: `text` e `options` contêm HTML rico + LaTeX vindos do usuário (editor, IA,
// import GIFT). São sanitizados no servidor (sanitizeRichHtml), mas a matemática é mantida
// crua de propósito (exports PDF/DOCX precisam do LaTeX original). Portanto, ao EXIBIR esses
// campos num navegador, SEMPRE renderize via MathContent/sanitizeRich (client) — nunca jogue
// direto em innerHTML/dangerouslySetInnerHTML. Qualquer novo consumidor de render deve sanitizar.
export type Question = {
  text: string;
  image?: string;
  options: string[]; // de 2 a 10 alternativas
  correctIndex: number;
  timeLimitSec: number; // tempo-limite da questão (segundos)
  scoring: ScoringMode; // como pontua: rápido (tempo conta) ou lento (pontuação fixa)
};

export const QUESTION_TIME_MS = 20_000; // fallback caso a questão não defina tempo
export const BASE_POINTS = 1000;

// Limites de alternativas por pergunta (2 a 10).
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 10;
export const DEFAULT_OPTIONS = 4;

// Quiz de demonstração — é semeado no banco na primeira execução (pode ser editado/excluído depois).
export const DEMO_QUIZ: { title: string; questions: Question[] } = {
  title: "Quiz de demonstração",
  questions: [
    { text: "Qual é a capital da Austrália?", options: ["Sydney", "Melbourne", "Camberra", "Perth"], correctIndex: 2, timeLimitSec: 20, scoring: "rapido" },
    { text: "Quantos lados tem um hexágono?", options: ["5", "6", "7", "8"], correctIndex: 1, timeLimitSec: 25, scoring: "rapido" },
    { text: "Qual planeta é conhecido como Planeta Vermelho?", options: ["Vênus", "Júpiter", "Marte", "Saturno"], correctIndex: 2, timeLimitSec: 15, scoring: "lento" },
    { text: "Quem pintou a Mona Lisa?", options: ["Van Gogh", "Da Vinci", "Picasso", "Michelangelo"], correctIndex: 1, timeLimitSec: 20, scoring: "rapido" },
    { text: "Qual é o resultado de 7 × 8?", options: ["54", "56", "58", "64"], correctIndex: 1, timeLimitSec: 30, scoring: "lento" },
  ],
};

/**
 * Pontuação por questão (escolhida pelo professor):
 *  - "rapido": acerto + rapidez → 1000 (instantâneo) a 500 (no limite do tempo).
 *  - "lento":  acerto vale a pontuação cheia, independente do tempo.
 */
export function computePoints(correct: boolean, elapsedMs: number, timeMs: number, scoring: ScoringMode): number {
  if (!correct) return 0;
  if (scoring === "lento") return BASE_POINTS;
  const frac = Math.min(1, Math.max(0, elapsedMs / timeMs));
  return Math.round(BASE_POINTS * (1 - 0.5 * frac));
}
