# 🎮 ClaOdin-Quiz

Framework de **quizzes estilo Kahoot** para a sala de aula. Roda no navegador, em **rede local**,
**sem o aluno instalar nada**: o professor projeta numa tela e os alunos entram por um **PIN** (ou **QR code**)
pelo próprio celular.

> TypeScript · React + Vite · Node + Fastify + Socket.IO · SQLite · Docker · Feito para a **ETE Epitácio Pessoa**.

![License](https://img.shields.io/badge/licença-MIT-7c5cff)
![Node](https://img.shields.io/badge/Node.js-20%2B-22d3ee)
![Docker](https://img.shields.io/badge/Docker-pronto-2496ED)
![Plataformas](https://img.shields.io/badge/Windows%20%C2%B7%20Linux-suportado-a3e635)

📄 **Prefere um guia ilustrado em PDF?** Veja **[docs/Tutorial-ClaOdin-Quiz.pdf](docs/Tutorial-ClaOdin-Quiz.pdf)** — este README cobre o mesmo passo a passo em texto.

---

## Índice
- [Sobre o projeto](#sobre-o-projeto)
- [Funcionalidades](#funcionalidades)
- [Dependências e links](#dependências-e-links)
- [Instalação no Windows](#instalação-no-windows)
- [Instalação no Linux](#instalação-no-linux)
- [Configuração e senha do professor](#configuração-e-senha-do-professor)
- [Rede e IP](#rede-e-ip)
- [Como usar em sala](#como-usar-em-sala)
- [Erros comuns e soluções](#erros-comuns-e-soluções)
- [Documentação e links](#documentação-e-links)
- [Licença](#licença)

---

## Sobre o projeto

Um app web de quizzes para usar em aula. O professor projeta o jogo numa tela e os alunos entram pelo
celular, digitando um **PIN** ou lendo um **QR code** — sem instalar nada no aparelho.

Funciona na **rede local** da escola: o servidor roda no computador do professor e tudo acontece no navegador.
Ele guarda os quizzes, conduz o jogo ao vivo, mostra o ranking e gera **estatísticas por turma** (com o nome
real dos alunos, visível só para o professor) para ajudar a lançar nota.

> **Em 1 frase:** o professor abre `http://<ip-do-professor>:3000`, cria uma sala, os alunos entram pelo
> PIN/QR no celular, e o professor controla as perguntas pela tela projetada.

---

## Funcionalidades

- **Entrada sem app:** aluno entra por **PIN** ou **QR code** no navegador do celular.
- **Modos de jogo:** **solo**, **dupla** e **grupo** (2–5 alunos, 1 aparelho por equipe).
- **Apelido + nome real:** apelido aparece no ranking; o nome real fica só para o professor.
- **Editor de texto rico:** negrito, listas, HTML e **equações em LaTeX** (MathJax local, sem internet).
- **Até 10 alternativas** por pergunta — cada uma com **cor + forma** (acessível a daltônicos).
- **Imagens na pergunta:** enviar arquivo, **colar (Ctrl+V)** ou por URL.
- **Pontuação por questão:** modo **rápido** (responder antes vale mais) ou **lento** (valor fixo ao acertar).
- **Ranking ao vivo** e **pódio** no final.
- **Reconexão automática:** se o celular dormir ou o Wi-Fi cair, o aluno volta **na mesma pergunta**.
- **Geração por IA** (Claude / ChatGPT / Gemini) — *opcional* — e **importação GIFT** (Moodle).
- **Estatísticas por turma** + **relatório em PDF** (via LaTeX).
- **Senha de professor** e **modo claro/escuro**.

---

## Dependências e links

Há **dois caminhos** de instalação — escolha **um**:

- **Caminho A — Docker** (mais simples; idêntico em Windows e Linux). Precisa só de **Git + Docker**.
- **Caminho B — Node (manual)**. Precisa de **Git + Node.js**. Use se não quiser/puder usar Docker.

| Programa | Para quê | Necessário? | Link |
|---|---|---|---|
| **Git** | baixar (clonar) o projeto | Sim (ambos) | https://git-scm.com/downloads |
| **Docker Desktop** | rodar tudo pronto (Caminho A) | Só no Caminho A | https://www.docker.com/products/docker-desktop/ |
| **Node.js 20+** | rodar o servidor (Caminho B) | Só no Caminho B | https://nodejs.org/ (versão LTS) |
| **MiKTeX** (Windows) | gerar o PDF de estatísticas | Opcional | https://miktex.org/download |
| **TeX Live** (Linux) | gerar o PDF de estatísticas | Opcional | `sudo apt install texlive-latex-recommended texlive-latex-extra texlive-lang-portuguese` |
| Chaves de **IA** | gerar perguntas com IA | Opcional | Anthropic · OpenAI · Google AI Studio |

> 💡 No **Docker**, o LaTeX (PDF) **já vem incluído** na imagem — não precisa instalar MiKTeX/TeX Live à parte.

---

## Instalação no Windows

### 1. Pré-requisitos
1. Instale o **Git**: https://git-scm.com/download/win (avançar com as opções padrão).
2. **Caminho A:** instale o **Docker Desktop** e abra-o uma vez (deixe iniciar). **Caminho B:** instale o **Node.js LTS**.
3. *(Opcional, para o PDF)* instale o **MiKTeX**.

### 2. Baixar o projeto
Abra o **PowerShell** (ou o *Git Bash*) numa pasta de sua escolha:
```bash
git clone https://github.com/ErlyAquino/claodin-quiz.git
cd claodin-quiz
```

### 3. Rodar — Caminho A (Docker)
```powershell
copy .env.example .env
docker compose up -d --build
```
Abra **http://localhost:3000** no PC do professor. Parar: `docker compose down` (os dados em `server\data` ficam salvos).

### 4. Rodar — Caminho B (Node, sem Docker)
```bash
npm install
npm run setup     # cria o .env automaticamente
npm run build
npm start
```
Abra **http://localhost:3000**. Deixe a janela do terminal **aberta** durante a aula (fechar encerra o servidor).

### 5. Firewall (para os celulares conectarem)
Abra o **PowerShell como Administrador** e libere a porta **3000**:
```powershell
New-NetFirewallRule -DisplayName "ClaOdin-Quiz 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

---

## Instalação no Linux

### 1. Pré-requisitos (Ubuntu/Debian)
```bash
# Git
sudo apt update && sudo apt install -y git

# Caminho A — Docker (script oficial) + permitir seu usuário
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER     # depois, saia e entre na sessão de novo

# Caminho B — Node.js 20 (sem Docker)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# (Opcional, para o PDF) LaTeX
sudo apt install -y texlive-latex-recommended texlive-latex-extra texlive-lang-portuguese
```

### 2. Baixar e rodar
```bash
git clone https://github.com/ErlyAquino/claodin-quiz.git
cd claodin-quiz

# Caminho A (Docker)
cp .env.example .env
docker compose up -d --build

# OU Caminho B (Node)
npm install
npm run setup
npm run build
npm start
```
Abra **http://localhost:3000**. Com firewall (ufw): `sudo ufw allow 3000/tcp`.

---

## Configuração e senha do professor

Toda a configuração fica num arquivo **`.env`** na raiz do projeto. Ele **não** vai para o GitHub. Crie-o com
`npm run setup` (ou copiando o [`.env.example`](.env.example)) e edite com qualquer editor de texto.

> ⚠️ **No Docker — isto é o que mais confunde:** o `.env` é lido **só quando o contêiner é criado**.
> Depois de editar o `.env`, **não basta `docker compose restart`** (ele reinicia com o ambiente antigo).
> Para aplicar as mudanças, **recrie** o contêiner:
> ```bash
> docker compose up -d              # recria com os novos valores
> # se ainda assim não pegar, force:
> docker compose down && docker compose up -d
> ```
> Confirme que as variáveis entraram no contêiner:
> ```bash
> docker compose exec quiz printenv | grep -E "PROFESSOR_PASSWORD|API_KEY"
> ```

### Trocar a senha do professor (importante!)
A senha protege os quizzes, gabaritos, estatísticas e o PDF — para os **alunos não verem as respostas**.
O padrão é `professor`. Abra o `.env` e ajuste a linha abaixo. **Atenção:** se ela vier com `#` na frente,
**remova o `#`**; e **não use espaços** em volta do `=`.
```bash
PROFESSOR_PASSWORD=minha-senha-secreta
```
Depois **aplique a mudança**: no **Caminho B (Node)**, feche com `Ctrl+C` e rode `npm start` de novo; no
**Docker**, rode `docker compose up -d`.

### Chaves de IA (opcional)
Para gerar perguntas com IA, coloque a chave do provedor no `.env` e **aplique a mudança** (Node: reinicie;
Docker: `docker compose up -d`). Sem chave, todo o resto funciona — só a geração por IA fica indisponível.
```bash
ANTHROPIC_API_KEY=...        # Claude  (console.anthropic.com)
OPENAI_API_KEY=...           # ChatGPT (platform.openai.com)
GEMINI_API_KEY=...           # Gemini  (aistudio.google.com/apikey)
```
Para conferir quais chaves o app reconheceu, abra **`http://localhost:3000/api/health`** — ele mostra
`ai: { claude, openai, gemini }` com `true` para cada chave válida.

> ⚠️ **Nunca** faça commit do `.env` (já está no `.gitignore`). Se alguma chave já foi exposta, **gere novas** no painel do provedor.

---

## Rede e IP

O **professor** abre `http://localhost:3000` no próprio PC. Os **alunos**, no celular, usam o **IP do PC do
professor** na rede da escola: `http://<IP-DO-PC>:3000`. O servidor também **imprime o IP no terminal** ao
iniciar, e a tela do professor mostra um **QR code** pronto.

**Como descobrir o IP da rede local:**

| Sistema | Comando | O que procurar |
|---|---|---|
| Windows | `ipconfig` | "Endereço IPv4" da sua rede (ex.: `192.168.0.2`) |
| Linux | `ip addr` ou `hostname -I` | endereço `192.168.x.x` da interface ativa |

> 💡 **Dica:** peça ao administrador da rede uma **reserva de DHCP / IP fixo** para o PC do professor — assim o endereço (e o QR) não muda a cada dia.

> 🐳 **No Docker** o contêiner não enxerga o IP da rede, então o QR pode sair errado. Defina o IP do PC no `.env` e recrie o contêiner (`docker compose up -d`):
> ```bash
> PUBLIC_HOST=192.168.0.2
> ```

---

## Como usar em sala

1. No PC do professor, abra `http://localhost:3000` e clique em **"Sou professor"** (use sua senha).
2. Crie/edite um quiz no painel (ou use o de demonstração) e clique em **lançar/criar sala**.
3. Escolha o **modo** (solo/dupla/grupo) **antes** de os alunos entrarem.
4. Projete a tela: aparece o **PIN** e o **QR code**. Os alunos entram pelo celular e colocam apelido/nome.
5. Conduza: **iniciar** → cada pergunta tem tempo e contadores → **Revelar** → **Ranking** → **Próxima**.
6. No fim: **pódio** + **estatísticas** da turma (e o **PDF** para lançar nota).

---

## Erros comuns e soluções

| Sintoma / erro | Causa provável | Solução |
|---|---|---|
| Editei o `.env` e nada mudou (**Docker**) | `restart` não relê o `.env` | **Recrie** o contêiner: `docker compose up -d` (ou `down && up -d`). Confira com `docker compose exec quiz printenv`. |
| Senha do professor não muda | linha comentada / com espaços | Remova o `#` de `PROFESSOR_PASSWORD=`; sem espaços no `=`. Depois recrie/reinicie. |
| Alunos não conseguem entrar pelo celular | rede / firewall | Mesmo **Wi-Fi**; use o **IP** certo (não `localhost`); **libere a porta 3000** no firewall. |
| `EADDRINUSE` / "porta 3000 em uso" | outro programa usa a 3000 | Feche-o, ou rode em outra porta: `PORT=3001` no `.env` e recrie/reinicie. |
| QR aponta para endereço errado (Docker) | contêiner não vê o IP da LAN | Defina `PUBLIC_HOST=<ip-do-pc>` no `.env` e rode `docker compose up -d`. |
| Erro ao instalar `better-sqlite3` | faltam ferramentas de build | Use o **Docker** (já traz tudo). Ou: Windows → *Visual Studio Build Tools*; Linux → `sudo apt install python3 make g++`. |
| `docker: command not found` / Docker não sobe | Docker não instalado/iniciado | Windows: instale e **abra o Docker Desktop**. Linux: `sudo usermod -aG docker $USER` e **relogue**. |
| Tela branca / "Cannot GET /" (Caminho B) | faltou compilar o client | Rode `npm run build` **antes** de `npm start`. |
| O PDF de estatísticas não gera | LaTeX ausente | Instale **MiKTeX** (Win) / **TeX Live** (Linux). No Docker já vem pronto. |
| Geração por IA falha (erro 503) | sem chave / sem créditos | Coloque a chave no `.env`, recrie/reinicie e cheque `/api/health`. |
| As salas somem do nada | o servidor reiniciou | As salas ficam na memória — mantenha o terminal do `npm start` **aberto** durante a aula. |

---

## Documentação e links

| Recurso | Link |
|---|---|
| 📄 Tutorial completo em PDF | [docs/Tutorial-ClaOdin-Quiz.pdf](docs/Tutorial-ClaOdin-Quiz.pdf) |
| 📘 Documentação detalhada (HTML) | [DOCUMENTACAO.html](DOCUMENTACAO.html) |
| Git | https://git-scm.com/downloads |
| Node.js (LTS) | https://nodejs.org/ |
| Docker Desktop | https://www.docker.com/products/docker-desktop/ |
| MiKTeX (LaTeX, Windows) | https://miktex.org/download |

### Dependências (resumo técnico)

| Camada | Tecnologia |
|---|---|
| Servidor | Node.js · Fastify · Socket.IO · better-sqlite3 |
| Interface | React 19 · Vite · Tailwind v4 · Framer Motion |
| Matemática | MathJax (local) |
| PDF | LaTeX/pdflatex (MiKTeX ou TeX Live) |
| IA (opcional) | SDKs Anthropic · OpenAI · Google GenAI |
| Empacotamento | Docker + Docker Compose |

---

## Licença

Distribuído sob a licença **MIT** — veja [LICENSE](LICENSE). Uso livre para fins educacionais, mantendo o aviso de copyright.

<sub>ClaOdin-Quiz · ETE Epitácio Pessoa</sub>
