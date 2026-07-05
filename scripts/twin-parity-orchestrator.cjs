#!/usr/bin/env node
/**
 * Twin-parity orchestrator: runs identical flows against Node and Rust backends,
 * records frames, normalizes them, and produces a parity-report.json.
 *
 * Env vars:
 *   NODE_URL - Node backend URL (http://127.0.0.1:3310)
 *   RUST_URL - Rust backend URL (http://127.0.0.1:3311)
 *   OUTPUT_DIR - where to write outputs (./tmp/parity-output)
 *   QUIZ_ID - quiz ID to test with
 *   VERBOSE - enable detailed logging
 */

const fs = require("fs");
const path = require("path");
const { io } = require("socket.io-client");

const NODE_URL = process.env.NODE_URL || "http://127.0.0.1:3310";
const RUST_URL = process.env.RUST_URL || "http://127.0.0.1:3311";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "./tmp/parity-output";
const QUIZ_ID = process.env.QUIZ_ID || "example-qu--GZoYZWM";
const VERBOSE = process.env.VERBOSE === "1";

const log = (...args) => console.log("[orchestrator]", ...args);
const vlog = (...args) => VERBOSE && log(...args);

// ============================================================================
// Frame Recorder (reused from golden-frames)
// ============================================================================

const FIELDS_TO_NORMALIZE = [
  "gameId",
  "clientId",
  "socketId",
  "playerId",
  "inviteCode",
  "sessionId",
  "nonce",
  "id",
  "createdAt",
  "timestamp",
  "heartbeat",
  "connectionId",
  "playerToken",
  "token",
];

function normalizeFrame(data, depth = 0, visited = new Set()) {
  if (depth > 20) return "[MAX_DEPTH_EXCEEDED]";
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    // Normalize numeric invite codes (5-6 digits)
    if (/^[0-9]{5,6}$/.test(data)) return "[NORMALIZED]";
    return data;
  }

  if (typeof data === "number" || typeof data === "boolean") return data;

  if (Array.isArray(data)) {
    return data.map((item) => normalizeFrame(item, depth + 1, visited));
  }

  if (typeof data === "object") {
    if (visited.has(data)) return "[CIRCULAR_REFERENCE]";
    visited.add(data);

    const normalized = {};
    for (const [key, value] of Object.entries(data)) {
      const keyLower = key.toLowerCase();
      if (FIELDS_TO_NORMALIZE.some((f) => keyLower.includes(f.toLowerCase()))) {
        normalized[key] = "[NORMALIZED]";
      } else {
        normalized[key] = normalizeFrame(value, depth + 1, visited);
      }
    }
    return normalized;
  }

  return String(data);
}

class FrameRecorder {
  constructor(outputPath, serverUrl = "http://localhost:3001") {
    this.frames = [];
    this.socket = null;
    this.outputPath = outputPath;
    this.serverUrl = serverUrl;
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async connect(clientId) {
    return new Promise((resolve, reject) => {
      const socketPath = this.serverUrl.includes("3311") ? "/_rust" : "/ws";
      vlog(`Connecting to ${this.serverUrl} with path=${socketPath}`);

      this.socket = io(this.serverUrl, {
        path: socketPath,
        auth: clientId ? { clientId } : {},
        transports: ["websocket"],
        reconnection: false,
      });

      const originalEmit = this.socket.emit.bind(this.socket);
      this.socket.emit = (event, ...args) => {
        this.frames.push({
          timestamp: Date.now(),
          direction: "send",
          event,
          data: args.length === 1 ? args[0] : args,
        });
        return originalEmit(event, ...args);
      };

      this.socket.on("connect", () => {
        vlog(`Connected to ${this.serverUrl}`);
        resolve(this.socket);
      });

      this.socket.onAny((event, ...args) => {
        if (!event.startsWith("__")) {
          this.frames.push({
            timestamp: Date.now(),
            direction: "receive",
            event,
            data: args.length === 1 ? args[0] : args,
          });
        }
      });

      this.socket.on("connect_error", (error) => {
        reject(error);
      });

      setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, 5000);
    });
  }

  async emit(event, data, waitFor, timeout = 5000) {
    if (!this.socket) throw new Error("Socket not connected");

    return new Promise((resolve) => {
      if (waitFor) {
        const timer = setTimeout(() => {
          this.socket.off(waitFor, handler);
          resolve(null);
        }, timeout);

        const handler = (data) => {
          clearTimeout(timer);
          this.socket.off(waitFor, handler);
          resolve(data);
        };

        this.socket.on(waitFor, handler);
      }

      this.socket.emit(event, data);

      if (!waitFor) {
        setTimeout(() => resolve(null), 100);
      }
    });
  }

  async disconnect() {
    if (this.socket) {
      return new Promise((resolve) => {
        this.socket.disconnect();
        setTimeout(() => resolve(), 500);
      });
    }
  }

