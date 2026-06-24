// Guarda a "identidade" do usuário na sala para reconectar após queda (ex.: celular dorme).
// Aluno persiste em sessionStorage (sobrevive a recarregar a página).
// Professor fica só em memória (não restauramos o host após recarregar a página).

export type Membership =
  | { role: "player"; pin: string; token: string; nick: string }
  | { role: "host"; pin: string; token: string };

let mem: Membership | null = null;
const KEY = "quiz-membership";

export function setMembership(m: Membership) {
  mem = m;
  if (m.role === "player") {
    try { sessionStorage.setItem(KEY, JSON.stringify(m)); } catch { /* ignore */ }
  }
}

export function getMembership(): Membership | null {
  if (mem) return mem;
  try {
    const s = sessionStorage.getItem(KEY);
    if (s) { mem = JSON.parse(s) as Membership; return mem; }
  } catch { /* ignore */ }
  return null;
}

export function clearMembership() {
  mem = null;
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
