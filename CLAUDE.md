# ClaOdin-Quiz — guia do projeto

Framework de quizzes estilo Kahoot para sala de aula. Roda no navegador, em **rede local**,
sem o aluno instalar nada (abre `http://<ip-do-professor>:3000`, entra por PIN). Modos solo/dupla/grupo,
pontuação por questão, estatísticas com nome real para o professor lançar nota.

Raiz do projeto: `C:\Users\erly_\projetos\quiz-app` (monorepo npm workspaces: `client/`, `server/`).

## Stack & como rodar
- **TypeScript** ponta a ponta. **Server**: Node + Fastify + Socket.IO + better-sqlite3. **Client**: React 19 + Vite + Tailwind v4 + Framer Motion.
- O server compila e **serve o client** (`client/dist`) + Socket.IO + API REST, tudo na porta 3000.
- Comandos (na raiz): `npm run dev` (hot reload), `npm run build` (compila o client), `npm start` (serve produção).
- **O build do client roda `tsc --noEmit` antes do Vite** — o Vite/esbuild sozinho NÃO checa tipos, então confie no build (não só no `vite build`) para pegar erros. Após mexer no server, rode `tsc -p server/tsconfig.json --noEmit`.
- Para a aula ficar estável: o usuário roda `npm start` numa janela de terminal aberta (servidor de fundo do agente é encerrado quando ocioso).

## Mapa do código
**Servidor (`server/src/`)**
- `index.ts` — Fastify: serve `client/dist`, API REST, Socket.IO, detecção de IP de LAN, `uncaughtException`/`unhandledRejection` (não derruba o server), `bodyLimit` 256 KB.
- `game.ts` — salas em memória (`Map` por PIN), eventos socket, pontuação, **reconexão**. Player é chaveado por `participantId` (sobrevive à troca de socket); guarda `socketId`, `token`, `connected`.
- `db.ts` — better-sqlite3 (`server/data/quiz.sqlite`, no .gitignore). CRUD de quizzes, sessões, estatísticas; migrações via `ALTER TABLE` em try/catch.
- `quiz.ts` — tipo `Question`, `DEMO_QUIZ` (semeado se o banco estiver vazio), `computePoints`.

**Cliente (`client/src/`)**
- `App.tsx` — roteador de telas (estado, sem lib) + **reconexão** (lê `getMembership()` e emite rejoin no `connect`) + `<ConnectionOverlay>`.
- `screens/`: `Home`, `StudentJoin` (2 passos: PIN → formulário conforme o modo), `StudentGame`, `Host`, `ProfessorPanel` (lista/edita/lança quizzes), `QuizEditor`.
- `components/`: `Shapes` (4 formas), `OptionTile`, `Leaderboard` (placar animado), `SchoolLogo` (logo ETE Epitácio Pessoa, vetorial; trocável por `client/public/logo-escola.png`), `ConnectionOverlay`.
- `lib/socket.ts` (singleton Socket.IO), `lib/session.ts` (identidade p/ reconexão: aluno em `sessionStorage`, professor em memória).
- `styles/tokens.css` — **fonte única da verdade** de cor/fonte/espaço/raio/duração. Nunca chumbe valores fora dos tokens. Estilo "Neo-Arcade" (escuro), documentado em `docs/DESIGN-SYSTEM.md`.

## Modelo de dados (SQLite)
- `quizzes` (id, title, timestamps) → `quiz_questions` (quiz_id, idx, text, image, options_json, correct_index, time_limit_sec, scoring).
- `sessions` (pin, title, mode, status, quiz_id, **host_token**) → `participants` (= equipe: nick, score) → `members` (first_name, last_name = nome real, só o professor vê).
- `answers` (session_id, participant_id, question_idx, chosen_index, correct, response_ms, points).
- `Question` = { text, image?, options[4], correctIndex, timeLimitSec, scoring }. Modo solo = equipe de 1 integrante; dupla = 2; grupo = 2–5 (**1 aparelho por equipe**).

## Pontuação por questão (escolhida pelo professor no editor)
`computePoints(correct, elapsedMs, timeMs, scoring)` — **rapido**: 1000 (instantâneo) → 500 (no limite); **lento**: 1000 fixo se acertar. (TRI foi abandonada.)

## Protocolo Socket.IO
Cliente→servidor: `host:create {quizId}` (cb: `{pin,sessionId,title,questions,timeLimits,mode,hostToken}`), `host:setMode {pin,mode}`, `host:start {pin,timeLimits}`, `host:reveal {pin}`, `host:next {pin}`, `host:rejoin {pin,hostToken}`; `player:peek {pin}` (cb mode/title), `player:join {pin,nick,members:[{firstName,lastName}]}` (cb `{ok,participantId,token}`), `player:rejoin {pin,token}`, `player:answer {index}`.
Servidor→cliente: `question:show {idx,total,text,image,options,timeMs,startedAt}`, `answer:progress {answered,total}`, `question:reveal {correctIndex,counts,ranking}`, `player:result {correct,roundPoints,score,rank,total}`, `player:answered {index}` (restaura resposta no rejoin), `lobby:update {count,total,mode,players:[{nick,members,connected}]}`, `room:mode {mode}`, `game:ended {sessionId,podium}`, `presence {online}`.

