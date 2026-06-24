import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getSessionStats } from "./db.js";

// Persiste no servidor local um arquivo de estatística por sessão (turma), com o nome da
// turma, os apelidos, os nomes reais dos alunos, acertos e pontuações.

const __dirname = dirname(fileURLToPath(import.meta.url));
export const statsDir = join(__dirname, "..", "data", "stats");

function safeName(s: string): string {
  return s.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60) || "turma";
}

/** Salva o arquivo JSON de estatística desta sessão. Retorna o caminho (ou null em falha). */
export function persistSessionStats(sessionId: number): string | null {
  try {
    const { session, ranking } = getSessionStats(sessionId);
    if (!session) return null;
    mkdirSync(statsDir, { recursive: true });
    const turma = (session.class_name ?? "").trim() || null;
    const data = {
      sessionId,
      quizId: session.quiz_id,
      quizTitle: session.title,
      turma,
      modo: session.mode,
      data: session.created_at,
      gerado_em: new Date().toISOString(),
      resultados: ranking.map((r) => ({
        posicao: r.posicao,
        apelido: r.nick,
        integrantes: r.integrantes, // nomes reais
        acertos: r.acertos,
        respondidas: r.respondidas,
        precisao_pct: r.precisao,
        pontos: r.pontos,
        tempo_medio_ms: r.tempo_medio_ms,
      })),
    };
    const file = join(statsDir, `sessao-${sessionId}-${safeName(turma ?? "turma")}.json`);
    writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
    return file;
  } catch (e) {
    console.error("[stats] falha ao salvar arquivo de estatística", e);
    return null;
  }
}
