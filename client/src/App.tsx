import { useEffect, useState } from "react";
import { socket } from "./lib/socket";
import { getMembership, clearMembership } from "./lib/session";
import { Home } from "./screens/Home";
import { StudentJoin } from "./screens/StudentJoin";
import { StudentGame } from "./screens/StudentGame";
import { Host } from "./screens/Host";
import { ProfessorPanel } from "./screens/ProfessorPanel";
import { QuizEditor } from "./screens/QuizEditor";
import { ProfessorLogin } from "./screens/ProfessorLogin";
import { ConnectionOverlay } from "./components/ConnectionOverlay";
import { ThemeToggle } from "./components/ThemeToggle";
import { isProfLoggedIn, clearProfToken } from "./lib/auth";

type Screen = "home" | "join" | "play" | "panel" | "editor" | "host" | "prof-login";

export function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [online, setOnline] = useState(0);
  // PIN vindo do QR code (?pin=1234): abre direto na tela de entrada do aluno, já preenchido
  const [joinPin] = useState(() => new URLSearchParams(window.location.search).get("pin") ?? "");
  // restaura a tela do aluno se a página foi recarregada durante um jogo; ou abre o "join" se veio do QR
  const [screen, setScreen] = useState<Screen>(() => {
    if (getMembership()?.role === "player") return "play";
    if (new URLSearchParams(window.location.search).has("pin")) return "join";
    return "home";
  });
  const [nick, setNick] = useState(() => { const m = getMembership(); return m?.role === "player" ? m.nick : ""; });
  const [editId, setEditId] = useState<number | null>(null);
  const [gameQuizId, setGameQuizId] = useState<number | null>(null);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onPresence = (p: { online: number }) => setOnline(p.online);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("presence", onPresence);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("presence", onPresence);
    };
  }, []);

  // reconexão: ao (re)conectar, volta para a mesma sala
  useEffect(() => {
    const onConnect = () => {
      const m = getMembership();
      if (!m) return;
      if (m.role === "player") {
        socket.emit("player:rejoin", { pin: m.pin, token: m.token }, (res: { ok?: boolean; error?: string }) => {
          if (res?.error) { clearMembership(); setScreen("home"); }
        });
      } else {
        socket.emit("host:rejoin", { pin: m.pin, hostToken: m.token });
      }
    };
    socket.on("connect", onConnect);
    if (socket.connected) onConnect(); // caso já esteja conectado (reload do aluno)
    return () => { socket.off("connect", onConnect); };
  }, []);

  // tira o ?pin= da barra de endereço depois de ler (URL limpa; reload não reabre o QR)
  useEffect(() => {
    if (window.location.search) history.replaceState(null, "", window.location.pathname);
  }, []);

  const goHome = () => { clearMembership(); setScreen("home"); };

  let view;
  if (screen === "join")
    view = <StudentJoin initialPin={joinPin} onBack={() => setScreen("home")} onJoined={(n) => { setNick(n); setScreen("play"); }} />;
  else if (screen === "play") view = <StudentGame nick={nick} onLeave={goHome} />;
  else if (screen === "prof-login")
    view = (
      <ProfessorLogin
        onSuccess={(usingDefault) => {
          if (usingDefault) alert('Você entrou com a senha PADRÃO ("professor"). Recomendamos trocá-la em PROFESSOR_PASSWORD no arquivo .env para os alunos não entrarem.');
          setScreen("panel");
        }}
        onBack={() => setScreen("home")}
      />
    );
  else if (screen === "panel")
    view = (
      <ProfessorPanel
        onBack={() => setScreen("home")}
        onAuthExpired={() => { clearProfToken(); setScreen("prof-login"); }}
        onNew={() => { setEditId(null); setScreen("editor"); }}
        onEdit={(id) => { setEditId(id); setScreen("editor"); }}
        onPlay={(id) => { setGameQuizId(id); setScreen("host"); }}
      />
    );
  else if (screen === "editor") view = <QuizEditor quizId={editId} onDone={() => setScreen("panel")} onCancel={() => setScreen("panel")} />;
  else if (screen === "host") view = <Host quizId={gameQuizId} onLeave={() => { clearMembership(); setScreen("panel"); }} />;
  else view = <Home connected={connected} online={online} onStudent={() => setScreen("join")} onHost={() => setScreen(isProfLoggedIn() ? "panel" : "prof-login")} />;

  return (
    <>
      {view}
      {/* alternância de tema fora das telas de jogo ao vivo (evita distração no projetor) */}
      {screen !== "play" && screen !== "host" && <ThemeToggle />}
      <ConnectionOverlay active={screen === "play" || screen === "host"} />
    </>
  );
}
