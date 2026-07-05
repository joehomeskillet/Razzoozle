// 100-player load test: 1 manager + N players (default 100) play a full game to
// FINISHED. Fails if any player drops mid-game or the server never finishes.
// Run: SMOKE_URL=http://127.0.0.1:PORT node spikes/golden-frames/loadtest-100.cjs
const { io } = require("/nvmetank1/projects/Razzoozle/source/node_modules/.pnpm/socket.io-client@4.8.3/node_modules/socket.io-client/build/cjs/index.js");
const URL = process.env.SMOKE_URL || "http://127.0.0.1:3479";
const N = parseInt(process.env.N_PLAYERS || "100", 10);
const t0 = Date.now();
const log = (...a) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const fail = (m) => { log("FAIL:", m); process.exit(1); };
setTimeout(() => fail("TIMEOUT after 150s"), 150000);

let gameId, inviteCode, loggedIn = 0, currentQ = 0, started = false, FINISHED = false;
const players = [];

const mgr = io(URL, { auth: { clientId: "mgr-load" }, transports: ["websocket"], reconnection: false });
const QUIZ = process.env.QUIZ_ID || "quizz-1";
mgr.on("connect", () => { mgr.emit("manager:auth", "PASSWORD"); mgr.emit("game:create", QUIZ); });
mgr.on("connect_error", (e) => fail("mgr connect_error " + e.message));

mgr.on("manager:gameCreated", ({ gameId: gid, inviteCode: code }) => {
  gameId = gid; inviteCode = code;
  log("game created", code, "— spawning", N, "players");
  for (let i = 0; i < N; i++) spawnPlayer(i);
});

function spawnPlayer(i) {
  const p = io(URL, { auth: { clientId: "p" + i }, transports: ["websocket"], reconnection: false });
  p._i = i; p._answered = false; players.push(p);
  p.on("connect", () => p.emit("player:join", inviteCode));
  p.on("game:successRoom", () => p.emit("player:login", { gameId, data: { username: "P" + i, avatar: "a" + (i % 8) } }));
  p.on("game:successJoin", () => { if (++loggedIn === N) { log("all", N, "players logged in in", ((Date.now() - t0) / 1000).toFixed(1), "s"); maybeStart(); } });
  p.on("game:status", (s) => {
    if (s && s.name === "SELECT_ANSWER" && !p._answered) { p._answered = true; p.emit("player:selectedAnswer", { gameId, data: { answerKey: i % 4 } }); }
  });
  p.on("connect_error", (e) => fail(`player ${i} connect_error ${e.message}`));
  p.on("disconnect", (r) => { if (r !== "io client disconnect" && !FINISHED) log(`⚠ player ${i} DROPPED mid-game: ${r}`); });
}

function maybeStart() { if (!started) { started = true; mgr.emit("manager:startGame", { gameId }); log("startGame emitted"); } }

mgr.on("game:status", (s) => {
  const name = s && s.name;
  if (name === "SHOW_QUESTION") { currentQ++; players.forEach(p => (p._answered = false)); log("Q" + currentQ, "SHOW_QUESTION"); }
  else if (name === "SELECT_ANSWER") { setTimeout(() => mgr.emit("manager:revealAnswer", { gameId }), 800); } // let 100 answers land
  else if (name === "SHOW_PREPARED") { setTimeout(() => mgr.emit("manager:showLeaderboard", { gameId }), 200); }
  else if (name === "SHOW_LEADERBOARD") {
    const lb = s.data && s.data.leaderboard; if (Array.isArray(lb)) log("leaderboard has", lb.length, "entries");
  } else if (name === "FINISHED") {
    FINISHED = true;
    const connected = players.filter(p => p.connected).length;
    const top = s.data && (s.data.leaderboard || s.data.top);
    log(`FINISHED after ${currentQ} questions. connected: ${connected}/${N}. final board: ${Array.isArray(top) ? top.length : "?"}`);
    if (Array.isArray(top)) {
      const scored = top.filter(e => (e.points ?? e.score ?? 0) > 0).length;
      log(`final podium top-3: ${top.slice(0, 3).map(e => `${e.username || e.name}=${e.points ?? e.score}`).join(", ")}`);
      log(`players with score>0: ${scored}/${top.length}`);
    }
    if (connected < N) fail(`${N - connected} of ${N} players dropped during the game`);
    log(`PASS ✅ — ${N}-player game played to the END (${currentQ} questions → FINISHED), 0 drops, ${((Date.now() - t0) / 1000).toFixed(1)}s total`);
    process.exit(0);
  }
});
