import { io, type Socket } from "socket.io-client";

// Mesma origem do site (em dev, o Vite faz proxy para o servidor :3000).
export const socket: Socket = io({ autoConnect: true });
