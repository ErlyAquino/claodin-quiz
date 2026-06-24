# syntax=docker/dockerfile:1
###############################################################################
# ClaOdin-Quiz — imagem Docker (base Linux). Roda igual em Windows e Linux via Docker.
#
#  Estágio 1 (build):  instala as dependências e compila o front (Vite -> client/dist).
#  Estágio 2 (runtime): imagem final enxuta + LaTeX (pdflatex) p/ o PDF de estatísticas.
###############################################################################

# ----------------------------------------------------------------------------
# Estágio 1 — build (instala deps + compila o client)
# ----------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Ferramentas para compilar o módulo nativo "better-sqlite3" caso não exista
# um binário pré-compilado para a plataforma (ex.: ARM). Ficam SÓ neste estágio.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Copia só os manifests primeiro (melhor cache de camadas).
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci

# Copia o restante do código e compila o front (gera client/dist).
COPY . .
RUN npm run build

# ----------------------------------------------------------------------------
# Estágio 2 — runtime (app + LaTeX)
# ----------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# LaTeX (pdflatex) para gerar o PDF do relatório de estatísticas. Instalamos só o
# subconjunto necessário — NÃO o TeX Live completo (que tem vários GB). No Docker as
# dependências do LaTeX já vêm prontas, então a 1ª geração de PDF é rápida e confiável.
RUN apt-get update && apt-get install -y --no-install-recommends \
      texlive-latex-base \
      texlive-latex-recommended \
      texlive-latex-extra \
      texlive-lang-portuguese \
      texlive-fonts-recommended \
  && rm -rf /var/lib/apt/lists/*

# Traz a aplicação já instalada/compilada do estágio de build
# (node_modules com o binário nativo do Linux + client/dist + código do servidor).
COPY --from=build /app /app

# Pasta de dados (banco SQLite, uploads e estatísticas) — montada como volume em runtime.
RUN mkdir -p /app/server/data

EXPOSE 3000
# Sobe o servidor (serve o front compilado + API + Socket.IO numa porta só).
CMD ["npm", "start"]
