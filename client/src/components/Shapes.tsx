// As formas das alternativas (até 10) — cor + forma para reconhecimento rápido e acessível.
// Herdam a cor via `fill="currentColor"`; o container define a cor pelo token.

import type { ReactNode } from "react";

type Props = { size?: number; className?: string };

function box(size: number, className: string | undefined, children: ReactNode) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

export function Triangle({ size = 24, className }: Props) {
  return box(size, className, <polygon points="12,3 22,21 2,21" fill="currentColor" />);
}
export function Diamond({ size = 24, className }: Props) {
  return box(size, className, <polygon points="12,2 22,12 12,22 2,12" fill="currentColor" />);
}
export function Circle({ size = 24, className }: Props) {
  return box(size, className, <circle cx="12" cy="12" r="10" fill="currentColor" />);
}
export function Square({ size = 24, className }: Props) {
  return box(size, className, <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" />);
}
export function Star({ size = 24, className }: Props) {
  return box(size, className, <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="currentColor" />);
}
export function Moon({ size = 24, className }: Props) {
  return box(size, className, <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor" />);
}
export function Sun({ size = 24, className }: Props) {
  return box(
    size,
    className,
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="4.22" x2="19.78" y2="5.64" />
    </g>
  );
}
export function Heart({ size = 24, className }: Props) {
  return box(size, className, <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor" />);
}
export function Hexagon({ size = 24, className }: Props) {
  return box(size, className, <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="currentColor" />);
}
export function Bolt({ size = 24, className }: Props) {
  return box(size, className, <polygon points="13,2 3,14 11,14 9,22 21,9 13,9" fill="currentColor" />);
}

export const ANSWER_SHAPES = [Triangle, Diamond, Circle, Square, Star, Moon, Sun, Heart, Hexagon, Bolt];
export const ANSWER_COLORS = [
  "var(--c-answer-1)",
  "var(--c-answer-2)",
  "var(--c-answer-3)",
  "var(--c-answer-4)",
  "var(--c-answer-5)",
  "var(--c-answer-6)",
  "var(--c-answer-7)",
  "var(--c-answer-8)",
  "var(--c-answer-9)",
  "var(--c-answer-10)",
];

// Limites de alternativas por pergunta (fonte única no cliente).
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = ANSWER_SHAPES.length; // 10
