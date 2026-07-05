#!/usr/bin/env node

/**
 * Smoke test for Razzoozle Rust server.
 *
 * Drives a full game flow:
 * 1. Manager creates game
 * 2. Player joins and logs in
 * 3. Manager starts game
 * 4. Server broadcasts SHOW_QUESTION with fixture question
 * 5. Player submits selectedAnswer
 * 6. Manager reveals answer
 * 7. Server broadcasts SHOW_RESULT (or equivalent)
 * 8. Manager requests leaderboard
 * 9. Server broadcasts SHOW_LEADERBOARD
 */

const io = require('/nvmetank1/projects/Razzoozle/source/node_modules/.pnpm/socket.io-client@4.8.3/node_modules/socket.io-client');
const fs = require('fs');
const path = require('path');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3020';
const OUTPUT_DIR = __dirname;
const FIXTURE_QUIZ_PATH = path.join(__dirname, 'fixture-quiz.json');

// Load fixture quiz
let fixtureQuiz;
try {
  fixtureQuiz = JSON.parse(fs.readFileSync(FIXTURE_QUIZ_PATH, 'utf-8'));
  console.log(`[SMOKE] Loaded fixture quiz with ${fixtureQuiz.questions.length} questions`);
} catch (err) {
  console.error(`[SMOKE] Failed to load fixture quiz from ${FIXTURE_QUIZ_PATH}:`, err.message);
  process.exit(1);
}

// Frame recorder
class FrameRecorder {
  constructor(name) {
    this.name = name;
    this.frames = [];
    this.startTime = Date.now();
  }

  recordSend(event, data) {
    this.frames.push({
      timestamp: Date.now(),
      direction: 'send',
      event,
      data
    });
    console.log(`[${this.name}] SEND: ${event}`, data);
  }

  recordReceive(event, data) {
    this.frames.push({
      timestamp: Date.now(),
      direction: 'receive',
      event,
      data
    });
    console.log(`[${this.name}] RECV: ${event}`, data);
  }

