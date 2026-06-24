import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  addMember,
  addParticipant,
  createSession,
  getQuiz,
  recordAnswer,
  setScore,
  setSessionMode,
  setSessionClass,
  setSessionStatus,
} from "./db.js";
import { persistSessionStats } from "./stats.js";
import { checkToken } from "./auth.js";
import {
  DEMO_QUIZ,
  QUESTION_TIME_MS,
  computePoints,
  type Question,
} from "./quiz.js";

type Member = { firstName: string; lastName: string };
type GameMode = "solo" | "dupla" | "grupo";

type Player = {
  participantId: number;
  socketId: string; // socket atual (muda ao reconectar)
  token: string;    // identidade estável para reconexão
  connected: boolean;
  nick: string;         // apelido (solo) ou nome da equipe (dupla/grupo)
  members: Member[];    // integrantes reais (1 no solo)
  score: number;
  answer?: { index: number; ms: number };
  lastPoints?: number;
};

type Phase = "lobby" | "question" | "reveal" | "ended";
type RankRow = { posicao: number; participantId: number; nick: string; score: number };

type Room = {
  pin: string;
  sessionId: number;
  title: string;
  mode: GameMode;
  questions: Question[];
  phase: Phase;
  currentIdx: number;
  qStartedAt: number;
  players: Map<number, Player>; // por participantId (sobrevive à troca de socket)
  hostSocketId: string;
  hostToken: string;
  timer?: NodeJS.Timeout;
  cleanupTimer?: NodeJS.Timeout;
  timeMsList: number[];
  lastReveal?: { correctIndex: number; counts: number[]; ranking: RankRow[] };
};

const GROUP_MAX = 5;
const PLAYER_CAP = 300;

function membersValid(mode: GameMode, n: number): boolean {
  if (mode === "solo") return n === 1;
  if (mode === "dupla") return n === 2;
  return n >= 2 && n <= GROUP_MAX; // grupo
}

function defaultTimeMs(q: Question): number {
  return q.timeLimitSec ? q.timeLimitSec * 1000 : QUESTION_TIME_MS;
}

const rooms = new Map<string, Room>();

function newPin(): string {
  let pin: string;
  do {
    pin = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(pin));
  return pin;
}

/** Jogadores atualmente conectados. */
function conn(room: Room): Player[] {
  return [...room.players.values()].filter((p) => p.connected);
}

function ranking(room: Room): RankRow[] {
  return [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ posicao: i + 1, participantId: p.participantId, nick: p.nick, score: p.score }));
}

function lobby(room: Room) {
  // só apelidos/nomes de equipe vão para a sala (nomes reais ficam só nas estatísticas do professor).
  // envia TODOS os jogadores com o status de conexão, para o professor ver quem está reconectando.
  return {
    count: conn(room).length,
    total: room.players.size,
    mode: room.mode,
    players: [...room.players.values()].map((p) => ({ nick: p.nick, members: p.members.length, connected: p.connected })),
  };
}

