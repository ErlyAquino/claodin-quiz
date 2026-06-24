import { useEffect, useRef, type CSSProperties } from "react";
import { sanitizeRich } from "../lib/richText";

// Renderiza conteúdo rico do quiz com segurança:
//  1) sanitiza o HTML do usuário (remove <script>, on*, javascript:, etc.) ANTES de ir ao DOM;
//  2) deixa o MathJax converter o LaTeX (\(...\), $...$, \[...\], $$...$$) em SVG depois.
// A ordem importa: o DOMPurify nunca vê o SVG confiável do MathJax — só o conteúdo do usuário.

type MJ = {
  typesetPromise?: (els: Element[]) => Promise<void>;
  typesetClear?: (els: Element[]) => void;
  startup?: { promise?: Promise<unknown> };
};

function typeset(el: HTMLElement) {
  const mj = (window as unknown as { MathJax?: MJ }).MathJax;
  if (!mj) return;
  const run = () => mj.typesetPromise?.([el])?.catch(() => { /* LaTeX inválido não quebra a tela */ });
  if (mj.startup?.promise) mj.startup.promise.then(run).catch(() => { /* ignora */ });
  else run();
}

export function MathContent({
  html,
  className,
  style,
  block = false,
}: {
  html: string;
  className?: string;
  style?: CSSProperties;
  block?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mj = (window as unknown as { MathJax?: MJ }).MathJax;
    try { mj?.typesetClear?.([el]); } catch { /* nada a limpar */ }
    el.innerHTML = sanitizeRich(html ?? "");
    typeset(el);
  }, [html]);

  return <span ref={ref} className={className} style={block ? { display: "block", ...style } : style} />;
}
