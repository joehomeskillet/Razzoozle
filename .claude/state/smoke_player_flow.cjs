// Player-flow smoke: manager create -> player join/login -> start -> answer ->
// disconnect -> reconnect -> cleanup, against SMOKE_URL (default :3012).
// Usage: SMOKE_PW=<manager password> node smoke_player_flow.cjs
// Exit 0 = all pass (SKIPs allowed). Prints PASS/FAIL/SKIP per check.
const { io } = require("/nvmetank1/projects/Razzoozle/source/node_modules/.pnpm/socket.io-client@4.8.3/node_modules/socket.io-client");

const URL = process.env.SMOKE_URL || "http://127.0.0.1:3012";
const PW = process.env.SMOKE_PW;
if (!PW) { console.error("SMOKE_PW missing"); process.exit(3); }

let pass = 0, fail = 0, skip = 0;
const ok = (n, d) => { pass++; console.log("PASS " + n + (d ? " — " + d : "")); };
const bad = (n, d) => { fail++; console.log("FAIL " + n + (d ? " — " + d : "")); };
const skp = (n, d) => { skip++; console.log("SKIP " + n + (d ? " — " + d : "")); };

function connect(clientId) {
  return io(URL, { transports: ["websocket"], auth: { clientId } });
}
function waitFor(sock, event, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { sock.off(event, h); resolve(undefined); }, ms);
    const h = (data) => { clearTimeout(t); resolve({ data }); };
    sock.once(event, h);
  });
}
async function roundtrip(sock, emitEvent, payload, awaitEvent, ms = 5000) {
  const p = waitFor(sock, awaitEvent, ms);
  if (payload === undefined) sock.emit(emitEvent); else sock.emit(emitEvent, payload);
  return p;
}
// game:status streams many statuses (SHOW_START/SHOW_PREPARED/...) — wait for a
// specific discriminant name instead of the next event.
function waitForStatusName(sock, name, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { sock.off("game:status", h); resolve(undefined); }, ms);
    const h = (data) => {
      if (data && data.name === name) { clearTimeout(t); sock.off("game:status", h); resolve({ data }); }
    };
    sock.on("game:status", h);
  });
}
function collectErrors(sock, sink) {
  sock.on("game:errorMessage", (e) => sink.push(String(e)));
}

