// Autenticação do professor no cliente: guarda o token do login e o envia nas rotas protegidas.

const KEY = "quiz-prof-token";

export function getProfToken(): string {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}
export function setProfToken(t: string): void {
  try { localStorage.setItem(KEY, t); } catch { /* sem persistência, ok */ }
}
export function clearProfToken(): void {
  try { localStorage.removeItem(KEY); } catch { /* ok */ }
}
export function isProfLoggedIn(): boolean {
  return !!getProfToken();
}

/** Cabeçalho a anexar nas requisições de professor. */
export function authHeaders(): Record<string, string> {
  const t = getProfToken();
  return t ? { "x-prof-token": t } : {};
}

/** Faz login com a senha; em caso de sucesso, guarda o token. */
export async function professorLogin(password: string): Promise<{ ok: boolean; defaultPassword?: boolean; error?: string }> {
  try {
    const r = await fetch("/api/professor/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d?.token) {
      setProfToken(d.token);
      return { ok: true, defaultPassword: !!d.defaultPassword };
    }
    return { ok: false, error: d?.error ?? "Senha incorreta." };
  } catch {
    return { ok: false, error: "Falha de conexão com o servidor." };
  }
}
