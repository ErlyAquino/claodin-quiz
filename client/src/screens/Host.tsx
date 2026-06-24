import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { socket } from "../lib/socket";
import { setMembership } from "../lib/session";
import { OptionTile, type TileState } from "../components/OptionTile";
import { MathContent } from "../components/MathContent";
import { Leaderboard } from "../components/Leaderboard";
import { BrandLogo } from "../components/BrandLogo";
import { QRCodeSVG } from "qrcode.react";
import { getProfToken } from "../lib/auth";

type Props = { onLeave: () => void; quizId: number | null };

type Mode = "solo" | "dupla" | "grupo";
type Info = { pin: string; sessionId: number; title: string; questions: number; timeLimits: number[]; mode: Mode; hostToken: string };
type Question = { idx: number; total: number; text: string; image: string | null; options: string[]; timeMs: number; startedAt: number };
type RankEntry = { posicao: number; participantId: number; nick: string; score: number };
type Reveal = { correctIndex: number; counts: number[]; ranking: RankEntry[] };
type LBEntry = { participantId: number; nick: string; score: number };
type Stats = {
  ranking: Array<{ posicao: number; nick: string; integrantes: string[]; pontos: number; acertos: number; respondidas: number; precisao: number; tempo_medio_ms: number | null }>;
};
type Phase = "lobby" | "question" | "reveal" | "ended";
type RevealStep = "answer" | "ranking";

