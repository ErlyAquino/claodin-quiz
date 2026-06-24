// Logo da escola — ETE / Escola Técnica Estadual "EPITÁCIO PESSOA".
// Recolorido para o tema "Neo-Arcade" (escuro): crachá em superfície escura com borda
// violeta da marca, "ETE" branco, barras nas cores da paleta e "EPITÁCIO PESSOA" claro.
// Usa os design tokens (var(--c-...)) para manter coerência com o resto do app.
//
// >> Para usar o ARQUIVO OFICIAL (PNG) em vez desta versão vetorial:
//    1. salve o arquivo em  client/public/logo-escola.png
//    2. troque <EteLogo /> por:
//       <img src="/logo-escola.png" alt="ETE — Escola Técnica Estadual Epitácio Pessoa"
//            style={{ width: "100%", maxWidth: 220, display: "block" }} />

function EteLogo({ maxWidth = 220 }: { maxWidth?: number }) {
  return (
    <svg
      viewBox="0 0 400 240"
      role="img"
      aria-label="ETE — Escola Técnica Estadual Epitácio Pessoa"
      style={{ width: "100%", maxWidth, height: "auto", display: "block" }}
    >
      {/* crachá (superfície escura + borda violeta da marca) */}
      <rect x="80" y="20" width="240" height="150" rx="46" fill="var(--c-surface)" stroke="var(--c-violet)" strokeWidth="2.5" />

      {/* barras coloridas — esquerda (cores da paleta) */}
      <rect x="60" y="53" width="24" height="24" rx="9" fill="var(--c-gold)" />
      <rect x="60" y="83" width="24" height="24" rx="9" fill="var(--c-lime)" />
      <rect x="60" y="113" width="24" height="24" rx="9" fill="var(--c-coral)" />
      {/* barras coloridas — direita */}
      <rect x="316" y="53" width="24" height="24" rx="9" fill="var(--c-gold)" />
      <rect x="316" y="83" width="24" height="24" rx="9" fill="var(--c-lime)" />
      <rect x="316" y="113" width="24" height="24" rx="9" fill="var(--c-coral)" />

      {/* ETE */}
      <text
        x="200"
        y="110"
        textAnchor="middle"
        fontFamily="'Arial Black', Arial, sans-serif"
        fontWeight={900}
        fontSize="76"
        letterSpacing="-2"
        fill="var(--c-text)"
      >
        ETE
      </text>
      {/* subtítulo dentro do crachá */}
      <text
        x="200"
        y="150"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontWeight={700}
        fontSize="14"
        letterSpacing="1.5"
        fill="var(--c-text-muted)"
      >
        ESCOLA TÉCNICA ESTADUAL
      </text>

      {/* nome da escola */}
      <text
        x="200"
        y="218"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontWeight={800}
        fontSize="29"
        letterSpacing="3"
        fill="var(--c-text)"
      >
        EPITÁCIO PESSOA
      </text>
    </svg>
  );
}

export function SchoolLogo({ maxWidth = 220 }: { maxWidth?: number } = {}) {
  return (
    <div style={{ display: "inline-flex", justifyContent: "center", maxWidth: "92vw" }}>
      <EteLogo maxWidth={maxWidth} />
    </div>
  );
}
