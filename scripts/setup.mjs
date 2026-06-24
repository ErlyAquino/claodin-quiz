// Setup multiplataforma (Windows / Linux / macOS): cria o arquivo .env a partir do
// modelo .env.example, se ele ainda não existir. Rode com:  npm run setup
//
// O .env guarda as chaves de IA (opcionais) e a senha de professor. Ele NÃO vai para
// o git (.gitignore). Edite-o depois de criado e reinicie o servidor.

import { existsSync, copyFileSync } from "node:fs";

const ENV = ".env";
const EXAMPLE = ".env.example";

if (existsSync(ENV)) {
  console.log("• .env já existe — mantido (nenhuma alteração).");
} else if (!existsSync(EXAMPLE)) {
  console.error(`✗ ${EXAMPLE} não encontrado. Rode este comando na raiz do projeto.`);
  process.exit(1);
} else {
  copyFileSync(EXAMPLE, ENV);
  console.log(`✓ ${ENV} criado a partir de ${EXAMPLE}.`);
  console.log("  Abra o .env para (opcional) colocar chaves de IA e trocar a senha de professor.");
}