Fluxo do host: lobby (escolhe **modo antes de os alunos entrarem**) → `host:start` → pergunta (relógio, contadores, "Revelar") → revela resposta + "Continuar" → ranking animado + "Próxima" → fim (pódio + tabela de estatísticas via `GET /api/sessions/:id/stats?token=<hostToken>`). Avanço é manual (ou auto ao acabar o tempo / todos responderem). Contadores regressivos contam a partir do recebimento no aparelho (robusto a relógios diferentes).

## Reconexão (resolve celular dormindo / Wi-Fi instável)
Cada aluno tem `token` estável. Ao cair, **não é removido** (no lobby ou em jogo) — fica `connected:false` e a vaga é guardada; ao voltar (`player:rejoin`) o servidor reanexa o socket, restaura o estado (snapshot) e ele volta **na mesma pergunta com o mesmo nome, sem relogar**. O professor reconecta via `host:rejoin`. Overlay "reconectando" no cliente. Sala em memória é limpa após `game:ended` (60s) ou saída do host (5 min). Obs.: se o **processo** do servidor reiniciar, as salas (em memória) se perdem — por isso manter `npm start` aberto.

## Segurança (já aplicada)
Eventos `host:*` exigem `socket.id === hostSocketId`. `/stats` exige `?token=` (host_token) — protege os nomes reais. `player:answer` valida índice 0–3. `/api/quizzes` valida tamanho/quantidade + `bodyLimit`. URL de imagem só `http(s)` (descarta `data:`/`javascript:`). Limpeza de salas evita leak.

## Operação (rede)
- IP de LAN sai do DHCP (já foi `192.168.0.2`; pode mudar) — o server imprime o IP atual no boot; recomende **reserva de DHCP / IP estático**.
- **Firewall do Windows**: já foi criada regra de entrada liberando TCP 3000 (a rede estava como "Pública"; sem isso, celulares não conectam).

## Estado das fases
Fases 1–5 ✅ concluídas: esqueleto+design; jogo ao vivo+placar; controle do professor (tempo/questão, avanço manual, contadores, ranking animado); modos dupla/grupo; editor/CRUD de quizzes + pontuação rápido/lento + lançar quiz salvo. Reconexão e blindagem de segurança ✅.

5. ✅ **Imagens + IA**.
   - **Imagens**: `POST /api/upload` (multipart `@fastify/multipart`, só imagem, ≤4 MB) salva em `server/data/uploads/`, servido em `/uploads/`. `QuizEditor` permite **enviar/colar (Ctrl+V no cartão)/URL** → `question.image`; renderizado em `StudentGame` e `Host`.
   - **IA multi-provedor** (`server/src/ai.ts`): **Claude** (`@anthropic-ai/sdk`, tool use strict), **ChatGPT** (`openai`, `response_format json_object`), **Gemini** (`@google/genai`, `responseMimeType json`). Modelos padrão `claude-opus-4-8` / `gpt-4o-mini` / `gemini-2.0-flash` (env `ANTHROPIC_MODEL`/`OPENAI_MODEL`/`GEMINI_MODEL`). Todos retornam `{questions:[{text,options[4],correctIndex}]}` → coerção comum (define `timeLimitSec` + `scoring`).
   - Chaves no `.env` da raiz: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` (carregado via `process.loadEnvFile`; `.env` no .gitignore, modelo em `.env.example`). `GET /api/health` expõe `ai: {claude,openai,gemini}` (quais têm chave); `POST /api/generate {provider,topic,count,difficulty,scoring}`. Sem chave do provedor → **503**; erro de cota/créditos vira mensagem clara. `QuizEditor` tem seletor de provedor (só os com chave habilitados) + painel "✨ Gerar com IA". **Verificado: Claude gera ok; OpenAI/Gemini autenticam mas as chaves de teste estavam sem cota/créditos.**

**Fase 6 (futuro)**: exportar notas (CSV) + Docker.

## Convenções
- Textos de UI/doc em **português (BR)**. Coerência de tokens de design é regra. Commit/push só quando o usuário pedir.
- Existem agentes de design/áudio em `.claude/agents/` (`design-director`, `design-reviewer`, `asset-curator`, `asset-creator`, `sound-designer`, `sound-reviewer`) — acionáveis pelo Agent tool quando útil.