  save() {
    const normalized = this.frames.map((frame) => ({
      direction: frame.direction,
      event: frame.event,
      data: normalizeFrame(frame.data),
    }));

    const output = {
      recordedAt: new Date().toISOString(),
      frameCount: normalized.length,
      frames: normalized,
    };

    fs.writeFileSync(this.outputPath, JSON.stringify(output, null, 2));
    vlog(`Saved ${normalized.length} frames to ${this.outputPath}`);
  }

  getFrames() {
    return this.frames.map((frame) => ({
      direction: frame.direction,
      event: frame.event,
      data: normalizeFrame(frame.data),
    }));
  }
}

// ============================================================================
// Flows
// ============================================================================

async function runFlow1(url, outputPrefix, quizzId) {
  log(`Flow 1: Manager auth + game create on ${url}`);

  const mgr = new FrameRecorder(`${outputPrefix}-manager.json`, url);
  let gameId, inviteCode;

  try {
    await mgr.connect("flow1-manager");
    await mgr.emit("manager:auth", "PASSWORD");
    await new Promise((r) => setTimeout(r, 200));

    await mgr.emit("game:create", quizzId);
    await new Promise((r) => setTimeout(r, 300));

    // Extract game details from frames
    const frames = mgr.getFrames();
    const gameCreated = frames.find((f) => f.event === "manager:gameCreated");
    if (gameCreated && gameCreated.data) {
      gameId = gameCreated.data.gameId || "[UNKNOWN]";
      inviteCode = gameCreated.data.inviteCode || "[UNKNOWN]";
    }

    vlog(`  gameId=${gameId}, inviteCode=${inviteCode}`);
  } finally {
    await mgr.disconnect();
    mgr.save();
  }

  return { gameId, inviteCode };
}

async function runFlow2(url, outputPrefix, inviteCode, gameId) {
  log(`Flow 2: Player join + login on ${url}`);

  const player = new FrameRecorder(`${outputPrefix}-player.json`, url);

  try {
    await player.connect("flow2-player");
    await player.emit("player:join", inviteCode);
    await new Promise((r) => setTimeout(r, 200));

    await player.emit("player:login", {
      gameId,
      data: { username: "TestPlayer", avatar: "avatar1" },
    });
    await new Promise((r) => setTimeout(r, 200));
  } finally {
    await player.disconnect();
    player.save();
  }
}

async function runFlow3(url, outputPrefix, quizzId) {
  log(`Flow 3: Full game lifecycle on ${url}`);

  const mgr = new FrameRecorder(`${outputPrefix}-manager-full.json`, url);
  const player = new FrameRecorder(`${outputPrefix}-player-full.json`, url);

  let gameId, inviteCode;
  let gameFinished = false;

  try {
    // Manager creates game
    await mgr.connect("flow3-manager");
    await mgr.emit("manager:auth", "PASSWORD");
    await new Promise((r) => setTimeout(r, 200));
    await mgr.emit("game:create", quizzId);
    await new Promise((r) => setTimeout(r, 200));

    const mgrFrames = mgr.getFrames();
    const gameCreated = mgrFrames.find((f) => f.event === "manager:gameCreated");
    if (gameCreated && gameCreated.data) {
      gameId = gameCreated.data.gameId;
      inviteCode = gameCreated.data.inviteCode;
    }

    vlog(`  Game: ${gameId}, invite: ${inviteCode}`);

    // Player joins
    await player.connect("flow3-player");
    await player.emit("player:join", inviteCode);
    await new Promise((r) => setTimeout(r, 200));
    await player.emit("player:login", {
      gameId,
      data: { username: "Flow3Player", avatar: "avatar1" },
    });
    await new Promise((r) => setTimeout(r, 200));

    // Manager starts game
    await mgr.emit("manager:startGame", { gameId });
    await new Promise((r) => setTimeout(r, 300));

    // Wait for SHOW_QUESTION and player answers
    await new Promise((resolve) => {
      let qCount = 0;
      const checkMgrStatus = setInterval(() => {
        const frames = mgr.getFrames();
        const statusFrames = frames.filter((f) => f.event === "game:status");
        const lastStatus = statusFrames[statusFrames.length - 1];

        if (lastStatus && lastStatus.data && lastStatus.data.name === "SHOW_QUESTION") {
          qCount++;
          vlog(`  Manager sees SHOW_QUESTION #${qCount}`);

          // Player answers immediately
          player.emit("player:selectedAnswer", { gameId, data: { answerKey: 0 } });

          // Manager reveals after a short delay
          setTimeout(() => {
            mgr.emit("manager:revealAnswer", { gameId });
          }, 150);

          // Show leaderboard after another delay
          setTimeout(() => {
            mgr.emit("manager:showLeaderboard", { gameId });
          }, 200);
        } else if (lastStatus && lastStatus.data && lastStatus.data.name === "FINISHED") {
          vlog(`  Game FINISHED`);
          gameFinished = true;
          clearInterval(checkMgrStatus);
          resolve();
        }

        // Timeout after 30 seconds
        if (qCount >= 2) {
          clearInterval(checkMgrStatus);
          resolve();
        }
      }, 200);
    });

    await new Promise((r) => setTimeout(r, 500));
  } finally {
    await mgr.disconnect();
    await player.disconnect();
    mgr.save();
    player.save();
  }

  return { gameFinished };
}