(async () => {
  const runId = Math.random().toString(36).slice(2, 8);

  // ── 1: manager auth + game:create ──
  const mgr = connect("smokepf-mgr-" + runId);
  const mgrErrors = [];
  collectErrors(mgr, mgrErrors);
  await new Promise((r) => mgr.on("connect", r));
  const cfg = await roundtrip(mgr, "manager:auth", PW, "manager:config", 8000);
  if (!cfg) { bad("1a manager:auth", "no manager:config — abort"); console.log(`RESULT ${pass} pass ${fail + 1} fail ${skip} skip`); process.exit(2); }
  ok("1a manager:auth -> manager:config");

  const quizzes = Array.isArray(cfg.data.quizz) ? cfg.data.quizz : [];
  const quiz = quizzes.find((q) => Array.isArray(q.questions) && q.questions.length > 0) || quizzes[0];
  if (!quiz || !quiz.id) { bad("1b quizz list", "no quizz with id in manager:config — abort"); console.log(`RESULT ${pass} pass ${fail + 1} fail ${skip} skip`); process.exit(2); }
  ok("1b quizz picked", `${quiz.id} "${quiz.subject}" (${(quiz.questions || []).length} questions)`);

  const created = await roundtrip(mgr, "game:create", quiz.id, "manager:gameCreated", 8000);
  if (!created || !created.data || !created.data.gameId || !created.data.inviteCode) {
    bad("1c game:create", JSON.stringify(created && created.data) + " errors=" + mgrErrors.join(","));
    console.log(`RESULT ${pass} pass ${fail + 1} fail ${skip} skip`); process.exit(2);
  }
  const { gameId, inviteCode } = created.data;
  ok("1c game:create -> manager:gameCreated", `gameId=${gameId} invite=${inviteCode}`);

  // ── 2: player join (invite code) + login ──
  const playerClientId = "smokepf-player-" + runId;
  const p1 = connect(playerClientId);
  const p1Errors = [];
  collectErrors(p1, p1Errors);
  await new Promise((r) => p1.on("connect", r));

  const room = await roundtrip(p1, "player:join", inviteCode, "game:successRoom", 5000);
  room && room.data && room.data.gameId === gameId
    ? ok("2a player:join -> game:successRoom", `gameId=${room.data.gameId}`)
    : bad("2a player:join", JSON.stringify(room && room.data) + " errors=" + p1Errors.join(","));

  const joined = await roundtrip(p1, "player:login", { gameId, data: { username: "SmokePlayer" } }, "game:successJoin", 5000);
  const playerToken = joined && joined.data ? joined.data.playerToken : undefined;
  joined && joined.data && joined.data.gameId === gameId
    ? ok("2b player:login -> game:successJoin", `playerToken=${playerToken ? "yes" : "MISSING"}`)
    : bad("2b player:login", JSON.stringify(joined && joined.data) + " errors=" + p1Errors.join(","));

  // ── 3: start game -> SELECT_ANSWER -> player answers ──
  // Arm the status listener BEFORE startGame; SHOW_START(3s) + intro cooldown +
  // SHOW_PREPARED dwell precede SELECT_ANSWER, so allow a generous window.
  const selP = waitForStatusName(p1, "SELECT_ANSWER", 30000);
  mgr.emit("manager:startGame", { gameId });
  const sel = await selP;
  sel
    ? ok("3a manager:startGame -> SELECT_ANSWER reaches player", `question deadline in payload: ${sel.data && sel.data.data && sel.data.data.deadline ? "yes" : "n/a"}`)
    : bad("3a start -> SELECT_ANSWER", "no SELECT_ANSWER within 30s; mgrErrors=" + mgrErrors.join(",") + " p1Errors=" + p1Errors.join(","));

  if (sel) {
    const errCountBefore = p1Errors.length;
    const waitP = waitForStatusName(p1, "WAIT", 8000);
    p1.emit("player:selectedAnswer", { gameId, data: { answerKey: 0 } });
    const w = await waitP;
    w && p1Errors.length === errCountBefore
      ? ok("3b player:selectedAnswer -> WAIT status, no error")
      : bad("3b player:selectedAnswer", w ? "errors=" + p1Errors.slice(errCountBefore).join(",") : "no WAIT status within 8s");
  } else {
    skp("3b player:selectedAnswer", "skipped: no SELECT_ANSWER phase reached (see 3a)");
  }

  // ── 4: player disconnect -> manager roster update ──
  const tpP = waitFor(mgr, "game:totalPlayers", 8000);
  p1.close();
  const tp = await tpP;
  tp !== undefined
    ? ok("4 player disconnect -> manager game:totalPlayers", `total=${tp.data}`)
    : bad("4 player disconnect", "manager got no game:totalPlayers within 8s");

  // ── 5: reconnect with same clientId + playerToken ──
  const p2 = connect(playerClientId);
  const p2Errors = [];
  collectErrors(p2, p2Errors);
  await new Promise((r) => p2.on("connect", r));
  const rec = await roundtrip(p2, "player:reconnect", { gameId, playerToken }, "player:successReconnect", 8000);
  rec && rec.data && rec.data.username === "SmokePlayer"
    ? ok("5 player:reconnect -> player:successReconnect", `username=${rec.data.username} points=${rec.data.points}`)
    : bad("5 player:reconnect", JSON.stringify(rec && rec.data) + " errors=" + p2Errors.join(","));

  // ── 6: cleanup — endGame so no game lingers on the server ──
  const resetP = waitFor(mgr, "game:reset", 8000);
  mgr.emit("manager:endGame", { gameId });
  const reset = await resetP;
  reset !== undefined
    ? ok("6 manager:endGame -> game:reset (game removed)")
    : bad("6 cleanup endGame", "no game:reset within 8s — game may linger");

  p2.close();
  mgr.close();
  console.log(`RESULT ${pass} pass ${fail} fail ${skip} skip`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("SMOKE CRASH", e); process.exit(2); });
