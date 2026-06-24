import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ============================================================
   Leaderboard — placar animado "Neo-Arcade"
   Mostra APENAS apelido (nick) + pontuação + posição.
   Reordena suavemente com framer-motion `layout`, indica
   subida/descida e destaca o líder. Tudo via design tokens.
   ============================================================ */

export type LeaderboardEntry = {
  participantId: number;
  nick: string;
  score: number;
};

type Direction = "up" | "down" | "same" | "new";

type Row = LeaderboardEntry & {
  rank: number; // posição 1-based
  prevRank: number | null; // posição na renderização anterior
  direction: Direction;
};

function rankBadge(direction: Direction) {
  // Selo de movimento: ▲ verde (subiu), ▼ vermelho (desceu), – estável.
  if (direction === "up") return { glyph: "▲", color: "var(--c-success)" };
  if (direction === "down") return { glyph: "▼", color: "var(--c-error)" };
  if (direction === "new") return { glyph: "•", color: "var(--c-cyan)" };
  return { glyph: "–", color: "var(--c-text-faint)" };
}

export function Leaderboard({
  entries,
  max = 8,
  title,
}: {
  entries: LeaderboardEntry[];
  max?: number;
  title?: string;
}) {
  // Posições da renderização ANTERIOR, por participantId → para detectar
  // quem subiu/desceu/ultrapassou entre rodadas.
  const prevRanksRef = useRef<Map<number, number>>(new Map());
  // Marca a primeira renderização para disparar o stagger de entrada uma vez.
  const firstRenderRef = useRef(true);
  const isFirstRender = firstRenderRef.current;

  // Ordena por score desc (desempate estável por participantId) e corta no top `max`.
  const sorted = [...entries]
    .sort((a, b) => b.score - a.score || a.participantId - b.participantId)
    .slice(0, Math.max(0, max));

  // Maior score visível → base para a largura proporcional da barra.
  const topScore = sorted.length ? Math.max(...sorted.map((e) => e.score), 0) : 0;

  const prevRanks = prevRanksRef.current;
  const rows: Row[] = sorted.map((entry, i) => {
    const rank = i + 1;
    const prev = prevRanks.has(entry.participantId)
      ? (prevRanks.get(entry.participantId) as number)
      : null;
    let direction: Direction;
    if (prev == null) direction = isFirstRender ? "same" : "new";
    else if (rank < prev) direction = "up";
    else if (rank > prev) direction = "down";
    else direction = "same";
    return { ...entry, rank, prevRank: prev, direction };
  });

  // Atualiza o snapshot de posições para a PRÓXIMA renderização.
  const nextRanks = new Map<number, number>();
  rows.forEach((r) => nextRanks.set(r.participantId, r.rank));
  prevRanksRef.current = nextRanks;
  firstRenderRef.current = false;

  return (
    <section
      aria-label={title ?? "Placar"}
      style={{
        width: "100%",
        maxWidth: "var(--container-max)",
        margin: "0 auto",
        fontFamily: "var(--font-body)",
        color: "var(--c-text)",
      }}
    >
      {title && (
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: "var(--fw-black)" as unknown as number,
            fontSize: "var(--fs-2xl)",
            lineHeight: "var(--lh-tight)" as unknown as number,
            color: "var(--c-text)",
            margin: 0,
            marginBottom: "var(--sp-5)",
            textAlign: "center",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h2>
      )}

      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-3)",
        }}
      >
        <AnimatePresence initial={false}>
          {rows.map((row, i) => {
            const isLeader = row.rank === 1;
            const badge = rankBadge(row.direction);
            const moved = row.direction === "up" || row.direction === "down";
            const barPct =
              topScore > 0 ? Math.max(4, (row.score / topScore) * 100) : 4;
            const accent = isLeader ? "var(--c-gold-ink)" : "var(--c-violet)";

            return (
              <motion.li
                key={row.participantId}
                layout
                /* Entrada em cascata (stagger) só na 1ª render; depois, entrada de novos. */
                initial={{
                  opacity: 0,
                  y: 16,
                  scale: 0.96,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  /* Realce breve de quem SUBIU de posição (brilho dourado pulsante). */
                  boxShadow:
                    row.direction === "up"
                      ? [
                          "var(--shadow-sm)",
                          "0 0 0 3px var(--c-success), var(--shadow-md)",
                          "var(--shadow-sm)",
                        ]
                      : "var(--shadow-sm)",
                }}
                exit={{ opacity: 0, y: -16, scale: 0.96 }}
                transition={{
                  layout: { type: "spring", stiffness: 520, damping: 38 },
                  opacity: { duration: 0.22 },
                  scale: { duration: 0.22 },
                  /* Stagger: cada linha entra um pouco depois da anterior. */
                  delay: isFirstRender ? i * 0.06 : 0,
                  boxShadow: { duration: 0.6, ease: "easeOut" },
                }}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--sp-3)",
                  minHeight: "var(--touch-min)",
                  padding: "var(--sp-3) var(--sp-4)",
                  borderRadius: "var(--r-lg)",
                  background: isLeader
                    ? "linear-gradient(90deg, var(--c-surface-2), var(--c-surface))"
                    : "var(--c-surface)",
                  border: `2px solid ${
                    isLeader ? "var(--c-gold)" : "var(--c-border)"
                  }`,
                  boxShadow: "var(--shadow-sm)",
                  overflow: "hidden",
                }}
              >
                {/* Trilho de fundo + barra de score proporcional (camada de fundo). */}
                <motion.div
                  aria-hidden="true"
                  layout="position"
                  initial={false}
                  animate={{ width: `${barPct}%` }}
                  transition={{ duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    background: isLeader
                      ? "linear-gradient(90deg, var(--c-tint-leader-strong), var(--c-tint-leader-soft))"
                      : "linear-gradient(90deg, var(--c-tint-rank-strong), var(--c-tint-rank-soft))",
                    pointerEvents: "none",
                  }}
                />

                {/* Posição (rank) */}
                <span
                  style={{
                    position: "relative",
                    zIndex: 1,
                    flex: "0 0 auto",
                    width: "var(--sp-7)",
                    height: "var(--sp-7)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "var(--r-pill)",
                    background: isLeader ? "var(--c-gold)" : "var(--c-surface-2)",
                    color: isLeader ? "var(--c-text-on-accent)" : "var(--c-text)",
                    fontFamily: "var(--font-display)",
                    fontWeight: "var(--fw-black)" as unknown as number,
                    fontSize: "var(--fs-lg)",
                    boxShadow: isLeader ? "var(--glow-violet)" : "none",
                  }}
                >
                  {isLeader ? "👑" : row.rank}
                </span>

                {/* Apelido (nick) — truncado se longo. NUNCA nome real. */}
                <span
                  title={row.nick}
                  style={{
                    position: "relative",
                    zIndex: 1,
                    flex: "1 1 auto",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontWeight: "var(--fw-bold)" as unknown as number,
                    fontSize: "var(--fs-lg)",
                    color: "var(--c-text)",
                  }}
                >
                  {row.nick}
                </span>

                {/* Selo de movimento ▲/▼/– */}
                <motion.span
                  aria-hidden="true"
                  key={`${row.participantId}-${row.direction}`}
                  initial={moved ? { scale: 0.4, opacity: 0 } : false}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
                  style={{
                    position: "relative",
                    zIndex: 1,
                    flex: "0 0 auto",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "var(--sp-5)",
                    fontSize: "var(--fs-sm)",
                    fontWeight: "var(--fw-bold)" as unknown as number,
                    color: badge.color,
                  }}
                >
                  {badge.glyph}
                </motion.span>

                {/* Pontuação — anima quando muda. */}
                <motion.span
                  layout="position"
                  style={{
                    position: "relative",
                    zIndex: 1,
                    flex: "0 0 auto",
                    minWidth: "var(--sp-9)",
                    textAlign: "right",
                    fontFamily: "var(--font-display)",
                    fontWeight: "var(--fw-black)" as unknown as number,
                    fontSize: "var(--fs-xl)",
                    fontVariantNumeric: "tabular-nums",
                    color: accent,
                  }}
                >
                  {Math.round(row.score).toLocaleString("pt-BR")}
                </motion.span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>

      {/* Estado vazio. */}
      {rows.length === 0 && (
        <p
          style={{
            textAlign: "center",
            color: "var(--c-text-faint)",
            fontSize: "var(--fs-md)",
            padding: "var(--sp-6)",
            margin: 0,
          }}
        >
          Aguardando jogadores…
        </p>
      )}
    </section>
  );
}
