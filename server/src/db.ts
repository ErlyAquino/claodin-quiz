import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Question } from "./quiz.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? join(__dirname, "..", "data", "quiz.sqlite");
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// ---- Esquema ----
db.exec(`
CREATE TABLE IF NOT EXISTS quizzes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id        INTEGER NOT NULL,
  idx            INTEGER NOT NULL,
  text           TEXT    NOT NULL,
  image          TEXT,
  options_json   TEXT    NOT NULL,   -- JSON com as 4 alternativas
  correct_index  INTEGER NOT NULL,
  time_limit_sec INTEGER NOT NULL,
  scoring        TEXT    NOT NULL,   -- rapido | lento
  FOREIGN KEY(quiz_id) REFERENCES quizzes(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pin        TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  mode       TEXT    NOT NULL DEFAULT 'solo',
  status     TEXT    NOT NULL DEFAULT 'lobby',
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS participants (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  nick       TEXT    NOT NULL,
  score      INTEGER NOT NULL DEFAULT 0,
  joined_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS members (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL,
  first_name     TEXT    NOT NULL,
  last_name      TEXT    NOT NULL,
  FOREIGN KEY(participant_id) REFERENCES participants(id)
);

CREATE TABLE IF NOT EXISTS answers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     INTEGER NOT NULL,
  participant_id INTEGER NOT NULL,
  question_idx   INTEGER NOT NULL,
  question_text  TEXT    NOT NULL,
  chosen_index   INTEGER,
  correct        INTEGER NOT NULL,
  response_ms    INTEGER,
  points         INTEGER NOT NULL,
  answered_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(session_id)     REFERENCES sessions(id),
  FOREIGN KEY(participant_id) REFERENCES participants(id)
);
`);

// Migrações (colunas podem já existir).
try { db.exec(`ALTER TABLE sessions ADD COLUMN quiz_id INTEGER`); } catch { /* já existe */ }
try { db.exec(`ALTER TABLE sessions ADD COLUMN host_token TEXT`); } catch { /* já existe */ }
try { db.exec(`ALTER TABLE sessions ADD COLUMN class_name TEXT`); } catch { /* já existe */ }

// =================== QUIZZES (formulários de questões) ===================
const qInsertQuiz = db.prepare(`INSERT INTO quizzes (title) VALUES (?)`);
const qInsertQQ = db.prepare(`
  INSERT INTO quiz_questions (quiz_id, idx, text, image, options_json, correct_index, time_limit_sec, scoring)
  VALUES (@quiz_id, @idx, @text, @image, @options_json, @correct_index, @time_limit_sec, @scoring)
`);
const qDeleteQQ = db.prepare(`DELETE FROM quiz_questions WHERE quiz_id = ?`);
const qTouchQuiz = db.prepare(`UPDATE quizzes SET title = ?, updated_at = datetime('now','localtime') WHERE id = ?`);

function writeQuestions(quizId: number, questions: Question[]) {
  questions.forEach((q, idx) =>
    qInsertQQ.run({
      quiz_id: quizId,
      idx,
      text: q.text,
      image: q.image ?? null,
      options_json: JSON.stringify(q.options),
      correct_index: q.correctIndex,
      time_limit_sec: q.timeLimitSec,
      scoring: q.scoring,
    })
  );
}

export const createQuiz = db.transaction((title: string, questions: Question[]): number => {
  const id = Number(qInsertQuiz.run(title).lastInsertRowid);
  writeQuestions(id, questions);
  return id;
});

export const updateQuiz = db.transaction((id: number, title: string, questions: Question[]) => {
  qTouchQuiz.run(title, id);
  qDeleteQQ.run(id);
  writeQuestions(id, questions);
});

export function deleteQuiz(id: number) {
  qDeleteQQ.run(id);
  db.prepare(`DELETE FROM quizzes WHERE id = ?`).run(id);
}

export function listQuizzes() {
  return db
    .prepare(
      `SELECT q.id, q.title, q.created_at, q.updated_at,
              (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS questions
       FROM quizzes q ORDER BY q.updated_at DESC`
    )
    .all();
}

export function getQuiz(id: number): { id: number; title: string; questions: Question[] } | null {
  const row = db.prepare(`SELECT id, title FROM quizzes WHERE id = ?`).get(id) as { id: number; title: string } | undefined;
  if (!row) return null;
  const qq = db.prepare(`SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY idx`).all(id) as Array<{
    text: string; image: string | null; options_json: string; correct_index: number; time_limit_sec: number; scoring: string;
  }>;
  return {
    id: row.id,
    title: row.title,
    questions: qq.map((r) => ({
      text: r.text,
      image: r.image ?? undefined,
      options: JSON.parse(r.options_json),
      correctIndex: r.correct_index,
      timeLimitSec: r.time_limit_sec,
      scoring: r.scoring === "lento" ? "lento" : "rapido",
    })),
  };
}

/** Semeia um quiz inicial se ainda não houver nenhum. */
export function seedQuizIfEmpty(title: string, questions: Question[]) {
  const n = db.prepare(`SELECT COUNT(*) AS c FROM quizzes`).get() as { c: number };
  if (n.c === 0) createQuiz(title, questions);
}

