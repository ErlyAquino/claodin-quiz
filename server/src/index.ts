import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyMultipart from "@fastify/multipart";
import { Server as SocketServer } from "socket.io";
import { setupGame } from "./game.js";
import { aiProviders, generateQuestions, type Provider } from "./ai.js";
import {
  getSessionStats,
  getSessionHostToken,
  listQuizzes,
  getQuiz,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  seedQuizIfEmpty,
  getQuizSessions,
  getQuizReport,
} from "./db.js";
import { DEMO_QUIZ, MIN_OPTIONS, MAX_OPTIONS, DEFAULT_OPTIONS, type Question, type ScoringMode } from "./quiz.js";
import { sanitizeRichHtml, hasOversizedEquation, MAX_EQUATION_LEN } from "./sanitize.js";
import { parseGift } from "./gift.js";
import { generateQuizReportPdf } from "./pdf.js";
import { checkPassword, checkToken, professorToken, isDefaultPassword } from "./auth.js";

const MAX_QUESTIONS = 100;

/** Só aceita URL http(s) ou caminho relativo; descarta data:/javascript:/blob: etc. */
function safeImage(v: any): string | undefined {
  if (!v) return undefined;
  const s = String(v).trim().slice(0, 2000);
  if (/^https?:\/\//i.test(s) || s.startsWith("/")) return s;
  return undefined;
}

/** Valida e normaliza o corpo de um quiz vindo do editor (com limites de tamanho). */
function sanitizeQuiz(body: any): { title: string; questions: Question[] } | { error: string } {
  const title = String(body?.title ?? "").trim().slice(0, 120);
  if (!title) return { error: "Dê um título ao quiz." };
  const raw = Array.isArray(body?.questions) ? body.questions : [];
  if (raw.length === 0) return { error: "Inclua ao menos 1 questão." };
  if (raw.length > MAX_QUESTIONS) return { error: `Máximo de ${MAX_QUESTIONS} questões por quiz.` };
  const questions: Question[] = [];
  for (let i = 0; i < raw.length; i++) {
    const q = raw[i];
    // HTML rico + LaTeX: corta o tamanho e sanitiza (remove <script>/on*/javascript:, preserva a matemática).
    const text = sanitizeRichHtml(String(q?.text ?? "").trim().slice(0, 5000)).trim();
    const options = Array.isArray(q?.options) ? q.options.map((o: any) => sanitizeRichHtml(String(o ?? "").trim().slice(0, 1000)).trim()) : [];
    const correctIndex = Number(q?.correctIndex);
    const timeLimitSec = Number(q?.timeLimitSec);
    const scoring: ScoringMode = q?.scoring === "lento" ? "lento" : "rapido";
    if (!text) return { error: `Questão ${i + 1}: o enunciado está vazio.` };
    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS)
      return { error: `Questão ${i + 1}: use de ${MIN_OPTIONS} a ${MAX_OPTIONS} alternativas.` };
    if (options.some((o: string) => !o)) return { error: `Questão ${i + 1}: preencha todas as alternativas.` };
    if (!(correctIndex >= 0 && correctIndex < options.length)) return { error: `Questão ${i + 1}: marque a alternativa correta.` };
    if (hasOversizedEquation(text) || options.some((o: string) => hasOversizedEquation(o)))
      return { error: `Questão ${i + 1}: equação LaTeX muito longa (máx ${MAX_EQUATION_LEN} caracteres por equação).` };
    const t = Number.isFinite(timeLimitSec) && timeLimitSec >= 5 ? Math.min(120, Math.round(timeLimitSec)) : 20;
    questions.push({ text, options, correctIndex, timeLimitSec: t, scoring, image: safeImage(q?.image) });
  }
  return { title, questions };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
// carrega o .env da raiz do projeto (ANTHROPIC_API_KEY etc.), se existir
try { process.loadEnvFile(join(__dirname, "..", "..", ".env")); } catch { /* sem .env — IA fica desligada */ }
const uploadsDir = join(__dirname, "..", "data", "uploads");
mkdirSync(uploadsDir, { recursive: true });
const PORT = Number(process.env.PORT ?? 3000);
const HOST = "0.0.0.0";

/** IPs de rede local (LAN): 10.x, 172.16–31.x, 192.168.x. */
function isPrivateLan(ip: string): boolean {
  return ip.startsWith("192.168.") || ip.startsWith("10.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

/** Descobre os IPs locais (IPv4) para o professor compartilhar com a turma. */
function localIPs(): string[] {
  const all: string[] = [];
  for (const iface of Object.values(networkInterfaces())) {
    for (const net of iface ?? []) {
      if (net.family === "IPv4" && !net.internal) all.push(net.address);
    }
  }
  // prioriza a LAN real; ignora adaptadores virtuais/públicos (ex.: loopback de túnel)
  const lan = all.filter(isPrivateLan);
  return lan.length ? lan : all;
}

// Rede de segurança: um erro inesperado num handler NÃO derruba o servidor (a aula continua).
process.on("uncaughtException", (err) => console.error("[uncaughtException]", err));
process.on("unhandledRejection", (err) => console.error("[unhandledRejection]", err));

const app = Fastify({ logger: false, bodyLimit: 256 * 1024 }); // teto de 256 KB por requisição

// Em produção, o servidor entrega o front já compilado (client/dist).
const clientDist = join(__dirname, "..", "..", "client", "dist");
if (existsSync(clientDist)) {
  await app.register(fastifyStatic, { root: clientDist });
  app.setNotFoundHandler((_req, reply) => reply.sendFile("index.html")); // SPA fallback
} else {
  app.get("/", async () => ({
    status: "ok",
    msg: "Servidor no ar. Front ainda não compilado — rode `npm run dev` (Vite) ou `npm run build`.",
  }));
}

// upload de imagem (multipart) + servir os arquivos enviados em /uploads
await app.register(fastifyMultipart, { limits: { fileSize: 4 * 1024 * 1024, files: 1 } });
await app.register(fastifyStatic, { root: uploadsDir, prefix: "/uploads/", decorateReply: false });

// MathJax servido localmente (sem CDN) a partir do pacote npm, em /mathjax/*
const mathjaxDir = join(__dirname, "..", "..", "node_modules", "mathjax");
if (existsSync(mathjaxDir)) {
  await app.register(fastifyStatic, { root: mathjaxDir, prefix: "/mathjax/", decorateReply: false });
}

app.get("/api/health", async () => ({ ok: true, online, ai: aiProviders() }));

// Informa o IP de rede (LAN) e a porta atuais, para o cliente montar o QR code de entrada
// sempre com o endereço correto. Em Docker (onde o IP do contêiner não serve), defina
// PUBLIC_HOST no .env com o IP/hostname do servidor.
app.get("/api/netinfo", async () => {
  const ips = localIPs();
  const publicHost = process.env.PUBLIC_HOST?.trim();
  return { ip: publicHost || ips[0] || "localhost", port: PORT, ips };
});

// ---- Autenticação do professor (senha única, trocável no .env) ----
// Rate-limit simples por IP no login (anti-força-bruta): após várias falhas, bloqueia com backoff.
const loginFails = new Map<string, { fails: number; until: number }>();
function loginBlocked(ip: string): boolean {
  const e = loginFails.get(ip);
  return !!e && Date.now() < e.until;
}
function noteLoginFail(ip: string): void {
  const e = loginFails.get(ip) ?? { fails: 0, until: 0 };
  e.fails++;
  if (e.fails >= 5) e.until = Date.now() + Math.min(60_000, 1000 * 2 ** (e.fails - 5)); // 1s,2s,4s… até 60s
  loginFails.set(ip, e);
}

// Login: confere a senha e devolve o token (o front guarda e envia nas rotas de professor).
app.post("/api/professor/login", async (req, reply) => {
  const ip = req.ip;
  if (loginBlocked(ip)) return reply.code(429).send({ error: "Muitas tentativas. Aguarde alguns segundos." });
  const pw = (req.body as { password?: unknown } | undefined)?.password;
  if (!checkPassword(pw)) {
    noteLoginFail(ip);
    await new Promise((r) => setTimeout(r, 300)); // pequeno atraso adicional
    return reply.code(401).send({ error: "Senha incorreta." });
  }
  loginFails.delete(ip);
  return { ok: true, token: professorToken(), defaultPassword: isDefaultPassword() };
});

// Lê o token do professor do cabeçalho (x-prof-token) ou da query (?token=).
function profTokenFrom(req: { headers: Record<string, unknown>; query?: unknown }): unknown {
  const h = req.headers["x-prof-token"];
  if (typeof h === "string") return h;
  return (req.query as { token?: unknown } | undefined)?.token;
}
// Barreira de professor: 401 se o token for inválido/ausente. Retorna true se liberado.
function requireProfessor(req: any, reply: any): boolean {
  if (checkToken(profTokenFrom(req))) return true;
  reply.code(401).send({ error: "Acesso restrito ao professor. Faça login." });
  return false;
}

// Estatísticas detalhadas da sessão (visão do professor, com nome real e notas).
// Protegida por token: só quem criou a sala (recebeu o host_token) pode ler os nomes reais.
app.get<{ Params: { id: string }; Querystring: { token?: string } }>("/api/sessions/:id/stats", async (req, reply) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return reply.code(400).send({ error: "id inválido" });
  // Fail-closed: libera só com o token do professor OU o host_token da própria sessão.
  // (Antes, sessões sem host_token ficavam abertas, vazando nomes reais.)
  const hostToken = getSessionHostToken(id);
  const ok = checkToken(profTokenFrom(req)) || (!!hostToken && req.query.token === hostToken);
  if (!ok) return reply.code(403).send({ error: "Acesso restrito ao professor." });
  return getSessionStats(id);
});

// PDF do questionário + estatísticas das turmas (contém NOMES REAIS) — só para o professor logado.
app.get<{ Params: { id: string }; Querystring: { token?: string } }>("/api/quizzes/:id/report.pdf", async (req, reply) => {
  if (!requireProfessor(req, reply)) return reply;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return reply.code(400).send({ error: "id inválido" });
  const report = getQuizReport(id);
  if (!report) return reply.code(404).send({ error: "Quiz não encontrado." });
  try {
    const pdf = await generateQuizReportPdf(report);
    const safe = report.quiz.title.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 50) || "quiz";
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="${safe}-estatisticas.pdf"`);
    return reply.send(pdf);
  } catch (e: any) {
    console.error("[report.pdf]", e?.message);
    return reply.code(500).send({ error: "Não foi possível gerar o PDF (verifique se o LaTeX/MiKTeX está disponível no servidor)." });
  }
});

// ---- Quizzes (formulários de questões salvos no servidor) — só para o professor logado ----
app.get("/api/quizzes", async (req, reply) => {
  if (!requireProfessor(req, reply)) return reply;
  return listQuizzes();
});

app.get<{ Params: { id: string } }>("/api/quizzes/:id", async (req, reply) => {
  if (!requireProfessor(req, reply)) return reply;
  const q = getQuiz(Number(req.params.id));
  return q ?? reply.code(404).send({ error: "Quiz não encontrado." });
});

app.get<{ Params: { id: string } }>("/api/quizzes/:id/sessions", async (req, reply) => {
  if (!requireProfessor(req, reply)) return reply;
  return getQuizSessions(Number(req.params.id));
});

app.post("/api/quizzes", async (req, reply) => {
  if (!requireProfessor(req, reply)) return reply;
  const r = sanitizeQuiz(req.body);
  if ("error" in r) return reply.code(400).send(r);
  return { id: createQuiz(r.title, r.questions) };
});

app.put<{ Params: { id: string } }>("/api/quizzes/:id", async (req, reply) => {
  if (!requireProfessor(req, reply)) return reply;
  const r = sanitizeQuiz(req.body);
  if ("error" in r) return reply.code(400).send(r);
  updateQuiz(Number(req.params.id), r.title, r.questions);
  return { ok: true };
});

app.delete<{ Params: { id: string } }>("/api/quizzes/:id", async (req, reply) => {
  if (!requireProfessor(req, reply)) return reply;
  deleteQuiz(Number(req.params.id));
  return { ok: true };
});

// ---- Upload de imagem para as questões ----
const IMG_EXT: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif" };
app.post("/api/upload", async (req, reply) => {
  if (!requireProfessor(req, reply)) return reply;
  try {
    const data = await (req as any).file();
    if (!data) return reply.code(400).send({ error: "Nenhum arquivo enviado." });
    const mime = String(data.mimetype || "");
    if (!mime.startsWith("image/")) return reply.code(400).send({ error: "Envie uma imagem." });
    const buf = await data.toBuffer(); // estoura se passar do limite de 4 MB
    const name = randomUUID() + (IMG_EXT[mime] ?? ".img");
    writeFileSync(join(uploadsDir, name), buf);
    return { url: "/uploads/" + name };
  } catch (e: any) {
    if (String(e?.code).includes("FILE_TOO_LARGE")) return reply.code(413).send({ error: "Imagem grande demais (máx 4 MB)." });
    return reply.code(400).send({ error: "Falha no upload da imagem." });
  }
});

// ---- Geração de perguntas por IA (Claude / ChatGPT / Gemini) ----
const PROVIDER_NAME: Record<Provider, string> = { claude: "Claude", openai: "ChatGPT", gemini: "Gemini" };
app.post("/api/generate", async (req, reply) => {
  if (!requireProfessor(req, reply)) return reply;
  const body = req.body as any;
  const provider: Provider = body?.provider === "openai" ? "openai" : body?.provider === "gemini" ? "gemini" : "claude";
  if (!aiProviders()[provider])
    return reply.code(503).send({ error: `${PROVIDER_NAME[provider]} não configurado: defina a chave no .env do servidor e reinicie.` });
  const topic = String(body?.topic ?? "").trim().slice(0, 200);
  if (!topic) return reply.code(400).send({ error: "Informe um tema." });
  const count = Math.min(20, Math.max(1, Number(body?.count) || 5));
  const difficulty = String(body?.difficulty ?? "médio");
  const scoring: ScoringMode = body?.scoring === "lento" ? "lento" : "rapido";
  const timeLimitSec = Number(body?.timeLimitSec) || 20;
  const optionCount = Math.min(MAX_OPTIONS, Math.max(MIN_OPTIONS, Number(body?.optionCount) || DEFAULT_OPTIONS));
  try {
    const questions = await generateQuestions({ provider, topic, count, difficulty, scoring, timeLimitSec, optionCount });
    if (!questions.length) return reply.code(502).send({ error: "A IA não retornou perguntas válidas. Tente de novo." });
    return { questions };
  } catch (e: any) {
    console.error("[generate]", provider, e?.status, e?.message);
    const status = e?.status ?? e?.code;
    const quota = /quota|billing|RESOURCE_EXHAUSTED|insufficient_quota/i.test(String(e?.message ?? ""));
    const msg =
      status === 401 || status === 403 ? `Chave inválida para ${PROVIDER_NAME[provider]}.`
      : status === 429 && quota ? `${PROVIDER_NAME[provider]}: sem cota/créditos nesta chave — verifique o faturamento/plano do provedor.`
      : status === 429 ? "Muitas requisições — tente em instantes."
      : `Falha ao gerar com ${PROVIDER_NAME[provider]}.`;
    return reply.code(502).send({ error: msg });
  }
});

// Importação de quiz no formato GIFT (Moodle). Devolve as questões interpretadas para o
// professor revisar no editor antes de salvar (o salvar passa pela sanitização normal).
app.post("/api/import/gift", async (req, reply) => {
  if (!requireProfessor(req, reply)) return reply;
  const body = req.body as any;
  const content = String(body?.content ?? "");
  if (!content.trim()) return reply.code(400).send({ error: "O arquivo GIFT está vazio." });
  try {
    const questions = parseGift(content);
    if (!questions.length)
      return reply.code(422).send({ error: "Nenhuma questão de múltipla escolha válida encontrada no arquivo GIFT." });
    return { questions, count: questions.length };
  } catch (e: any) {
    console.error("[import/gift]", e?.message);
    return reply.code(400).send({ error: "Não foi possível interpretar o arquivo GIFT." });
  }
});

// Semeia o quiz de demonstração se ainda não houver nenhum salvo.
seedQuizIfEmpty(DEMO_QUIZ.title, DEMO_QUIZ.questions);

// ---- Tempo real (Socket.IO) — a espinha do jogo ao vivo ----
// pingTimeout maior tolera quedas curtas de Wi-Fi sem marcar desconexão na hora.
const io = new SocketServer(app.server, { cors: { origin: true }, pingTimeout: 30000, pingInterval: 25000 });
let online = 0;

io.on("connection", (socket) => {
  online++;
  io.emit("presence", { online });
  socket.on("disconnect", () => {
    online--;
    io.emit("presence", { online });
  });
});

// motor do jogo (salas, perguntas, pontuação, ranking)
setupGame(io);

await app.listen({ port: PORT, host: HOST });

const ips = localIPs();
console.log("\n  🎮  ClaOdin-Quiz — servidor no ar");
console.log(`     local:   http://localhost:${PORT}`);
for (const ip of ips) console.log(`     rede:    http://${ip}:${PORT}   ← os alunos abrem este`);
console.log("");
