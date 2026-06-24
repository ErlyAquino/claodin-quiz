import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { socket } from "../lib/socket";
import { OptionTile, type TileState } from "../components/OptionTile";
import { MathContent } from "../components/MathContent";
import { BrandLogo } from "../components/BrandLogo";

type Props = { nick: string; onLeave: () => void };

type Question = { idx: number; total: number; text: string; image: string | null; options: string[]; timeMs: number; startedAt: number };
type Result = { correct: boolean; chosen: number | null; roundPoints: number; score: number; rank: number; total: number };
type Reveal = { correctIndex: number; counts: number[]; ranking: Array<{ posicao: number; nick: string; score: number }> };

type Phase = "waiting" | "question" | "reveal" | "ended";

export function StudentGame({ nick, onLeave }: Props) {
  const [phase, setPhase] = useState<Phase>("waiting");
  const [question, setQuestion] = useState<Question | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [podium, setPodium] = useState<Reveal["ranking"]>([]);
  const [remaining, setRemaining] = useState(0);
  const chosenRef = useRef<number | null>(null);

  useEffect(() => {
    const onQuestion = (q: Question) => {
      setQuestion(q);
      setChosen(null);
      chosenRef.current = null;
      setResult(null);
      setReveal(null);
      setPhase("question");
    };
    const onResult = (r: Result) => setResult(r);
    // ao reconectar numa pergunta já respondida, restaura a escolha
    const onAnswered = (a: { index: number }) => { setChosen(a.index); chosenRef.current = a.index; };
    const onReveal = (r: Reveal) => {
      setReveal(r);
      setPhase("reveal");
    };
    const onEnded = (e: { podium: Reveal["ranking"] }) => {
      setPodium(e.podium);
      setPhase("ended");
    };
    socket.on("question:show", onQuestion);
    socket.on("player:result", onResult);
    socket.on("player:answered", onAnswered);
    socket.on("question:reveal", onReveal);
    socket.on("game:ended", onEnded);
    return () => {
      socket.off("question:show", onQuestion);
      socket.off("player:result", onResult);
      socket.off("player:answered", onAnswered);
      socket.off("question:reveal", onReveal);
      socket.off("game:ended", onEnded);
    };
  }, []);

  // contador regressivo
  useEffect(() => {
    if (phase !== "question" || !question) return;
    // conta a partir do RECEBIMENTO no próprio aparelho — evita desvio de relógio entre máquinas
    const endAt = Date.now() + question.timeMs;
    const tick = () => setRemaining(Math.max(0, Math.min(question.timeMs, endAt - Date.now())));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [phase, question]);

  function choose(i: number) {
    if (phase !== "question" || chosenRef.current !== null) return;
    chosenRef.current = i;
    setChosen(i);
    socket.emit("player:answer", { index: i });
  }

  function tileState(i: number): TileState {
    if (phase === "reveal" && reveal) {
      if (i === reveal.correctIndex) return "correct";
      if (i === chosen) return "wrong";
      return "muted";
    }
    if (chosen === null) return "idle";
    return i === chosen ? "chosen" : "muted";
  }

  return (
    <div style={wrap}>
      {/* cabeçalho */}
      <div style={header}>
        <span style={{ fontWeight: 700 }}>{nick}</span>
        <span style={{ color: "var(--c-text-muted)", fontSize: "var(--fs-sm)" }}>
          {result ? `${result.score} pts` : phase === "question" && question ? `Pergunta ${question.idx + 1}/${question.total}` : ""}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {/* AGUARDANDO */}
        {phase === "waiting" && (
          <motion.div key="wait" {...fade} style={center}>
            <BrandLogo variant="mark" maxWidth={220} />
            <div style={{ fontSize: 48 }}>✅</div>
            <h2 className="display" style={{ margin: 0 }}>Você está dentro!</h2>
            <p style={{ color: "var(--c-text-muted)" }}>Aguardando o professor começar…</p>
          </motion.div>
        )}

        {/* PERGUNTA */}
        {phase === "question" && question && (
          <motion.div key="q" {...fade} style={col}>
            <div style={timerTrack}>
              <div style={{ ...timerFill, width: `${(remaining / question.timeMs) * 100}%` }} />
            </div>
            <MathContent html={question.text} block className="display" style={{ fontSize: "var(--fs-xl)", margin: "var(--sp-2) 0", overflowWrap: "anywhere" }} />
            {question.image && <img src={question.image} alt="" referrerPolicy="no-referrer" style={{ maxWidth: "100%", borderRadius: "var(--r-md)" }} />}
            <div style={grid}>
              {question.options.map((opt, i) => (
                <OptionTile key={i} index={i} text={opt} state={tileState(i)} onClick={chosen === null ? () => choose(i) : undefined} />
              ))}
            </div>
            {chosen !== null && <p style={{ color: "var(--c-text-muted)", marginTop: "var(--sp-2)" }}>Resposta enviada — aguarde a revelação…</p>}
          </motion.div>
        )}

        {/* REVELAÇÃO */}
        {phase === "reveal" && reveal && (
          <motion.div key="r" {...fade} style={col}>
            <div
              style={{
                ...resultBanner,
                background: result?.correct ? "var(--c-success)" : "var(--c-error)",
              }}
            >
              <span style={{ fontSize: 40 }}>{result?.correct ? "🎉" : "😕"}</span>
              <div>
                <div className="display" style={{ fontSize: "var(--fs-xl)", fontWeight: 800 }}>
                  {result?.correct ? "Você acertou!" : chosen === null ? "Você não respondeu" : "Você errou"}
                </div>
                {result?.correct && <div>+{result.roundPoints} pontos</div>}
              </div>
            </div>

            <div style={grid}>
              {question?.options.map((opt, i) => (
                <OptionTile key={i} index={i} text={opt} state={tileState(i)} />
              ))}
            </div>

            {result && (
              <div style={rankRow}>
                <span>Você está em <b>{result.rank}º</b> de {result.total}</span>
                <span>{result.score} pts</span>
              </div>
            )}

            <MiniRanking ranking={reveal.ranking} meNick={nick} />
          </motion.div>
        )}

        {/* FIM */}
        {phase === "ended" && (
          <motion.div key="e" {...fade} style={center}>
            <div style={{ fontSize: 48 }}>🏆</div>
            <h2 className="display" style={{ margin: 0 }}>Fim do quiz!</h2>
            <MiniRanking ranking={podium} meNick={nick} />
            <button onClick={onLeave} style={leaveBtn}>Sair</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MiniRanking({ ranking, meNick }: { ranking: Reveal["ranking"]; meNick: string }) {
  return (
    <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
      {ranking.slice(0, 5).map((r) => (
        <div
          key={r.nick + r.posicao}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "var(--sp-2) var(--sp-3)",
            borderRadius: "var(--r-sm)",
            background: r.nick === meNick ? "var(--c-surface-2)" : "transparent",
            border: r.nick === meNick ? "1px solid var(--c-violet)" : "1px solid transparent",
          }}
        >
          <span>{r.posicao}º · {r.nick}</span>
          <span style={{ color: "var(--c-text-muted)" }}>{r.score}</span>
        </div>
      ))}
    </div>
  );
}

const fade = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.25 },
};

const wrap: CSSProperties = { minHeight: "100%", display: "flex", flexDirection: "column", padding: "var(--sp-4)", gap: "var(--sp-3)" };
const header: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center" };
const center: CSSProperties = { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "var(--sp-3)", textAlign: "center" };
const col: CSSProperties = { flex: 1, display: "flex", flexDirection: "column", gap: "var(--sp-3)" };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr", gap: "var(--sp-3)" };
const timerTrack: CSSProperties = { height: 8, background: "var(--c-surface-2)", borderRadius: "var(--r-pill)", overflow: "hidden" };
const timerFill: CSSProperties = { height: "100%", background: "var(--c-cyan)", transition: "width 100ms linear" };
const resultBanner: CSSProperties = { display: "flex", alignItems: "center", gap: "var(--sp-3)", color: "var(--c-text-on-state)", padding: "var(--sp-4)", borderRadius: "var(--r-md)", fontWeight: 700 };
const rankRow: CSSProperties = { display: "flex", justifyContent: "space-between", padding: "var(--sp-3)", background: "var(--c-surface)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)" };
const leaveBtn: CSSProperties = { cursor: "pointer", background: "transparent", color: "var(--c-text-muted)", border: "1px solid var(--c-border)", borderRadius: "var(--r-md)", padding: "var(--sp-3) var(--sp-5)" };
