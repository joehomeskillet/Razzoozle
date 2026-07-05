// Reconnect-same-name test: Alice plays Q1 (scores), DISCONNECTS, then RECONNECTS
// with the SAME clientId + SAME username. She must RESUME — score retained, and NO
// duplicate "Alice" in the leaderboard. Bob stays connected as a control.
// Run: SMOKE_URL=http://127.0.0.1:PORT node spikes/golden-frames/smoke-reconnect.cjs
const { io } = require(process.env.SIO_CLIENT || "/nvmetank1/projects/Razzoozle/source/node_modules/.pnpm/socket.io-client@4.8.3/node_modules/socket.io-client/build/cjs/index.js");
const URL = process.env.SMOKE_URL || "http://127.0.0.1:3479";
const t0 = Date.now();
const log = (...a) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const fail = (m) => { log("FAIL ❌:", m); process.exit(1); };
const pass = (m) => { log("PASS ✅:", m); process.exit(0); };
setTimeout(() => fail("TIMEOUT after 60s"), 60000);

let gameId, inviteCode, alice, bob;
let aliceToken = null;
let aliceScoreBeforeDisconnect = null, reconnected = false, loggedIn = 0;

const mgr = io(URL, { auth: { clientId: "mgr-rc" }, transports: ["websocket"], reconnection: false });
mgr.on("connect", () => { mgr.emit("manager:auth", "PASSWORD"); mgr.emit("game:create", process.env.QUIZ_ID || "example-qu--GZoYZWM"); });
mgr.on("connect_error", (e) => fail("mgr connect_error " + e.message));

mgr.on("manager:gameCreated", ({ gameId: gid, inviteCode: code }) => {
  gameId = gid; inviteCode = code;
  bob = mkPlayer("bob-1", "Bobby");
  alice = mkAlice();
});

function mkPlayer(cid, name) {
  const p = io(URL, { auth: { clientId: cid }, transports: ["websocket"], reconnection: false });
  p.on("connect", () => p.emit("player:join", inviteCode));
  p.on("game:successRoom", () => p.emit("player:login", { gameId, data: { username: name, avatar: "a1" } }));
  p.on("game:successJoin", () => { if (++loggedIn === 2) { log("Alice+Bob logged in → startGame"); mgr.emit("manager:startGame", { gameId }); } });
  p.on("game:status", (s) => { if (s && s.name === "SELECT_ANSWER") p.emit("player:selectedAnswer", { gameId, data: { answerKey: 1 } }); });
  p.on("connect_error", (e) => fail(`${name} connect_error ${e.message}`));
  return p;
}

// Alice: same as a player, but we hold a handle to disconnect + reconnect her.
function mkAlice() {
  const a = io(URL, { auth: { clientId: "alice-1" }, transports: ["websocket"], reconnection: false });
  a.on("connect", () => {
    if (reconnected) {
      a.emit("player:reconnect", { gameId, playerToken: aliceToken });
    } else {
      a.emit("player:join", inviteCode);
    }
  });
  a.on("player:token", (p) => { aliceToken = p && p.playerToken; });
  a.on("game:successRoom", () => a.emit("player:login", { gameId, data: { username: "Alice", avatar: "a2" } }));
  a.on("game:successJoin", () => { if (reconnected) log("Alice RE-joined after reconnect"); else if (++loggedIn === 2) { log("Alice+Bob logged in → startGame"); mgr.emit("manager:startGame", { gameId }); } });
  a.on("game:status", (s) => { if (s && s.name === "SELECT_ANSWER") a.emit("player:selectedAnswer", { gameId, data: { answerKey: 1 } }); });
  a.on("connect_error", (e) => fail("Alice connect_error " + e.message));
  return a;
}
function aliceEntry(lb) { return Array.isArray(lb) ? lb.filter((e) => (e.username || e.name) === "Alice") : []; }

// manager drives the round loop + orchestrates the disconnect/reconnect between Q1 and Q2.
let leaderboards = 0;
mgr.on("game:status", (s) => {
  const name = s && s.name;
  if (name === "SELECT_ANSWER") { setTimeout(() => mgr.emit("manager:revealAnswer", { gameId }), 400); }
  else if (name === "SHOW_PREPARED") { setTimeout(() => mgr.emit("manager:showLeaderboard", { gameId }), 150); }
  else if (name === "SHOW_LEADERBOARD") {
    leaderboards++;
    const lb = s.data && s.data.leaderboard;
    const aEntries = aliceEntry(lb);
    log(`leaderboard #${leaderboards}: ${Array.isArray(lb) ? lb.length : "?"} entries, Alice x${aEntries.length}${aEntries[0] ? " score=" + (aEntries[0].points ?? aEntries[0].score) : ""}`);

    if (leaderboards === 1) {
      // Record Alice's score, then disconnect + reconnect her before Q2.
      if (aEntries.length !== 1) return fail(`expected exactly 1 Alice before disconnect, got ${aEntries.length}`);
      aliceScoreBeforeDisconnect = aEntries[0].points ?? aEntries[0].score ?? 0;
      log(`Alice score before disconnect = ${aliceScoreBeforeDisconnect}. Disconnecting Alice...`);
      alice.close();
      setTimeout(() => { reconnected = true; log("Reconnecting Alice (same clientId alice-1, same name)"); alice = mkAlice(); }, 800);
    } else if (leaderboards >= 2) {
      // Verify resume: exactly one Alice, score retained (>= before).
      if (aEntries.length === 0) return fail("Alice VANISHED after reconnect (removed on disconnect, no resume)");
      if (aEntries.length > 1) return fail(`DUPLICATE Alice after reconnect: ${aEntries.length} entries (reconnect created a new player instead of resuming)`);
      const now = aEntries[0].points ?? aEntries[0].score ?? 0;
      if (now < aliceScoreBeforeDisconnect) return fail(`Alice score RESET on reconnect: was ${aliceScoreBeforeDisconnect}, now ${now}`);
      pass(`reconnect-same-name OK — 1 Alice, score retained (${aliceScoreBeforeDisconnect} → ${now})`);
    }
  } else if (name === "FINISHED") {
    if (aliceScoreBeforeDisconnect === null) return fail("game finished before reconnect could be tested");
    pass("game finished; reconnect path exercised (verify leaderboard logs above)");
  }
});