export function setupGame(io: Server) {
  const emitProgress = (room: Room) => {
    const cs = conn(room);
    io.to(room.pin).emit("answer:progress", { answered: cs.filter((p) => p.answer).length, total: cs.length });
  };

  const emitPlayerResult = (room: Room, p: Player, rk: RankRow[]) => {
    const q = room.questions[room.currentIdx];
    const correct = p.answer ? p.answer.index === q.correctIndex : false;
    const pos = rk.find((r) => r.participantId === p.participantId)?.posicao ?? rk.length;
    io.to(p.socketId).emit("player:result", {
      correct,
      chosen: p.answer ? p.answer.index : null,
      roundPoints: p.lastPoints ?? 0,
      score: p.score,
      rank: pos,
      total: conn(room).length,
    });
  };

  const sendQuestion = (room: Room, idx: number) => {
    room.currentIdx = idx;
    room.phase = "question";
    room.qStartedAt = Date.now();
    room.lastReveal = undefined;
    room.players.forEach((p) => (p.answer = undefined));
    const q = room.questions[idx];
    const timeMs = room.timeMsList[idx] ?? defaultTimeMs(q);
    io.to(room.pin).emit("question:show", {
      idx,
      total: room.questions.length,
      text: q.text,
      image: q.image ?? null,
      options: q.options,
      timeMs,
      startedAt: room.qStartedAt,
    });
    emitProgress(room);
    clearTimeout(room.timer);
    room.timer = setTimeout(() => revealQuestion(room), timeMs);
  };

  const revealQuestion = (room: Room) => {
    if (room.phase !== "question") return; // evita reveal duplicado
    clearTimeout(room.timer);
    room.timer = undefined;
    room.phase = "reveal";
    const q = room.questions[room.currentIdx];
    const timeMs = room.timeMsList[room.currentIdx] ?? defaultTimeMs(q);

    room.players.forEach((p) => {
      const ans = p.answer;
      const correct = ans ? ans.index === q.correctIndex : false;
      const ms = ans ? ans.ms : null;
      const points = computePoints(correct, ms ?? timeMs, timeMs, q.scoring);
      p.score += points;
      p.lastPoints = points;
      recordAnswer({
        session_id: room.sessionId,
        participant_id: p.participantId,
        question_idx: room.currentIdx,
        question_text: q.text,
        chosen_index: ans ? ans.index : null,
        correct: correct ? 1 : 0,
        response_ms: ms,
        points,
      });
      setScore(p.participantId, p.score);
    });

    const rk = ranking(room);
    const counts = new Array(q.options.length).fill(0);
    room.players.forEach((p) => {
      if (p.answer && p.answer.index < counts.length) counts[p.answer.index]++;
    });
    room.lastReveal = { correctIndex: q.correctIndex, counts, ranking: rk };

    io.to(room.pin).emit("question:reveal", room.lastReveal);
    room.players.forEach((p) => emitPlayerResult(room, p, rk));
    // sem auto-avanço: aguarda "host:next".
  };

  const advance = (room: Room) => {
    if (room.phase !== "reveal") return;
    clearTimeout(room.timer);
    room.timer = undefined;
    const next = room.currentIdx + 1;
    if (next >= room.questions.length) endGame(room);
    else sendQuestion(room, next);
  };

  const endGame = (room: Room) => {
    clearTimeout(room.timer);
    room.timer = undefined;
    room.phase = "ended";
    setSessionStatus(room.sessionId, "ended");
    persistSessionStats(room.sessionId); // salva o arquivo de estatística da turma no servidor
    io.to(room.pin).emit("game:ended", { sessionId: room.sessionId, podium: ranking(room) });
    room.cleanupTimer = setTimeout(() => rooms.delete(room.pin), 120_000);
  };

  /** Reenvia o estado atual para um socket que (re)entrou, restaurando a tela. */
  const sendSnapshot = (room: Room, sid: string, player?: Player) => {
    if (room.phase === "question" || room.phase === "reveal") {
      const q = room.questions[room.currentIdx];
      const timeMs = room.timeMsList[room.currentIdx] ?? defaultTimeMs(q);
      io.to(sid).emit("question:show", {
        idx: room.currentIdx,
        total: room.questions.length,
        text: q.text,
        image: q.image ?? null,
        options: q.options,
        timeMs,
        startedAt: room.qStartedAt,
      });
      if (player?.answer) io.to(sid).emit("player:answered", { index: player.answer.index });
      if (room.phase === "reveal" && room.lastReveal) {
        io.to(sid).emit("question:reveal", room.lastReveal);
        if (player) emitPlayerResult(room, player, room.lastReveal.ranking);
      }
    } else if (room.phase === "ended") {
      io.to(sid).emit("game:ended", { sessionId: room.sessionId, podium: ranking(room) });
    } else {
      io.to(sid).emit("lobby:update", lobby(room));
    }
  };

  io.on("connection", (socket: Socket) => {
    // ---- Professor cria a sala ----
    socket.on("host:create", (payload: { quizId?: number; token?: string } | undefined, cb?: (r: unknown) => void) => {
      if (!checkToken(payload?.token)) return cb?.({ error: "Acesso restrito ao professor. Faça login." });
      const quiz = payload?.quizId ? getQuiz(Number(payload.quizId)) : null;
      const title = quiz?.title ?? DEMO_QUIZ.title;
      const questions: Question[] = quiz?.questions?.length ? quiz.questions : DEMO_QUIZ.questions;
      const pin = newPin();
      const hostToken = randomUUID();
      const sessionId = createSession(pin, title, "solo", quiz?.id ?? null, hostToken);
      const room: Room = {
        pin, sessionId, title, mode: "solo", questions,
        phase: "lobby", currentIdx: -1, qStartedAt: 0,
        players: new Map(), hostSocketId: socket.id, hostToken,
        timeMsList: questions.map(defaultTimeMs),
      };
      rooms.set(pin, room);
      socket.join(pin);
      socket.data.pin = pin;
      socket.data.role = "host";
      const timeLimits = questions.map((q) => (q.timeLimitSec ? q.timeLimitSec : QUESTION_TIME_MS / 1000));
      cb?.({ pin, sessionId, title, questions: questions.length, timeLimits, mode: room.mode, hostToken });
    });

    // ---- Professor reconecta (volta para a mesma sala) ----
    socket.on("host:rejoin", ({ pin, hostToken }: { pin: string; hostToken: string }, cb?: (r: unknown) => void) => {
      const room = rooms.get(pin);
      if (!room || room.hostToken !== hostToken) return cb?.({ error: "Sessão não encontrada." });
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = undefined;
      room.hostSocketId = socket.id;
      socket.join(pin);
      socket.data.pin = pin;
      socket.data.role = "host";
      cb?.({ ok: true, mode: room.mode });
      sendSnapshot(room, socket.id);
    });

    socket.on("host:setMode", ({ pin, mode }: { pin: string; mode: GameMode }) => {
      const room = rooms.get(pin);
      if (!room || socket.id !== room.hostSocketId || room.phase !== "lobby") return;
      if (mode !== "solo" && mode !== "dupla" && mode !== "grupo") return;
      room.mode = mode;
      setSessionMode(room.sessionId, mode);
      io.to(pin).emit("room:mode", { mode });
    });

    socket.on("host:start", ({ pin, timeLimits, className }: { pin: string; timeLimits?: number[]; className?: string }) => {
      const room = rooms.get(pin);
      if (!room || socket.id !== room.hostSocketId || room.phase !== "lobby") return;
      const turma = String(className ?? "").trim().slice(0, 80);
      if (turma) setSessionClass(room.sessionId, turma);
      room.timeMsList = room.questions.map((q, idx) => {
        const sec = timeLimits?.[idx];
        return typeof sec === "number" && sec > 0 ? sec * 1000 : defaultTimeMs(q);
      });
      sendQuestion(room, 0);
    });

    socket.on("host:reveal", ({ pin }: { pin: string }) => {
      const room = rooms.get(pin);
      if (!room || socket.id !== room.hostSocketId || room.phase !== "question") return;
      revealQuestion(room);
    });

    socket.on("host:next", ({ pin }: { pin: string }) => {
      const room = rooms.get(pin);
      if (!room || socket.id !== room.hostSocketId || room.phase !== "reveal") return;
      advance(room);
    });

    // ---- Aluno espia o modo da sala ----
    socket.on("player:peek", ({ pin }: { pin: string }, cb?: (r: unknown) => void) => {
      const room = rooms.get(pin);
      if (!room) return cb?.({ error: "Sala não encontrada. Confira o PIN." });
      if (room.phase !== "lobby") return cb?.({ error: "O quiz já começou." });
      cb?.({ ok: true, mode: room.mode, title: room.title });
    });

    // ---- Aluno/equipe entra ----
    socket.on(
      "player:join",
      ({ pin, nick, members }: { pin: string; nick: string; members: Member[] }, cb?: (r: unknown) => void) => {
        const room = rooms.get(pin);
        if (!room) return cb?.({ error: "Sala não encontrada. Confira o PIN." });
        if (room.phase !== "lobby") return cb?.({ error: "O quiz já começou." });
        if (socket.data.participantId != null) return cb?.({ error: "Você já entrou nesta sala." });
        if (room.players.size >= PLAYER_CAP) return cb?.({ error: "Sala cheia." });
        const cleanNick = (nick ?? "").trim().slice(0, 40);
        if (!cleanNick) return cb?.({ error: room.mode === "solo" ? "Escolha um apelido." : "Dê um nome à equipe." });

        const clean = (members ?? [])
          .slice(0, GROUP_MAX)
          .map((m) => ({ firstName: (m?.firstName ?? "").trim().slice(0, 40), lastName: (m?.lastName ?? "").trim().slice(0, 40) }))
          .filter((m) => m.firstName && m.lastName);
        if (!membersValid(room.mode, clean.length)) {
          const msg =
            room.mode === "solo" ? "Preencha seu nome e sobrenome."
            : room.mode === "dupla" ? "A dupla precisa de exatamente 2 integrantes (nome e sobrenome)."
            : `O grupo precisa de 2 a ${GROUP_MAX} integrantes (nome e sobrenome).`;
          return cb?.({ error: msg });
        }

        const participantId = addParticipant(room.sessionId, cleanNick);
        clean.forEach((m) => addMember(participantId, m.firstName, m.lastName));
        const token = randomUUID();
        room.players.set(participantId, { participantId, socketId: socket.id, token, connected: true, nick: cleanNick, members: clean, score: 0 });
        socket.join(pin);
        socket.data.pin = pin;
        socket.data.role = "player";
        socket.data.participantId = participantId;
        cb?.({ ok: true, participantId, token, title: room.title, phase: room.phase });
        io.to(pin).emit("lobby:update", lobby(room));
      }
    );

    // ---- Aluno reconecta (volta na mesma pergunta) ----
    socket.on("player:rejoin", ({ pin, token }: { pin: string; token: string }, cb?: (r: unknown) => void) => {
      const room = rooms.get(pin);
      if (!room) return cb?.({ error: "Sala não encontrada." });
      const player = [...room.players.values()].find((p) => p.token === token);
      if (!player) return cb?.({ error: "Sessão expirada. Entre novamente." });
      player.socketId = socket.id;
      player.connected = true;
      socket.join(pin);
      socket.data.pin = pin;
      socket.data.role = "player";
      socket.data.participantId = player.participantId;
      cb?.({ ok: true, nick: player.nick });
      io.to(pin).emit("lobby:update", lobby(room));
      emitProgress(room);
      sendSnapshot(room, socket.id, player);
    });

    // ---- Aluno responde ----
    socket.on("player:answer", ({ index }: { index: number }) => {
      const pin = socket.data.pin as string | undefined;
      if (!pin) return;
      const room = rooms.get(pin);
      if (!room || room.phase !== "question") return;
      const pid = socket.data.participantId as number | undefined;
      const player = pid != null ? room.players.get(pid) : undefined;
      if (!player || player.answer) return;
      const optionCount = room.questions[room.currentIdx]?.options.length ?? 0;
      if (!Number.isInteger(index) || index < 0 || index >= optionCount) return;
      player.answer = { index, ms: Date.now() - room.qStartedAt };

      const cs = conn(room);
      emitProgress(room);
      if (cs.length > 0 && cs.every((p) => p.answer)) revealQuestion(room);
    });

    socket.on("disconnect", () => {
      const pin = socket.data.pin as string | undefined;
      if (!pin) return;
      const room = rooms.get(pin);
      if (!room) return;
      if (socket.id === room.hostSocketId) {
        // professor caiu: 5 min para reconectar antes de liberar a sala
        room.cleanupTimer = setTimeout(() => rooms.delete(pin), 300_000);
        return;
      }
      const pid = socket.data.participantId as number | undefined;
      const player = pid != null ? room.players.get(pid) : undefined;
      if (!player || player.socketId !== socket.id) return; // socket antigo (já reconectou)
      // NUNCA remove o jogador (nem no lobby): mantém para a reconexão sem precisar logar de novo.
      player.connected = false;
      io.to(pin).emit("lobby:update", lobby(room));
      if (room.phase !== "lobby") {
        emitProgress(room);
        const cs = conn(room);
        if (room.phase === "question" && cs.length > 0 && cs.every((p) => p.answer)) revealQuestion(room);
      }
    });
  });
}