export function Host({ onLeave, quizId }: Props) {
  const [info, setInfo] = useState<Info | null>(null);
  const [times, setTimes] = useState<number[]>([]);
  const [className, setClassName] = useState(""); // nome da turma (vai para as estatísticas)
  const [baseUrl, setBaseUrl] = useState(window.location.origin); // URL acessível pela rede (p/ o QR)
  const [phase, setPhase] = useState<Phase>("lobby");
  const [revealStep, setRevealStep] = useState<RevealStep>("answer");
  const [players, setPlayers] = useState<Array<{ nick: string; members: number; connected: boolean }>>([]);
  const [mode, setMode] = useState<Mode>("solo");
  const [progress, setProgress] = useState({ answered: 0, total: 0 });
  const [question, setQuestion] = useState<Question | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [podium, setPodium] = useState<RankEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [boardEntries, setBoardEntries] = useState<LBEntry[]>([]);
  const created = useRef(false);
  const prevRankRef = useRef<LBEntry[]>([]);
  const hostTokenRef = useRef("");

  useEffect(() => {
    const onLobby = (l: { count: number; mode: Mode; players: Array<{ nick: string; members: number; connected: boolean }> }) => {
      setPlayers(l.players);
      if (l.mode) setMode(l.mode);
      setProgress((p) => ({ ...p, total: l.count }));
    };
    const onProgress = (p: { answered: number; total: number }) => setProgress(p);
    const onQuestion = (q: Question) => {
      setQuestion(q);
      setReveal(null);
      setRevealStep("answer");
      setPhase("question");
    };
    const onReveal = (r: Reveal) => {
      setReveal(r);
      setRevealStep("answer");
      setPhase("reveal");
    };
    const onEnded = async (e: { sessionId: number; podium: RankEntry[] }) => {
      setPodium(e.podium);
      setPhase("ended");
      try {
        const r = await fetch(`/api/sessions/${e.sessionId}/stats?token=${encodeURIComponent(hostTokenRef.current)}`);
        setStats(await r.json());
      } catch {
        /* estatística é opcional na tela; o JSON também fica em /api/sessions/:id/stats */
      }
    };
    socket.on("lobby:update", onLobby);
    socket.on("answer:progress", onProgress);
    socket.on("question:show", onQuestion);
    socket.on("question:reveal", onReveal);
    socket.on("game:ended", onEnded);

    // emite host:create DEPOIS de registrar os ouvintes (evita perder o 1º lobby:update)
    if (!created.current) {
      created.current = true;
      socket.emit("host:create", { quizId, token: getProfToken() }, (res: Info & { error?: string }) => {
        if (res?.error) { alert(res.error); onLeave(); return; }
        setInfo(res);
        setTimes(res.timeLimits ?? []);
        setMode(res.mode ?? "solo");
        hostTokenRef.current = res.hostToken ?? "";
        if (res.hostToken) setMembership({ role: "host", pin: res.pin, token: res.hostToken });
      });
    }
    return () => {
      socket.off("lobby:update", onLobby);
      socket.off("answer:progress", onProgress);
      socket.off("question:show", onQuestion);
      socket.off("question:reveal", onReveal);
      socket.off("game:ended", onEnded);
    };
  }, []);

  // contador regressivo durante a pergunta
  useEffect(() => {
    if (phase !== "question" || !question) return;
    const endAt = Date.now() + question.timeMs; // conta a partir do recebimento (sem desvio de relógio)
    const tick = () => setRemaining(Math.max(0, Math.min(question.timeMs, endAt - Date.now())));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [phase, question]);

  // tela de ranking: começa nas posições anteriores e ANIMA até as novas (transição de pontos)
  useEffect(() => {
    if (phase !== "reveal" || revealStep !== "ranking" || !reveal) return;
    const next: LBEntry[] = reveal.ranking.map((r) => ({ participantId: r.participantId, nick: r.nick, score: r.score }));
    const prev = prevRankRef.current;
    prevRankRef.current = next;
    if (prev.length) {
      setBoardEntries(prev);
      const t = setTimeout(() => setBoardEntries(next), 700);
      return () => clearTimeout(t);
    }
    setBoardEntries(next);
  }, [phase, revealStep, reveal]);

  // Descobre a URL acessível pela REDE para o QR. O professor costuma abrir em localhost,
  // mas o aluno precisa do IP da LAN — então perguntamos ao servidor (que sabe o IP/porta
  // reais). Se o professor já está acessando por um IP de rede, usamos a própria origem.
  useEffect(() => {
    const loc = window.location;
    if (!["localhost", "127.0.0.1", "::1"].includes(loc.hostname)) { setBaseUrl(loc.origin); return; }
    fetch("/api/netinfo")
      .then((r) => r.json())
      .then((d) => { if (d?.ip) setBaseUrl(`${loc.protocol}//${d.ip}:${d.port ?? loc.port}`); })
      .catch(() => { /* fica com a origem atual */ });
  }, []);
  const joinUrl = baseUrl;
  const qrUrl = info ? `${baseUrl}/?pin=${info.pin}` : baseUrl; // QR leva direto à tela de PIN preenchida
  const isLast = question ? question.idx + 1 >= question.total : false;

  function hostTileState(i: number): TileState {
    if (phase === "reveal" && reveal) return i === reveal.correctIndex ? "correct" : "muted";
    return "idle";
  }

  return (
    <div style={wrap}>
      {/* LOBBY */}
      {phase === "lobby" && (
        <div style={center}>
          <p style={{ color: "var(--c-text-muted)", margin: 0 }}>Entrem em <b style={{ color: "var(--c-cyan)" }}>{joinUrl}</b> e usem o PIN:</p>
          <div className="display" style={pinStyle}>{info?.pin ?? "…"}</div>

          {/* QR code: o aluno escaneia e cai direto na tela de PIN já preenchida (sem digitar o endereço) */}
          {info && (
            <div style={qrWrap}>
              <div style={qrBox}>
                <QRCodeSVG value={qrUrl} size={180} level="M" bgColor="#ffffff" fgColor="#0e0b1f" />
              </div>
              <span style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" }}>📱 Aponte a câmera do celular para entrar direto</span>
            </div>
          )}

          {/* nome da turma — obrigatório; vai para o arquivo de estatística desta partida */}
          <label style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)", alignItems: "center" }}>
            <span style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" }}>🏷️ Nome da turma (aparece nas estatísticas):</span>
            <input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="ex.: 3º Ano B — Manhã" maxLength={80} style={classInput} />
          </label>

          {/* modo de jogo (escolha antes dos alunos entrarem) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)", alignItems: "center" }}>
            <span style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" }}>Modo de jogo:</span>
            <div style={modeRow}>
              {(["solo", "dupla", "grupo"] as Mode[]).map((m) => (
                <button key={m} onClick={() => info && socket.emit("host:setMode", { pin: info.pin, mode: m })} style={{ ...modeBtn, ...(mode === m ? modeBtnActive : {}) }}>
                  {m === "solo" ? "🙋 Solo" : m === "dupla" ? "👯 Dupla" : "👥 Grupo"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ color: "var(--c-text-muted)" }}>👥 {players.length} {mode === "solo" ? "aluno(s)" : "equipe(s)"} na sala</div>
          <div style={playerGrid}>
            {players.map((p, i) => (
              <motion.span
                key={`${p.nick}-${i}`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                title={p.connected ? "online" : "reconectando…"}
                style={{ ...chip, opacity: p.connected ? 1 : 0.5, borderColor: p.connected ? "var(--c-border)" : "var(--c-gold)" }}
              >
                {p.connected ? "" : "⟳ "}{p.nick}{mode !== "solo" ? ` · ${p.members}` : ""}
              </motion.span>
            ))}
          </div>

          {times.length > 0 && (
            <div style={timeEditor}>
              <div style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)", marginBottom: "var(--sp-2)" }}>⏱ Tempo de cada pergunta (segundos):</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)", justifyContent: "center" }}>
                {times.map((t, i) => (
                  <label key={i} style={timeChip}>
                    <span style={{ color: "var(--c-text-muted)", fontSize: "var(--fs-xs)" }}>P{i + 1}</span>
                    <input type="number" min={5} max={120} value={t} onChange={(e) => { const v = [...times]; v[i] = Number(e.target.value) || t; setTimes(v); }} style={timeInput} />
                  </label>
                ))}
              </div>
            </div>
          )}

          <button onClick={() => info && socket.emit("host:start", { pin: info.pin, timeLimits: times, className: className.trim() })} disabled={players.length === 0 || !className.trim()} style={{ ...startBtn, opacity: (players.length === 0 || !className.trim()) ? 0.5 : 1 }}>
            ▶ Iniciar quiz
          </button>
          {players.length === 0 && <span style={{ color: "var(--c-text-faint)", fontSize: "var(--fs-xs)" }}>aguardando ao menos 1 aluno entrar…</span>}
          {players.length > 0 && !className.trim() && <span style={{ color: "var(--c-gold)", fontSize: "var(--fs-xs)" }}>dê um nome de turma para iniciar…</span>}
          <button onClick={onLeave} style={ghost}>Sair</button>
        </div>
      )}

      {/* PERGUNTA */}
      {phase === "question" && question && (
        <div style={col}>
          <div style={topRow}>
            <span style={{ color: "var(--c-gold-ink)", fontWeight: 700 }}>Pergunta {question.idx + 1} / {question.total}</span>
            <span className="display" style={{ fontSize: "var(--fs-2xl)", fontWeight: 800, color: remaining < 5000 ? "var(--c-error)" : "var(--c-cyan)" }}>
              {Math.ceil(remaining / 1000)}s
            </span>
          </div>

          {/* contadores: online + responderam */}
          <div style={statRow}>
            <span style={statPill}>👥 {progress.total} online</span>
            <span style={statPill}>✋ {progress.answered} / {progress.total} responderam</span>
          </div>

          <div style={timerTrack}>
            <div style={{ ...timerFill, width: `${(remaining / question.timeMs) * 100}%` }} />
          </div>

          <MathContent html={question.text} block className="display" style={{ fontSize: "var(--fs-2xl)", margin: 0, overflowWrap: "anywhere" }} />
          {question.image && <img src={question.image} alt="" referrerPolicy="no-referrer" style={{ maxWidth: "100%", maxHeight: 320, borderRadius: "var(--r-md)", alignSelf: "center" }} />}
          <div style={grid2}>
            {question.options.map((opt, i) => (
              <OptionTile key={i} index={i} text={opt} state="idle" />
            ))}
          </div>

          <div style={controls}>
            <button onClick={() => info && socket.emit("host:reveal", { pin: info.pin })} style={skipBtn}>
              ⏭ Pular pergunta
            </button>
          </div>
        </div>
      )}

      {/* REVELAÇÃO — passo 1: resposta correta */}
      {phase === "reveal" && reveal && revealStep === "answer" && question && (
        <div style={col}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-3)" }}>
            <span style={{ color: "var(--c-gold-ink)", fontWeight: 700 }}>Pergunta {question.idx + 1} / {question.total} · resposta correta</span>
            <BrandLogo variant="mark" maxWidth={130} />
          </div>
          <MathContent html={question.text} block className="display" style={{ fontSize: "var(--fs-2xl)", margin: 0, overflowWrap: "anywhere" }} />
          {question.image && <img src={question.image} alt="" referrerPolicy="no-referrer" style={{ maxWidth: "100%", maxHeight: 320, borderRadius: "var(--r-md)", alignSelf: "center" }} />}
          <div style={grid2}>
            {question.options.map((opt, i) => (
              <div key={i} style={{ position: "relative" }}>
                <OptionTile index={i} text={opt} state={hostTileState(i)} />
                <span style={countBadge}>{reveal.counts[i]}</span>
              </div>
            ))}
          </div>
          <PresenceBar players={players} mode={mode} />
          <div style={controls}>
            <button onClick={() => setRevealStep("ranking")} style={startBtn}>Continuar ▶</button>
          </div>
        </div>
      )}

      {/* REVELAÇÃO — passo 2: ranking animado */}
      {phase === "reveal" && reveal && revealStep === "ranking" && (
        <div style={col}>
          <div style={{ display: "flex", justifyContent: "center" }}><BrandLogo variant="mark" maxWidth={150} /></div>
          <Leaderboard title="🏁 Ranking" entries={boardEntries} />
          <PresenceBar players={players} mode={mode} />
          <div style={controls}>
            <button onClick={() => info && socket.emit("host:next", { pin: info.pin })} style={startBtn}>
              {isLast ? "🏆 Ver resultado final" : "Próxima pergunta ▶"}
            </button>
          </div>
        </div>
      )}

      {/* FIM + ESTATÍSTICAS (visão do professor) */}
      {phase === "ended" && (
        <div style={col}>
          <div style={{ display: "flex", justifyContent: "center" }}><BrandLogo variant="mark" maxWidth={200} /></div>
          <h1 className="display" style={{ fontSize: "var(--fs-2xl)", margin: 0 }}>🏆 Resultado final</h1>
          <Leaderboard title="Pódio" entries={podium.map((r) => ({ participantId: r.participantId, nick: r.nick, score: r.score }))} />

          <h2 className="display" style={{ fontSize: "var(--fs-lg)", margin: "var(--sp-3) 0 0" }}>Estatísticas (com nome real, só para você)</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>{["#", "Apelido/Equipe", "Integrantes (nomes reais)", "Pontos", "Acertos", "Precisão", "Tempo médio"].map((h) => (<th key={h} style={th}>{h}</th>))}</tr>
              </thead>
              <tbody>
                {(stats?.ranking ?? podium.map((p) => ({ posicao: p.posicao, nick: p.nick, integrantes: [] as string[], pontos: p.score, acertos: 0, respondidas: 0, precisao: 0, tempo_medio_ms: null }))).map((r) => (
                  <tr key={r.nick + r.posicao}>
                    <td style={td}>{r.posicao}</td>
                    <td style={td}>{r.nick}</td>
                    <td style={{ ...td, color: "var(--c-text)" }}><b>{r.integrantes?.join(", ") || "—"}</b></td>
                    <td style={td}>{r.pontos}</td>
                    <td style={td}>{r.acertos}</td>
                    <td style={td}>{r.precisao}%</td>
                    <td style={td}>{r.tempo_medio_ms ? `${(r.tempo_medio_ms / 1000).toFixed(1)}s` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: "var(--c-text-faint)", fontSize: "var(--fs-xs)" }}>Dados completos em <code>/api/sessions/{info?.sessionId}/stats</code> (export para nota vem na Fase 4).</p>
          <button onClick={onLeave} style={ghost}>Voltar ao início</button>
        </div>
      )}
    </div>
  );
}

// Lista de presença (online + desconectados) para o professor aguardar reconexões antes
// de avançar. Mesma identidade visual do lobby (chips com status).
function PresenceBar({ players, mode }: { players: Array<{ nick: string; members: number; connected: boolean }>; mode: Mode }) {
  if (players.length === 0) return null;
  const online = players.filter((p) => p.connected).length;
  const off = players.length - online;
  return (
    <div style={presenceWrap}>
      <div style={presenceHead}>
        <span>👥 {online} online</span>
        {off > 0 && <span style={{ color: "var(--c-gold-ink)", fontWeight: 800 }}>⟳ {off} reconectando</span>}
      </div>
      <div style={playerGrid}>
        {players.map((p, i) => (
          <span
            key={`${p.nick}-${i}`}
            title={p.connected ? "online" : "reconectando — aguarde voltar"}
            style={{
              ...chip,
              opacity: p.connected ? 1 : 0.6,
              borderColor: p.connected ? "var(--c-border)" : "var(--c-gold)",
              color: p.connected ? "var(--c-text)" : "var(--c-gold-ink)",
            }}
          >
            {p.connected ? "" : "⟳ "}{p.nick}{mode !== "solo" ? ` · ${p.members}` : ""}
          </span>
        ))}
      </div>
      {off > 0 && (
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-gold-ink)", textAlign: "center" }}>
          {off} aluno(s) desconectado(s) — espere reconectarem antes de avançar.
        </div>
      )}
    </div>
  );
}

const wrap: CSSProperties = { minHeight: "100%", display: "flex", flexDirection: "column", padding: "var(--sp-5)" };
const center: CSSProperties = { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "var(--sp-4)", textAlign: "center" };
const col: CSSProperties = { flex: 1, display: "flex", flexDirection: "column", gap: "var(--sp-4)" };
const topRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center" };
const statRow: CSSProperties = { display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" };
const statPill: CSSProperties = { background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: "var(--r-pill)", padding: "6px 14px", fontSize: "var(--fs-sm)", fontWeight: 600 };
const pinStyle: CSSProperties = { fontSize: "var(--fs-display)", fontWeight: 800, letterSpacing: "8px", color: "var(--c-violet)", lineHeight: 1 };
const classInput: CSSProperties = { width: "min(360px, 80vw)", textAlign: "center", background: "var(--c-bg-800)", border: "1px solid var(--c-border)", borderRadius: "var(--r-md)", color: "var(--c-text)", padding: "var(--sp-3)", fontSize: "var(--fs-md)", fontWeight: 600 };
const qrWrap: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--sp-2)" };
const qrBox: CSSProperties = { background: "#ffffff", padding: "var(--sp-3)", borderRadius: "var(--r-md)", lineHeight: 0, boxShadow: "var(--shadow-md)" };
const playerGrid: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "var(--sp-2)", justifyContent: "center", maxWidth: 700 };
const chip: CSSProperties = { background: "var(--c-surface-2)", border: "1px solid var(--c-border)", borderRadius: "var(--r-pill)", padding: "6px 14px", fontWeight: 600, fontSize: "var(--fs-sm)" };
const presenceWrap: CSSProperties = { display: "flex", flexDirection: "column", gap: "var(--sp-2)", background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: "var(--r-md)", padding: "var(--sp-3)", maxWidth: 700, width: "100%", alignSelf: "center" };
const presenceHead: CSSProperties = { display: "flex", gap: "var(--sp-4)", justifyContent: "center", flexWrap: "wrap", fontSize: "var(--fs-sm)", color: "var(--c-text-muted)", fontWeight: 600 };
const modeRow: CSSProperties = { display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", justifyContent: "center" };
const modeBtn: CSSProperties = { cursor: "pointer", background: "var(--c-surface)", color: "var(--c-text-muted)", border: "1px solid var(--c-border)", borderRadius: "var(--r-pill)", padding: "var(--sp-2) var(--sp-4)", fontWeight: 700, fontSize: "var(--fs-sm)" };
const modeBtnActive: CSSProperties = { background: "var(--c-violet-strong)", color: "var(--c-text-on-strong)", border: "1px solid var(--c-violet-strong)" };
const timeEditor: CSSProperties = { background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: "var(--r-md)", padding: "var(--sp-4)", maxWidth: 640 };
const timeChip: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 };
const timeInput: CSSProperties = { width: 56, textAlign: "center", background: "var(--c-bg-800)", border: "1px solid var(--c-border)", borderRadius: "var(--r-sm)", color: "var(--c-text)", padding: "6px", fontWeight: 700 };
const startBtn: CSSProperties = { cursor: "pointer", background: "var(--c-lime)", color: "var(--c-text-on-accent)", border: "none", borderRadius: "var(--r-md)", padding: "var(--sp-4) var(--sp-7)", fontWeight: 800, fontSize: "var(--fs-lg)" };
const skipBtn: CSSProperties = { cursor: "pointer", background: "var(--c-gold)", color: "var(--c-text-on-accent)", border: "none", borderRadius: "var(--r-md)", padding: "var(--sp-3) var(--sp-6)", fontWeight: 700, fontSize: "var(--fs-md)" };
const ghost: CSSProperties = { cursor: "pointer", background: "transparent", color: "var(--c-text-muted)", border: "1px solid var(--c-border)", borderRadius: "var(--r-md)", padding: "var(--sp-2) var(--sp-5)" };
const controls: CSSProperties = { display: "flex", justifyContent: "center", gap: "var(--sp-3)", marginTop: "var(--sp-2)" };
const timerTrack: CSSProperties = { height: 10, background: "var(--c-surface-2)", borderRadius: "var(--r-pill)", overflow: "hidden" };
const timerFill: CSSProperties = { height: "100%", background: "var(--c-cyan)", transition: "width 100ms linear" };
const grid2: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--sp-3)" };
const countBadge: CSSProperties = { position: "absolute", top: -8, right: -8, background: "var(--c-bg-900)", border: "1px solid var(--c-border)", borderRadius: "var(--r-pill)", padding: "2px 10px", fontSize: "var(--fs-sm)", fontWeight: 700 };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-sm)" };
const th: CSSProperties = { textAlign: "left", padding: "var(--sp-2) var(--sp-3)", color: "var(--c-text-muted)", borderBottom: "1px solid var(--c-border)", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "var(--sp-2) var(--sp-3)", borderBottom: "1px solid var(--c-border)", color: "var(--c-text-muted)" };
