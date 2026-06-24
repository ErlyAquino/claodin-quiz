# 🎮 ClaOdin-Quiz

Framework de quizzes estilo **Kahoot** para sala de aula. Roda no navegador, em rede local,
**sem instalação para o aluno**: o professor projeta numa tela e os alunos entram por um **PIN**
pelo próprio celular.

> TypeScript · React + Vite · Node + Fastify + Socket.IO · SQLite · Feito para a ETE Epitácio Pessoa.

## ✨ Recursos
- Modos **solo / dupla / grupo**; apelido + nome real; ranking ao vivo; **reconexão automática**.
- **Editor de texto rico** com HTML e **equações LaTeX** (MathJax servido localmente, sem internet).
- Até **10 alternativas** por pergunta (cor + forma para acessibilidade).
- **Geração por IA** (Claude / ChatGPT / Gemini) e **importação GIFT** (Moodle).
- **Estatísticas por turma** + **relatório em PDF** (via LaTeX).
- **Modo claro/escuro**.

## 🚀 Começo rápido com Docker (recomendado)
Pré-requisito: **Docker Desktop** (Windows/Mac) ou **Docker Engine + Compose** (Linux).

```bash
git clone https://github.com/SEU-USUARIO/claodin-quiz.git
cd claodin-quiz
cp .env.example .env            # Windows (PowerShell): copy .env.example .env
docker compose up -d --build
```

Abra **http://localhost:3000** no PC do professor. Na rede da escola, os alunos acessam
**http://IP-DO-SEU-PC:3000** (descubra o IP com `ipconfig` no Windows ou `ip addr` no Linux).
Parar: `docker compose down` (os dados em `./server/data` continuam salvos).

## 🛠️ Sem Docker (instalação manual)
Pré-requisitos: **Node.js 20+**. Para o PDF de estatísticas, uma distribuição **LaTeX**
(**MiKTeX** no Windows · **TeX Live** no Linux: `sudo apt install texlive-latex-recommended texlive-latex-extra texlive-lang-portuguese`).

```bash
npm install
npm run setup     # cria o .env a partir do modelo (multiplataforma)
npm run build
npm start
```

## 🔑 Chaves de IA (opcional)
A geração por IA é **opcional** — sem chaves, todo o resto funciona. Coloque suas chaves no
arquivo `.env` (modelo em [`.env.example`](.env.example)).

> ⚠️ **Nunca** faça commit do `.env` (já está no `.gitignore`). Se alguma chave já tiver sido
> exposta, **gere novas** no painel de cada provedor antes de publicar.

## 📄 Licença
Distribuído sob a licença **MIT** — veja [LICENSE](LICENSE). Uso livre para fins
educacionais, mantendo o aviso de copyright.

## 📚 Documentação completa
O passo a passo detalhado (publicar no GitHub, Docker em Windows/Linux, rede, dependências,
operação em sala) está em **[DOCUMENTACAO.html](DOCUMENTACAO.html)**.

## 📦 Dependências
| Camada | Tecnologia | Necessário para |
|---|---|---|
| Runtime | Node.js 20+ | rodar o servidor e o build |
| Servidor | Fastify · Socket.IO · better-sqlite3 | API, tempo real, banco |
| Interface | React 19 · Vite · Tailwind v4 · Framer Motion | telas e build |
| Matemática | MathJax (local) | renderizar LaTeX no navegador |
| PDF | LaTeX/pdflatex (MiKTeX ou TeX Live) | relatório de estatísticas |
| IA (opcional) | SDKs Anthropic · OpenAI · Google GenAI | gerar perguntas |
| Empacotamento | Docker + Docker Compose | rodar igual em qualquer SO |