// =================== SESSÕES / RESPOSTAS ===================
const qCreateSession = db.prepare(`INSERT INTO sessions (pin, title, mode, quiz_id, host_token) VALUES (?, ?, ?, ?, ?)`);
const qSetMode = db.prepare(`UPDATE sessions SET mode = ? WHERE id = ?`);
const qSetClass = db.prepare(`UPDATE sessions SET class_name = ? WHERE id = ?`);
const qAddParticipant = db.prepare(`INSERT INTO participants (session_id, nick) VALUES (?, ?)`);
const qAddMember = db.prepare(`INSERT INTO members (participant_id, first_name, last_name) VALUES (?, ?, ?)`);
const qSetScore = db.prepare(`UPDATE participants SET score = ? WHERE id = ?`);
const qSetStatus = db.prepare(`UPDATE sessions SET status = ? WHERE id = ?`);
const qMembersOf = db.prepare(`SELECT first_name, last_name FROM members WHERE participant_id = ?`);
const qRecordAnswer = db.prepare(`
  INSERT INTO answers
    (session_id, participant_id, question_idx, question_text, chosen_index, correct, response_ms, points)
  VALUES (@session_id, @participant_id, @question_idx, @question_text, @chosen_index, @correct, @response_ms, @points)
`);

export function createSession(pin: string, title: string, mode: string, quizId: number | null, hostToken: string): number {
  return Number(qCreateSession.run(pin, title, mode, quizId, hostToken).lastInsertRowid);
}
export function getSessionHostToken(id: number): string | null {
  const r = db.prepare(`SELECT host_token FROM sessions WHERE id = ?`).get(id) as { host_token: string | null } | undefined;
  return r?.host_token ?? null;
}
export function setSessionMode(sessionId: number, mode: string) { qSetMode.run(mode, sessionId); }
export function setSessionClass(sessionId: number, className: string) { qSetClass.run(className, sessionId); }
export function addParticipant(sessionId: number, nick: string): number { return Number(qAddParticipant.run(sessionId, nick).lastInsertRowid); }
export function addMember(participantId: number, first: string, last: string) { qAddMember.run(participantId, first, last); }
export function setScore(participantId: number, score: number) { qSetScore.run(score, participantId); }
export function setSessionStatus(sessionId: number, status: string) { qSetStatus.run(status, sessionId); }
export function recordAnswer(row: {
  session_id: number; participant_id: number; question_idx: number; question_text: string;
  chosen_index: number | null; correct: 0 | 1; response_ms: number | null; points: number;
}) { qRecordAnswer.run(row); }

// ---- Estatísticas detalhadas (visão do professor, com nomes reais) ----
export type SessionRow = {
  id: number; pin: string; title: string; mode: string; status: string;
  created_at: string; quiz_id: number | null; host_token: string | null; class_name: string | null;
};
export type RankingEntry = {
  posicao: number; nick: string; integrantes: string[]; pontos: number;
  acertos: number; respondidas: number; precisao: number; tempo_medio_ms: number | null;
};

export function getSessionStats(sessionId: number): { session: SessionRow | undefined; ranking: RankingEntry[] } {
  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as SessionRow | undefined;
  const teams = db
    .prepare(
      `SELECT p.id, p.nick, p.score,
              COALESCE(SUM(CASE WHEN a.chosen_index IS NOT NULL THEN 1 ELSE 0 END),0) AS respondidas,
              COALESCE(SUM(a.correct),0) AS acertos,
              ROUND(AVG(a.response_ms)) AS tempo_medio_ms
       FROM participants p LEFT JOIN answers a ON a.participant_id = p.id
       WHERE p.session_id = ? GROUP BY p.id ORDER BY p.score DESC`
    )
    .all(sessionId) as Array<{ id: number; nick: string; score: number; respondidas: number; acertos: number; tempo_medio_ms: number | null }>;

  return {
    session,
    ranking: teams.map((t, i) => {
      const members = qMembersOf.all(t.id) as Array<{ first_name: string; last_name: string }>;
      return {
        posicao: i + 1, nick: t.nick,
        integrantes: members.map((m) => `${m.first_name} ${m.last_name}`),
        pontos: t.score, acertos: t.acertos, respondidas: t.respondidas,
        precisao: t.respondidas ? Math.round((t.acertos / t.respondidas) * 100) : 0,
        tempo_medio_ms: t.tempo_medio_ms,
      };
    }),
  };
}

// Histórico de jogos (sessões) de um quiz.
export function getQuizSessions(quizId: number) {
  return db
    .prepare(
      `SELECT s.id, s.pin, s.mode, s.status, s.created_at,
              (SELECT COUNT(*) FROM participants p WHERE p.session_id = s.id) AS jogadores
       FROM sessions s WHERE s.quiz_id = ? ORDER BY s.created_at DESC`
    )
    .all(quizId);
}

// ---- Relatório do quiz: o questionário + as estatísticas de cada TURMA que respondeu ----
export type ClassReport = {
  sessionId: number; className: string; mode: string; status: string; date: string; ranking: RankingEntry[];
};
export type QuizReport = {
  quiz: { id: number; title: string; questions: Question[] };
  classes: ClassReport[];
};

export function getQuizReport(quizId: number): QuizReport | null {
  const quiz = getQuiz(quizId);
  if (!quiz) return null;
  const sessions = db
    .prepare(`SELECT id, class_name, mode, status, created_at FROM sessions WHERE quiz_id = ? ORDER BY created_at ASC`)
    .all(quizId) as Array<{ id: number; class_name: string | null; mode: string; status: string; created_at: string }>;

  const classes: ClassReport[] = [];
  for (const s of sessions) {
    const { ranking } = getSessionStats(s.id);
    // só inclui turmas que de fato responderam (alguém respondeu ao menos 1 questão)
    if (!ranking.some((r) => r.respondidas > 0)) continue;
    classes.push({
      sessionId: s.id,
      className: (s.class_name ?? "").trim() || "(sem nome de turma)",
      mode: s.mode,
      status: s.status,
      date: s.created_at,
      ranking,
    });
  }
  return { quiz, classes };
}
