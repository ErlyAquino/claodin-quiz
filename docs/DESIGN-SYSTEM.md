# Sistema de Design — "Neo-Arcade Edu"

Identidade visual do framework de quizzes. **Tudo aqui é dono do `design-director`.**
A implementação dos valores vive em [`client/src/styles/tokens.css`](../client/src/styles/tokens.css) — esta é a fonte única da verdade. Nenhuma cor, fonte, espaço ou duração deve ser escrita "na mão" fora dos tokens.

## Vibe
Energia de game show / arcade para prender a atenção, mas limpo e altamente legível — funciona no projetor da sala (16:9) e no celular do aluno (retrato) com os mesmos tokens.

## Tipografia
- **Display** (`--font-display`): títulos, perguntas, números grandes. Forte e geométrica.
- **Corpo** (`--font-body`): textos, alternativas, listas. Neutra e legível.
- Pergunta no projetor usa `--fs-display`; no celular, `--fs-xl/2xl`.

## Cor
- Canvas **escuro** (`--c-bg-*`) com superfícies elevadas (`--c-surface*`).
- Acentos vibrantes para energia: violeta (marca), ciano, lima, coral, ouro.
- **Contraste**: texto sempre ≥ WCAG AA (4.5:1 normal · 3:1 grande). Cor nunca é o único sinal.

### Texto sobre acento — qual token usar
Um acento pode ser um fundo **claro** (lima, ouro, alternativas) ou **escuro** (violeta de
preenchimento, banners de estado), e a luminância de alguns inverte entre os temas. Por isso há
**três tokens de texto-sobre-acento**, cada um casado com um tipo de fundo:

| Token | Use sobre | Valor escuro / claro |
|---|---|---|
| `--c-text-on-accent` | acento **claro** — lima, ouro (`--c-gold` fundo), alternativas, pill do líder | escuro / escuro |
| `--c-text-on-strong` | **preenchimento violeta** (`--c-violet-strong`): botões primários, modo ativo, toolbar | branco / branco |
| `--c-text-on-state`  | **banners de estado** (sucesso/erro) e o check da alternativa correta | escuro (dark) / branco (light) |

Regra: nunca pinte texto escuro sobre fundo escuro nem branco sobre fundo claro. Escolha o token
pelo **tipo de fundo**, não pela cor literal.

### Acento como TEXTO vs. como FUNDO
- **Como fundo claro** (botão ouro, chip do líder): `--c-gold` é claro o bastante p/ texto escuro.
- **Como texto sobre superfície** (rótulos "Pergunta N", contadores de reconexão): use
  `--c-gold-ink` — um ouro mais fechado que passa AA sobre branco. (No tema escuro, `--c-gold-ink`
  é igual ao `--c-gold` vibrante, pois lá ele já lê bem sobre o canvas escuro.)
- `--c-cyan`, `--c-coral`, `--c-success`, `--c-error`, `--c-violet` no tema claro já são
  aprofundados o suficiente para servir de **texto sobre branco** (todos ≥ 4.5:1).

### Marca: dois violetas
- `--c-violet` — violeta da **marca**: PIN, título "Arcade", bordas, foco. Não é fundo de texto.
- `--c-violet-strong` — violeta de **preenchimento de botão**, calibrado p/ texto branco passar AA
  nos dois temas (escuro 4.92:1, claro 7.9:1). Visualmente idêntico à marca.

### Véu, glow e tintas (tokenizados, adaptam ao tema)
Nada de `rgba()` solto nos componentes. Derivados de tokens via `color-mix`:
- `--c-veil` — scrim do overlay de desconexão (claro: scrim escuro leve; escuro: quase-preto).
- `--glow-cyan-ring`, `--glow-dot` — anéis/brilhos suaves (mais discretos no claro).
- `--c-tint-{leader,rank}-{strong,soft}` — barras translúcidas do placar (ouro/violeta).

## As 4 alternativas (assinatura do produto)
Cada alternativa = **cor + forma**, nunca só cor (acessibilidade e reconhecimento rápido):

| # | Cor token | Forma |
|---|-----------|-------|
| 1 | `--c-answer-1` (coral)  | triângulo |
| 2 | `--c-answer-2` (ciano)  | losango   |
| 3 | `--c-answer-3` (ouro)   | círculo   |
| 4 | `--c-answer-4` (lima)   | quadrado  |

## Espaçamento, raio e camadas
- **Espaçamento**: use só a escala `--sp-1..9`. Sem números mágicos.
- **Raio**: `--r-sm..xl` + `--r-pill`. Botões e cartões bem arredondados.
- **Camadas (z-index)**: escala `--z-*` única e ordenada (conteúdo < sticky < overlay < modal < toast < confetti). Isso evita sobreposição acidental — o `design-reviewer` reprova quem furar a escala.

## Movimento
- Durações `--dur-*` + easings `--ease-out`/`--ease-bounce`. Sempre com propósito (contador, lock da resposta, pop do placar, confete no pódio).
- Respeitar `prefers-reduced-motion` (já tratado nos tokens).

## Estados visuais a cobrir
Lobby/entrada · aguardando jogadores · pergunta ativa · contagem regressiva · resposta travada · revelação (acerto/erro) · placar/ranking · pódio final · telas vazias e de erro.

## Marca — "ClaOdin-Quiz"
Identidade nórdica (Odin / corvo) + runas + neon, dentro do "Neo-Arcade Edu". Componente:
[`client/src/components/ClaOdinLogo.tsx`](../client/src/components/ClaOdinLogo.tsx) — SVG line-art,
sem cor hardcoded (reusa tokens existentes; **nenhum token novo foi necessário**).

- **Cores**: emblema e "ClaOdin" em `--c-cyan`; "-Quiz" e acentos quentes (olhos do corvo,
  íris do "O", nós de circuito) em `--c-gold`; nós secundários em `--c-violet`. O **neon** é
  `filter: drop-shadow(... var(--c-cyan|--c-gold))` — o glow herda a cor do token, então adapta
  ao tema (escuro/claro) sem retoque.
- **Composição**: emblema (escudo + corvo de asas abertas + anel de runas + acentos de circuito)
  → wordmark `ClaOdin` (ciano) + `-Quiz` (ouro, itálico) com o **"O" estilizado** (anel com
  olho/runa de íris ouro) → tagline em duas linhas (`MEU LOCAL DE CONHECIMENTO` / `QUIZZES
  LOCALIZADOS & EDUCATIVOS`).
- **Runas**: desenhadas como FORMA (paths angulares), nunca fonte externa. São decorativas
  (`aria-hidden`); o significado fica no `aria-label="ClaOdin-Quiz"` do SVG.
- **Props**: `variant` (`full` = emblema+wordmark+tagline · `compact` = sem tagline),
  `maxWidth`, `showTagline` (override), `className`.
- **Trocar por PNG oficial**: salvar em `client/public/logo-claodin.png` e usar `<img>` (instruções
  no topo do componente, mesmo padrão do `SchoolLogo.tsx`).

### Onde usar (placement)
| Tela | Variante | `maxWidth` sugerido |
|---|---|---|
| Inicial / hero (projetor) | `full` | 440–520 |
| Espera do aluno (lobby, celular retrato) | `full` | 280–320 |
| Revelação após responder | `compact` | 160–200 (cabeçalho discreto) |
| Ranking / placar | `compact` | 200–240 |
