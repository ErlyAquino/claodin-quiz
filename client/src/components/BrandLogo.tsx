import type { CSSProperties } from "react";

// Logo da marca "ClaOdin-Quiz" — arte fornecida, recolorida para o tema "Neo-Arcade"
// via DUAS MÁSCARAS CSS (linhas → var(--c-cyan), acentos → var(--c-gold)). Como a cor
// sai dos tokens, acompanha claro/escuro; o brilho "neon" vem de filter: drop-shadow.
// As máscaras são PNGs alpha leves geradas a partir da arte (frias→ciano, quentes→ouro).
//
// Duas variantes:
//   • "full" (padrão) → escudo + corvo + runas + wordmark "ClaOdin" + "Quiz" + tagline.
//                       Quadro ~1:1. Uso: tela de entrada / destaque.   (~0,26 MB)
//   • "mark"          → escudo + "ClaOdin" + "Quiz" (sem a tagline). Mais largo
//                       que alto. Uso: telas compactas, cabeçalhos, ícone.  (~0,16 MB)
//
// Layout: um <img> invisível (a máscara ciano da variante) serve de ESPAÇADOR — dá ao
// quadro o tamanho/aspecto intrínseco e a largura responsiva (replaced element). Sem
// isso, um div de filhos absolutos com width:100% colapsaria para 0 em pai sem largura.

type Variant = "full" | "mark";

type Props = {
  /** largura máxima do logo em px (o quadro escala 100% até esse teto). */
  maxWidth?: number;
  /** full = marca completa (com tagline) · mark = escudo + "ClaOdin" (compacto). */
  variant?: Variant;
  className?: string;
};

const ASSETS: Record<Variant, { cyan: string; gold: string; label: string }> = {
  full: { cyan: "/logo-cyan.png", gold: "/logo-gold.png", label: "ClaOdin-Quiz — Meu local de conhecimento" },
  mark: { cyan: "/logo-mark-cyan.png", gold: "/logo-mark-gold.png", label: "ClaOdin-Quiz" },
};

// base comum das duas camadas mascaradas (preenchem o quadro do espaçador)
const layer: CSSProperties = {
  position: "absolute",
  inset: 0,
  maskSize: "contain",
  WebkitMaskSize: "contain",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskPosition: "center",
};

export function BrandLogo({ maxWidth = 400, variant = "full", className }: Props = {}) {
  const a = ASSETS[variant];
  return (
    <div
      role="img"
      aria-label={a.label}
      className={className}
      style={{ position: "relative", display: "inline-block", maxWidth, lineHeight: 0 }}
    >
      {/* espaçador invisível: define o tamanho/aspecto e a largura responsiva do quadro */}
      <img
        src={a.cyan}
        alt=""
        aria-hidden="true"
        style={{ display: "block", width: "auto", maxWidth: "100%", height: "auto", visibility: "hidden" }}
      />
      {/* camada de linhas (corvo/escudo/runas/wordmark) em ciano */}
      <span
        aria-hidden="true"
        style={{
          ...layer,
          background: "var(--c-cyan)",
          WebkitMaskImage: `url(${a.cyan})`,
          maskImage: `url(${a.cyan})`,
          filter: "drop-shadow(0 0 6px var(--c-cyan))",
        }}
      />
      {/* camada de acentos (circuito + "Quiz" na variante full) em dourado */}
      <span
        aria-hidden="true"
        style={{
          ...layer,
          background: "var(--c-gold)",
          WebkitMaskImage: `url(${a.gold})`,
          maskImage: `url(${a.gold})`,
          filter: "drop-shadow(0 0 4px var(--c-gold))",
        }}
      />
    </div>
  );
}

export default BrandLogo;