// ============================================================================
// Diff & Report
// ============================================================================

function compareFrameSets(nodeDir, rustDir) {
  const divergences = [];

  // Compare files in nodeDir vs rustDir
  const nodeFiles = fs.readdirSync(nodeDir).filter((f) => f.endsWith(".json"));
  const rustFiles = fs.readdirSync(rustDir).filter((f) => f.endsWith(".json"));

  const allFiles = new Set([...nodeFiles, ...rustFiles]);

  for (const file of allFiles) {
    const nodePath = path.join(nodeDir, file);
    const rustPath = path.join(rustDir, file);

    if (!fs.existsSync(nodePath)) {
      divergences.push({
        type: "MISSING_FILE",
        file,
        severity: "WARN",
        missing_in: "node",
      });
      continue;
    }

    if (!fs.existsSync(rustPath)) {
      divergences.push({
        type: "MISSING_FILE",
        file,
        severity: "WARN",
        missing_in: "rust",
      });
      continue;
    }

    const nodeData = JSON.parse(fs.readFileSync(nodePath, "utf-8"));
    const rustData = JSON.parse(fs.readFileSync(rustPath, "utf-8"));

    // Compare event sequences
    const nodeEvents = (nodeData.frames || []).map((f) => f.event);
    const rustEvents = (rustData.frames || []).map((f) => f.event);

    if (JSON.stringify(nodeEvents) !== JSON.stringify(rustEvents)) {
      divergences.push({
        type: "EVENT_SEQUENCE_MISMATCH",
        file,
        severity: "FAIL",
        node_events: nodeEvents.slice(0, 10),
        rust_events: rustEvents.slice(0, 10),
      });
    }

    // Compare frame count
    if (nodeData.frameCount !== rustData.frameCount) {
      divergences.push({
        type: "FRAME_COUNT_MISMATCH",
        file,
        severity: "WARN",
        node_count: nodeData.frameCount,
        rust_count: rustData.frameCount,
      });
    }
  }

  return divergences;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  log("Starting twin-parity test harness");
  log(`NODE_URL=${NODE_URL}`);
  log(`RUST_URL=${RUST_URL}`);
  log(`QUIZ_ID=${QUIZ_ID}`);
  log(`OUTPUT_DIR=${OUTPUT_DIR}`);

  const nodeDir = path.join(OUTPUT_DIR, "node");
  const rustDir = path.join(OUTPUT_DIR, "rust");

  try {
    // Flow 1: Manager auth + game create
    log("=== RUNNING FLOW 1 ===");
    const flow1Node = await runFlow1(NODE_URL, path.join(nodeDir, "flow1"), QUIZ_ID);
    const flow1Rust = await runFlow1(RUST_URL, path.join(rustDir, "flow1"), QUIZ_ID);

    // Flow 2: Player join + login
    log("=== RUNNING FLOW 2 ===");
    await runFlow2(NODE_URL, path.join(nodeDir, "flow2"), flow1Node.inviteCode, flow1Node.gameId);
    await runFlow2(RUST_URL, path.join(rustDir, "flow2"), flow1Rust.inviteCode, flow1Rust.gameId);

    // Flow 3: Full game
    log("=== RUNNING FLOW 3 ===");
    const flow3Node = await runFlow3(NODE_URL, path.join(nodeDir, "flow3"), QUIZ_ID);
    const flow3Rust = await runFlow3(RUST_URL, path.join(rustDir, "flow3"), QUIZ_ID);

    log("=== COMPARING RESULTS ===");
    const divergences = compareFrameSets(nodeDir, rustDir);

    const report = {
      recordedAt: new Date().toISOString(),
      summary: {
        critical_pass: divergences.filter((d) => d.severity === "FAIL").length === 0,
        divergences: divergences.length,
        warnings: divergences.filter((d) => d.severity === "WARN").length,
        failures: divergences.filter((d) => d.severity === "FAIL").length,
      },
      divergences,
      flows: {
        flow1: { node: flow1Node, rust: flow1Rust },
        flow3: { node: flow3Node, rust: flow3Rust },
      },
    };

    const reportPath = path.join(OUTPUT_DIR, "parity-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    log(`Report written to ${reportPath}`);

    // Copy report to specified location
    if (process.env.OUTPUT_REPORT) {
      const outPath = path.resolve(process.env.OUTPUT_REPORT || "parity-report.json");
      fs.copyFileSync(reportPath, outPath);
      log(`Report also copied to ${outPath}`);
    }

    log("");
    log("========================================");
    log(`CRITICAL_PASS: ${report.summary.critical_pass}`);
    log(`DIVERGENCES: ${report.summary.divergences}`);
    log(`WARNINGS: ${report.summary.warnings}`);
    log(`FAILURES: ${report.summary.failures}`);
    log("========================================");

    process.exit(report.summary.critical_pass ? 0 : 1);
  } catch (error) {
    console.error("[orchestrator] FATAL ERROR:", error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
