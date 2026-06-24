import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Autenticação do PROFESSOR — uma senha única (compartilhada), trocável no .env.
// Objetivo: impedir que alunos entrem na área do professor e vejam os quizzes e os gabaritos.
//
// A senha vem de PROFESSOR_PASSWORD no .env; se não houver, usa um PADRÃO ("professor").
// O login devolve um TOKEN = hash(SEGREDO_DO_SERVIDOR + senha). O segredo é aleatório e fica
// só no servidor (arquivo em data/, fora do git), então o token NÃO pode ser computado por um
// aluno mesmo que ele saiba a senha — ele precisa passar pelo login (que tem rate-limit).

const DEFAULT_PASSWORD = "professor";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SECRET_FILE = join(__dirname, "..", "data", ".prof-secret");

let _secret: string | null = null;
// Segredo do servidor: lido de PROF_SECRET, ou de um arquivo persistido, ou gerado e salvo.
function serverSecret(): string {
  if (_secret) return _secret;
  const fromEnv = (process.env.PROF_SECRET ?? "").trim();
  if (fromEnv) return (_secret = fromEnv);
  try {
    if (existsSync(SECRET_FILE)) {
      const s = readFileSync(SECRET_FILE, "utf8").trim();
      if (s) return (_secret = s);
    }
    mkdirSync(dirname(SECRET_FILE), { recursive: true });
    _secret = randomBytes(32).toString("hex");
    writeFileSync(SECRET_FILE, _secret, "utf8");
    return _secret;
  } catch {
    // sem persistência possível: usa um por-processo (o token muda a cada restart, mas funciona)
    return (_secret = randomBytes(32).toString("hex"));
  }
}

export function professorPassword(): string {
  const p = (process.env.PROFESSOR_PASSWORD ?? "").trim();
  return p || DEFAULT_PASSWORD;
}

export function isDefaultPassword(): boolean {
  return professorPassword() === DEFAULT_PASSWORD;
}

export function professorToken(): string {
  return createHash("sha256").update(serverSecret() + "::professor::" + professorPassword()).digest("hex").slice(0, 40);
}

export function checkPassword(pw: unknown): boolean {
  return typeof pw === "string" && pw === professorPassword();
}

export function checkToken(token: unknown): boolean {
  return typeof token === "string" && token.length > 0 && token === professorToken();
}
