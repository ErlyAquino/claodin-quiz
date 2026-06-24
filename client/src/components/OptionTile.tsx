import { ANSWER_SHAPES, ANSWER_COLORS } from "./Shapes";
import { MathContent } from "./MathContent";

export type TileState = "idle" | "chosen" | "correct" | "wrong" | "muted";

export function OptionTile({
  index,
  text,
  state = "idle",
  onClick,
  disabled,
}: {
  index: number;
  text: string;
  state?: TileState;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const Shape = ANSWER_SHAPES[index];
  const color = ANSWER_COLORS[index];
  const colored = state === "idle" || state === "chosen" || state === "correct";
  // anel escuro (alto contraste sobre as cores vibrantes das alternativas)
  const border =
    state === "chosen"
      ? "4px solid var(--c-text-on-accent)"
      : state === "correct"
      ? "4px solid var(--c-success)"
      : state === "wrong"
      ? "4px solid var(--c-error)"
      : "3px solid transparent";
  // Cor da FORMA: sobre fundo colorido herda o texto sobre acento; sobre superfície
  // neutra (muted/idle não colorido) usa --c-text p/ a forma NUNCA sumir (cor+forma
  // é a estratégia de acessibilidade — alguns acentos lavam sobre a superfície clara).
  const shapeColor = colored ? "var(--c-text-on-accent)" : "var(--c-text)";

  return (
    <button
      onClick={onClick}
      disabled={disabled || !onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--sp-3)",
        width: "100%",
        minHeight: "var(--touch-min)",
        textAlign: "left",
        background: colored ? color : "var(--c-surface-2)",
        color: colored ? "var(--c-text-on-accent)" : "var(--c-text)",
        border,
        borderRadius: "var(--r-md)",
        padding: "var(--sp-4)",
        fontWeight: 700,
        fontSize: "var(--fs-md)",
        opacity: state === "muted" || state === "wrong" ? 0.55 : 1,
        cursor: onClick && !disabled ? "pointer" : "default",
        transition: "opacity var(--dur-base) var(--ease-out), border-color var(--dur-base)",
      }}
    >
      <span style={{ color: shapeColor, display: "flex" }}>
        <Shape size={24} />
      </span>
      <MathContent html={text} style={{ flex: 1, overflowWrap: "anywhere" }} />
      {state === "chosen" && <span style={{ fontSize: "var(--fs-sm)", fontWeight: 800 }}>● sua resposta</span>}
      {state === "correct" && <span style={{ fontSize: "var(--fs-lg)" }}>✓</span>}
      {state === "wrong" && <span style={{ fontSize: "var(--fs-lg)" }}>✗</span>}
    </button>
  );
}