  getFrames() {
    return this.frames;
  }
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSmokeTest() {
  console.log(`\n[SMOKE] Starting smoke test against ${SERVER_URL}\n`);

  // Check server health
  console.log('[SMOKE] Checking server health...');
  try {
    const response = await new Promise((resolve, reject) => {
      const req = require('http').request(`${SERVER_URL}/health`, (res) => {
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    if (response !== 200) {
      console.error(`[SMOKE] Server health check failed: status ${response}`);
      process.exit(1);
    }
    console.log('[SMOKE] Server is healthy');
  } catch (err) {
    console.error('[SMOKE] Failed to reach server:', err.message);
    process.exit(1);
  }

  const managerRecorder = new FrameRecorder('MANAGER');
  const playerRecorder = new FrameRecorder('PLAYER');

  let gameId = '';
  let inviteCode = '';
  let success = false;

  try {
    // ========== PHASE 1: Manager creates game ==========
    console.log('\n[SMOKE] === PHASE 1: Manager creates game ===');
    const managerSocket = io(SERVER_URL, {
      auth: {
        clientId: 'test-manager-001'
      }
    });

    await new Promise((resolve, reject) => {
      managerSocket.on('connect', () => {
        console.log('[MANAGER] Connected to server');
        resolve();
      });
      managerSocket.on('connect_error', reject);
      setTimeout(() => reject(new Error('Manager connection timeout')), 5000);
    });

    // Manager creates game
    console.log('[MANAGER] Creating game...');
    managerRecorder.recordSend('game:create', 'quiz-001');

    const createGamePromise = new Promise((resolve, reject) => {
      managerSocket.once('manager:gameCreated', (data) => {
        managerRecorder.recordReceive('manager:gameCreated', data);
        console.log('[MANAGER] Game created:', data);
        gameId = data.gameId;
        inviteCode = data.inviteCode;
        resolve();
      });
      setTimeout(() => reject(new Error('Create game timeout')), 5000);
    });

    managerSocket.emit('game:create', 'quiz-001');
    await createGamePromise;
    await delay(500);

    // ========== PHASE 2: Player joins and logs in ==========
    console.log('\n[SMOKE] === PHASE 2: Player joins and logs in ===');
    const playerSocket = io(SERVER_URL, {
      auth: {
        clientId: 'test-player-001'
      }
    });

    await new Promise((resolve, reject) => {
      playerSocket.on('connect', () => {
        console.log('[PLAYER] Connected to server');
        resolve();
      });
      playerSocket.on('connect_error', reject);
      setTimeout(() => reject(new Error('Player connection timeout')), 5000);
    });

    // Player joins
    console.log('[PLAYER] Joining with invite code:', inviteCode);
    playerRecorder.recordSend('player:join', inviteCode);

    const joinPromise = new Promise((resolve, reject) => {
      playerSocket.once('game:successRoom', (data) => {
        playerRecorder.recordReceive('game:successRoom', data);
        console.log('[PLAYER] Successfully joined room:', data);
        resolve();
      });
      setTimeout(() => reject(new Error('Join timeout')), 5000);
    });

    playerSocket.emit('player:join', inviteCode);
    await joinPromise;
    await delay(500);

    // Player logs in
    console.log('[PLAYER] Logging in...');
    const loginPayload = {
      gameId,
      data: {
        username: 'Test Player',
        avatar: 'avatar-1'
      }
    };
    playerRecorder.recordSend('player:login', loginPayload);

    const loginPromise = new Promise((resolve, reject) => {
      playerSocket.once('game:successJoin', (data) => {
        playerRecorder.recordReceive('game:successJoin', data);
        console.log('[PLAYER] Successfully logged in:', data);
        resolve();
      });
      setTimeout(() => reject(new Error('Login timeout')), 5000);
    });

    playerSocket.emit('player:login', loginPayload);
    await loginPromise;
    await delay(500);

    // Manager receives new player notification
    const newPlayerPromise = new Promise((resolve) => {
      const handler = (data) => {
        managerRecorder.recordReceive('manager:newPlayer', data);
        console.log('[MANAGER] New player joined:', data);
        resolve();
      };
      managerSocket.once('manager:newPlayer', handler);
      setTimeout(() => {
        managerSocket.off('manager:newPlayer', handler);
        resolve();
      }, 3000);
    });
    await newPlayerPromise;

    // ========== PHASE 3: Manager starts game ==========
    console.log('\n[SMOKE] === PHASE 3: Manager starts game ===');
    const startGamePayload = { gameId };
    managerRecorder.recordSend('manager:startGame', startGamePayload);

    console.log('[MANAGER] Starting game...');
    managerSocket.emit('manager:startGame', startGamePayload);
    await delay(500);

    // Both should receive game:status SHOW_START
    const showStartPromise = Promise.all([
      new Promise((resolve, reject) => {
        const handler = (data) => {
          if (data.name === 'SHOW_START') {
            managerRecorder.recordReceive('game:status', data);
            console.log('[MANAGER] Received SHOW_START');
            resolve();
          }
        };
        managerSocket.on('game:status', handler);
        setTimeout(() => {
          managerSocket.off('game:status', handler);
          reject(new Error('SHOW_START timeout'));
        }, 5000);
      }),
      new Promise((resolve, reject) => {
        const handler = (data) => {
          if (data.name === 'SHOW_START') {
            playerRecorder.recordReceive('game:status', data);
            console.log('[PLAYER] Received SHOW_START');
            resolve();
          }
        };
        playerSocket.on('game:status', handler);
        setTimeout(() => {
          playerSocket.off('game:status', handler);
          reject(new Error('SHOW_START timeout (player)'));
        }, 5000);
      })
    ]);

    await showStartPromise;
    await delay(3500); // Wait for the 3-second lead time and question to be shown

    // ========== PHASE 4: Server shows question ==========
    console.log('\n[SMOKE] === PHASE 4: Server shows question ===');

    const showQuestionPromise = Promise.all([
      new Promise((resolve, reject) => {
        const handler = (data) => {
          if (data.name === 'SHOW_QUESTION') {
            managerRecorder.recordReceive('game:status', data);
            console.log('[MANAGER] Received SHOW_QUESTION');
            resolve(data);
          }
        };
        managerSocket.on('game:status', handler);
        setTimeout(() => {
          managerSocket.off('game:status', handler);
          reject(new Error('SHOW_QUESTION timeout'));
        }, 5000);
      }),
      new Promise((resolve, reject) => {
        const handler = (data) => {
          if (data.name === 'SHOW_QUESTION') {
            playerRecorder.recordReceive('game:status', data);
            console.log('[PLAYER] Received SHOW_QUESTION');
            resolve(data);
          }
        };
        playerSocket.on('game:status', handler);
        setTimeout(() => {
          playerSocket.off('game:status', handler);
          reject(new Error('SHOW_QUESTION timeout (player)'));
        }, 5000);
      })
    ]);

    const [managerQuestion, playerQuestion] = await showQuestionPromise;
    await delay(500);

    // Verify question matches fixture
    const expectedQuestion = fixtureQuiz.questions[0];
    if (managerQuestion.data.question !== expectedQuestion.question) {
      console.warn(`[SMOKE] Question mismatch: got "${managerQuestion.data.question}", expected "${expectedQuestion.question}"`);
    } else {
      console.log('[SMOKE] Question matches fixture');
    }

    // ========== PHASE 5: Server opens answer selection ==========
    console.log('\n[SMOKE] === PHASE 5: Server opens answer selection ===');

    const selectAnswerPromise = Promise.all([
      new Promise((resolve, reject) => {
        const handler = (data) => {
          if (data.name === 'SELECT_ANSWER') {
            managerRecorder.recordReceive('game:status', data);
            console.log('[MANAGER] Received SELECT_ANSWER');
            resolve();
          }
        };
        managerSocket.on('game:status', handler);
        setTimeout(() => {
          managerSocket.off('game:status', handler);
          reject(new Error('SELECT_ANSWER timeout'));
        }, 5000);
      }),
      new Promise((resolve, reject) => {
        const handler = (data) => {
          if (data.name === 'SELECT_ANSWER') {
            playerRecorder.recordReceive('game:status', data);
            console.log('[PLAYER] Received SELECT_ANSWER');
            resolve();
          }
        };
        playerSocket.on('game:status', handler);
        setTimeout(() => {
          playerSocket.off('game:status', handler);
          reject(new Error('SELECT_ANSWER timeout (player)'));
        }, 5000);
      })
    ]);

    await selectAnswerPromise;
    await delay(500);

    // ========== PHASE 6: Player submits answer ==========
    console.log('\n[SMOKE] === PHASE 6: Player submits answer ===');
    const answerPayload = {
      gameId,
      data: {
        answerKey: 1  // Correct answer (0-indexed)
      }
    };
    playerRecorder.recordSend('player:selectedAnswer', answerPayload);

    console.log('[PLAYER] Submitting answer:', answerPayload);
    playerSocket.emit('player:selectedAnswer', answerPayload);
    await delay(500);

    // Manager receives game:playerAnswer (count)
    const playerAnswerPromise = new Promise((resolve) => {
      const handler = (data) => {
        managerRecorder.recordReceive('game:playerAnswer', data);
        console.log('[MANAGER] Received player answer count:', data);
        resolve();
      };
      managerSocket.once('game:playerAnswer', handler);
      setTimeout(() => resolve(), 3000);
    });
    await playerAnswerPromise;

    // Both receive WAIT status
    const waitPromise = Promise.all([
      new Promise((resolve) => {
        const handler = (data) => {
          if (data.name === 'WAIT') {
            managerRecorder.recordReceive('game:status', data);
            console.log('[MANAGER] Received WAIT');
            resolve();
          }
        };
        managerSocket.on('game:status', handler);
        setTimeout(() => resolve(), 3000);
      }),
      new Promise((resolve) => {
        const handler = (data) => {
          if (data.name === 'WAIT') {
            playerRecorder.recordReceive('game:status', data);
            console.log('[PLAYER] Received WAIT');
            resolve();
          }
        };
        playerSocket.on('game:status', handler);
        setTimeout(() => resolve(), 3000);
      })
    ]);
    await waitPromise;
    await delay(500);

    // ========== PHASE 7: Manager reveals answer ==========
    console.log('\n[SMOKE] === PHASE 7: Manager reveals answer ===');
    const revealPayload = { gameId };
    managerRecorder.recordSend('manager:revealAnswer', revealPayload);

    console.log('[MANAGER] Revealing answer...');
    managerSocket.emit('manager:revealAnswer', revealPayload);
    await delay(500);

    // Both should receive startCooldown
    const startCooldownPromise = Promise.all([
      new Promise((resolve) => {
        const handler = () => {
          managerRecorder.recordReceive('game:startCooldown', []);
          console.log('[MANAGER] Received startCooldown');
          resolve();
        };
        managerSocket.once('game:startCooldown', handler);
        setTimeout(() => resolve(), 3000);
      }),
      new Promise((resolve) => {
        const handler = () => {
          playerRecorder.recordReceive('game:startCooldown', []);
          console.log('[PLAYER] Received startCooldown');
          resolve();
        };
        playerSocket.once('game:startCooldown', handler);
        setTimeout(() => resolve(), 3000);
      })
    ]);
    await startCooldownPromise;

    // Both should receive cooldown ticks
    console.log('[SMOKE] Waiting for cooldown ticks...');
    await new Promise((resolve) => {
      let managerCooldowns = 0;
      let playerCooldowns = 0;

      const managerHandler = (data) => {
        managerRecorder.recordReceive('game:cooldown', data);
        console.log('[MANAGER] Cooldown:', data);
        managerCooldowns++;
      };

      const playerHandler = (data) => {
        playerRecorder.recordReceive('game:cooldown', data);
        console.log('[PLAYER] Cooldown:', data);
        playerCooldowns++;
      };

      managerSocket.on('game:cooldown', managerHandler);
      playerSocket.on('game:cooldown', playerHandler);

      setTimeout(() => {
        managerSocket.off('game:cooldown', managerHandler);
        playerSocket.off('game:cooldown', playerHandler);
        console.log(`[SMOKE] Received ${managerCooldowns} manager cooldowns, ${playerCooldowns} player cooldowns`);
        resolve();
      }, 5000);
    });

    // ========== PHASE 8: Manager shows leaderboard ==========
    console.log('\n[SMOKE] === PHASE 8: Manager shows leaderboard ===');
    const leaderboardPayload = { gameId };
    managerRecorder.recordSend('manager:showLeaderboard', leaderboardPayload);

    console.log('[MANAGER] Requesting leaderboard...');
    managerSocket.emit('manager:showLeaderboard', leaderboardPayload);
    await delay(500);

    // Both should receive SHOW_LEADERBOARD
    const showLeaderboardPromise = Promise.all([
      new Promise((resolve, reject) => {
        const handler = (data) => {
          if (data.name === 'SHOW_LEADERBOARD') {
            managerRecorder.recordReceive('game:status', data);
            console.log('[MANAGER] Received SHOW_LEADERBOARD');
            resolve(data);
          }
        };
        managerSocket.on('game:status', handler);
        setTimeout(() => {
          managerSocket.off('game:status', handler);
          reject(new Error('SHOW_LEADERBOARD timeout'));
        }, 5000);
      }),
      new Promise((resolve, reject) => {
        const handler = (data) => {
          if (data.name === 'SHOW_LEADERBOARD') {
            playerRecorder.recordReceive('game:status', data);
            console.log('[PLAYER] Received SHOW_LEADERBOARD');
            resolve(data);
          }
        };
        playerSocket.on('game:status', handler);
        setTimeout(() => {
          playerSocket.off('game:status', handler);
          reject(new Error('SHOW_LEADERBOARD timeout (player)'));
        }, 5000);
      })
    ]);

    const [managerLeaderboard, playerLeaderboard] = await showLeaderboardPromise;

    // Verify leaderboard structure
    if (managerLeaderboard.data && managerLeaderboard.data.leaderboard) {
      const playerInLeaderboard = managerLeaderboard.data.leaderboard.find(p => p.username === 'Test Player');
      if (playerInLeaderboard && playerInLeaderboard.points > 0) {
        console.log(`[SMOKE] Player scored ${playerInLeaderboard.points} points - SUCCESS!`);
        success = true;
      } else {
        console.warn('[SMOKE] Player not found in leaderboard or scored 0 points');
      }
    } else {
      console.warn('[SMOKE] Invalid leaderboard structure');
    }

    await delay(500);

    // ========== Report Results ==========
    console.log('\n[SMOKE] === SMOKE TEST COMPLETE ===');
    console.log(`[SMOKE] Manager recorded ${managerRecorder.getFrames().length} frames`);
    console.log(`[SMOKE] Player recorded ${playerRecorder.getFrames().length} frames`);
    console.log(`[SMOKE] Full game flow: ${success ? 'SUCCESS' : 'INCOMPLETE'}`);

    // Disconnect
    managerSocket.disconnect();
    playerSocket.disconnect();

    // Save frame logs for debugging
    const managerLog = {
      recordedAt: new Date().toISOString(),
      frameCount: managerRecorder.getFrames().length,
      frames: managerRecorder.getFrames()
    };

    const playerLog = {
      recordedAt: new Date().toISOString(),
      frameCount: playerRecorder.getFrames().length,
      frames: playerRecorder.getFrames()
    };

    console.log('\n[SMOKE] Frame records:');
    console.log(JSON.stringify(managerLog, null, 2));
    console.log(JSON.stringify(playerLog, null, 2));

    process.exit(success ? 0 : 1);

  } catch (err) {
    console.error('\n[SMOKE] ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Run the smoke test
runSmokeTest().catch(err => {
  console.error('Uncaught error:', err);
  process.exit(1);
});
