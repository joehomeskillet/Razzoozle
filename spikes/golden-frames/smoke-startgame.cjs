// Drive create -> player:join -> startGame against the Rust server, verify SHOW_QUESTION emits.
const { io } = require("/nvmetank1/projects/Razzoozle/source/node_modules/.pnpm/socket.io-client@4.8.3/node_modules/socket.io-client/build/cjs/index.js");
const URL = "http://127.0.0.1:3478";
const seen = [];
const done = (code) => { console.log("SEEN:", seen.join(" | ")); process.exit(code); };
setTimeout(() => { console.log("TIMEOUT"); done(1); }, 15000);

const mgr = io(URL, { auth: { clientId: "mgr-1" }, transports: ["websocket"] });
let gameId, inviteCode;

mgr.on("connect", () => {
  seen.push("connect");
  mgr.emit("game:create", "quizz-1");
});

mgr.on("manager:gameCreated", ({ gameId: gid, inviteCode: code }) => {
  seen.push("gameCreated");
  gameId = gid;
  inviteCode = code;

  // Add player before starting game (required by engine)
  const player = io(URL, { auth: { clientId: "player-1" }, transports: ["websocket"] });
  player.on("connect", () => {
    seen.push("playerConnect");
    player.emit("player:join", inviteCode);
  });

  player.on("game:successRoom", () => {
    seen.push("playerJoined");
    player.emit("player:login", { gameId, data: { username: "TestPlayer", avatar: "avatar1" } });
  });

  player.on("game:successJoin", () => {
    seen.push("playerLoggedIn");
    // Now start game (at least one player present)
    mgr.emit("manager:startGame", { gameId });
  });
});

mgr.on("game:status", (s) => {
  const name = s && s.name ? s.name : JSON.stringify(s).slice(0, 40);
  seen.push("STATUS:" + name);
  if (name === "SHOW_QUESTION" || name === "SELECT_ANSWER") { console.log("GAME FLOW OK"); done(0); }
});

mgr.on("connect_error", (e) => { console.log("connect_error", e.message); done(1); });
