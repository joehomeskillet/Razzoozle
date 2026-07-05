// Drive a full 2-question game: manager create -> player join+login -> startGame -> SHOW_QUESTION -> SELECT_ANSWER -> player selectedAnswer (correct) -> manager reveal -> SHOW_RESULT -> manager showLeaderboard -> SHOW_LEADERBOARD (with player points > 0) -> next question -> FINISHED
//
// Reaches FINISHED (Batch-1 auto-advance fix). Target port: SMOKE_URL env or :3479 default.
const { io } = require("/nvmetank1/projects/Razzoozle/source/node_modules/.pnpm/socket.io-client@4.8.3/node_modules/socket.io-client/build/cjs/index.js");
const URL = process.env.SMOKE_URL || "http://127.0.0.1:3479";
const seen = [];
const done = (code) => { console.log("SEEN:", seen.join(" | ")); process.exit(code); };
setTimeout(() => { console.log("TIMEOUT after 60s"); done(1); }, 60000);

const mgr = io(URL, { auth: { clientId: "mgr-1" }, transports: ["websocket"] });
let gameId, inviteCode, player, currentQuestion = 1;
let playerHasPoints = false;

mgr.on("connect", () => {
  seen.push("connect");
  mgr.emit("manager:auth", "PASSWORD"); // Batch 5: startGame/reveal/leaderboard are auth-gated
  mgr.emit("game:create", "quizz-1");
});

mgr.on("manager:gameCreated", ({ gameId: gid, inviteCode: code }) => {
  seen.push("gameCreated");
  gameId = gid;
  inviteCode = code;

  // Add player before starting game
  player = io(URL, { auth: { clientId: "player-1" }, transports: ["websocket"] });
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
    // Now start game
    mgr.emit("manager:startGame", { gameId });
  });

  // Monitor player status for SHOW_LEADERBOARD to verify points
  player.on("game:status", (s) => {
    const name = s && s.name ? s.name : JSON.stringify(s).slice(0, 40);
    if (name === "SHOW_RESULT") {
      seen.push("playerShowResult");
    } else if (name === "SHOW_LEADERBOARD") {
      // Check if there's leaderboard data with points
      if (s.data && s.data.leaderboard && Array.isArray(s.data.leaderboard)) {
        const playerEntry = s.data.leaderboard.find(e => e.username === "TestPlayer");
        if (playerEntry && playerEntry.points > 0) {
          playerHasPoints = true;
          seen.push("playerHasPoints:" + playerEntry.points);
        }
      }
    }
  });

  player.on("connect_error", (e) => { console.log("player_connect_error", e.message); done(1); });
});

// Handle game status events on manager
let leaderboardShownCount = 0;
let revealCount = 0;
mgr.on("game:status", (s) => {
  const name = s && s.name ? s.name : JSON.stringify(s).slice(0, 40);
  seen.push("MGR:STATUS:" + name);

  if (name === "SHOW_QUESTION") {
    seen.push("Q" + currentQuestion);
    // Player should select an answer
    // Assume first answer (index 0) is correct for simplicity
    setTimeout(() => {
      player.emit("player:answer", { answer: 0 });
      seen.push("playerAnswered");
    }, 100);
  } else if (name === "SELECT_ANSWER") {
    // Manager reveals answer
    revealCount++;
    setTimeout(() => {
      mgr.emit("manager:revealAnswer", { gameId });
      seen.push("managerRevealed:" + revealCount);
    }, 100);
  } else if (name === "SHOW_PREPARED") {
    // After cooldown, we see SHOW_PREPARED which indicates SHOW_RESULT has been processed
    seen.push("showPrepared");
    // Now show leaderboard
    setTimeout(() => {
      mgr.emit("manager:showLeaderboard", { gameId });
      seen.push("managerShowLeaderboard");
    }, 100);
  } else if (name === "SHOW_LEADERBOARD") {
    seen.push("leaderboardShown");
    leaderboardShownCount++;
    if (leaderboardShownCount === 1) {
      // After first leaderboard, server will auto-advance after 3s
      currentQuestion = 2;
      seen.push("autoAdvanceScheduled");
    }
  } else if (name === "FINISHED") {
    seen.push("gameFinished");
    // Success: we completed the full game loop
    done(playerHasPoints ? 0 : 1);
  }
});

mgr.on("connect_error", (e) => { console.log("connect_error", e.message); done(1); });
