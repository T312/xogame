"use strict";

const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const N = 15;
const WIN = 5;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const EMOTES = new Set(["😀", "😭", "😡", "🎉", "👍", "💖", "🤔", "🙈"]);
const ROOM_IDLE_MS = 10 * 60 * 1000; // phòng không ai kết nối quá 10 phút sẽ bị xóa
const CHAT_MAX_LEN = 200; // số ký tự tối đa mỗi tin nhắn
const CHAT_KEEP = 50; // số tin giữ lại trong phòng để người vào lại xem được
const CHAT_BURST = 5; // tối đa 5 tin / 5 giây mỗi người
const CHAT_WINDOW_MS = 5000;

const app = express();
const server = http.createServer(app);

app.disable("x-powered-by");
app.use(
  express.static(path.join(__dirname, "public"), {
    extensions: ["html"],
    setHeaders(res, filePath) {
      // sw.js và manifest không được cache cứng để app luôn nhận bản cập nhật
      if (/(sw\.js|manifest\.webmanifest)$/.test(filePath)) {
        res.setHeader("Cache-Control", "no-cache");
      }
      if (filePath.endsWith("sw.js")) res.setHeader("Service-Worker-Allowed", "/");
      if (filePath.endsWith(".webmanifest")) res.setHeader("Content-Type", "application/manifest+json");
      if (/[\\/]icons[\\/]/.test(filePath)) res.setHeader("Cache-Control", "public, max-age=604800");
    },
  })
);
app.get("/healthz", (_req, res) => res.send("ok"));
app.use((_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

/* ------------------------------------------------------------------ */
/* Phòng chơi (lưu trong RAM, không cần database)                      */
/* ------------------------------------------------------------------ */
const rooms = new Map();

const other = (s) => (s === "X" ? "O" : "X");
const emptyBoard = () => Array.from({ length: N }, () => Array(N).fill("."));
const inb = (r, c) => r >= 0 && c >= 0 && r < N && c < N;

function genCode() {
  for (let tries = 0; tries < 1000; tries++) {
    let code = "";
    for (let i = 0; i < 4; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(code)) return code;
  }
  return null;
}

function resetGame(room, swapSides) {
  room.board = emptyBoard();
  room.turn = "X";
  room.moves = 0;
  room.over = false;
  room.winner = null;
  room.line = null;
  room.last = null;
  room.rematch = [false, false];
  if (swapSides) {
    room.players.forEach((p) => { if (p) p.side = other(p.side); });
  }
}

function createRoom(ws) {
  const code = genCode();
  if (!code) return null;
  const room = {
    code,
    players: [{ token: crypto.randomUUID(), side: "X", ws }, null],
    scores: [0, 0, 0], // người 1, người 2, hòa
    chat: [], // tối đa CHAT_KEEP tin gần nhất, chỉ lưu trong RAM
    lastActive: Date.now(),
  };
  resetGame(room, false);
  rooms.set(code, room);
  return room;
}

function findWin(board, r, c, p) {
  for (const [dr, dc] of DIRS) {
    const line = [[r, c]];
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (inb(rr, cc) && board[rr][cc] === p) {
        line.push([rr, cc]);
        rr += dr * s;
        cc += dc * s;
      }
    }
    if (line.length >= WIN) return line;
  }
  return null;
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function viewFor(room, idx) {
  const me = room.players[idx];
  const opp = room.players[1 - idx];
  return {
    t: "state",
    code: room.code,
    you: me.side,
    turn: room.turn,
    board: room.board.map((row) => row.join("")),
    over: room.over,
    winner: room.winner,
    line: room.line,
    last: room.last,
    moves: room.moves,
    opponent: !!opp,
    oppOnline: !!(opp && opp.ws),
    scores: { you: room.scores[idx], opp: room.scores[1 - idx], draw: room.scores[2] },
    rematchYou: room.rematch[idx],
    rematchOpp: room.rematch[1 - idx],
  };
}

function broadcast(room) {
  room.players.forEach((p, idx) => {
    if (p && p.ws) send(p.ws, viewFor(room, idx));
  });
}

function closeRoom(room, notifyWs) {
  rooms.delete(room.code);
  room.players.forEach((p) => {
    if (!p || !p.ws) return;
    if (p.ws.ctx && p.ws.ctx.room === room) p.ws.ctx = null;
    if (p.ws !== notifyWs) send(p.ws, { t: "closed" });
  });
}

function leaveRoom(ws) {
  if (ws.ctx) closeRoom(ws.ctx.room, ws);
  ws.ctx = null;
}

/* ------------------------------------------------------------------ */
/* WebSocket                                                           */
/* ------------------------------------------------------------------ */
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 1024 });

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.ctx = null;
  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch (_) { return; }
    if (!m || typeof m.t !== "string") return;

    switch (m.t) {
      case "create": {
        leaveRoom(ws);
        const room = createRoom(ws);
        if (!room) return send(ws, { t: "error", code: "busy", msg: "Máy chủ đang bận, thử lại nhé" });
        ws.ctx = { room, idx: 0 };
        send(ws, { t: "joined", code: room.code, token: room.players[0].token, idx: 0 });
        broadcast(room);
        break;
      }

      case "join": {
        const code = String(m.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
        const room = rooms.get(code);
        if (!room) return send(ws, { t: "error", code: "no_room", msg: "Không tìm thấy phòng này 🥲" });

        let idx = -1;
        if (m.token) idx = room.players.findIndex((p) => p && p.token === m.token);

        if (idx >= 0) {
          // người chơi cũ kết nối lại
          const p = room.players[idx];
          if (p.ws && p.ws !== ws) {
            p.ws.ctx = null;
            try { p.ws.close(); } catch (_) { /* bỏ qua */ }
          }
          p.ws = ws;
        } else if (!room.players[1]) {
          if (ws.ctx && ws.ctx.room !== room) leaveRoom(ws);
          idx = 1;
          room.players[1] = { token: crypto.randomUUID(), side: "O", ws };
        } else {
          return send(ws, { t: "error", code: "full", msg: "Phòng này đã đủ 2 người rồi" });
        }

        ws.ctx = { room, idx };
        room.lastActive = Date.now();
        send(ws, { t: "joined", code: room.code, token: room.players[idx].token, idx });
        send(ws, { t: "chat_history", msgs: room.chat });
        broadcast(room);
        break;
      }

      case "move": {
        if (!ws.ctx) return;
        const { room, idx } = ws.ctx;
        const me = room.players[idx];
        const opp = room.players[1 - idx];
        if (!me || room.over || !opp) return;
        if (!opp.ws) return send(ws, { t: "error", code: "opp_off", msg: "Đối thủ đang mất kết nối, đợi chút nhé" });
        if (me.side !== room.turn) return;
        const r = m.r, c = m.c;
        if (!Number.isInteger(r) || !Number.isInteger(c) || !inb(r, c) || room.board[r][c] !== ".") return;

        room.board[r][c] = me.side;
        room.moves++;
        room.last = { r, c };
        room.lastActive = Date.now();

        const line = findWin(room.board, r, c, me.side);
        if (line) {
          room.over = true;
          room.winner = me.side;
          room.line = line;
          room.scores[idx]++;
        } else if (room.moves >= N * N) {
          room.over = true;
          room.winner = "draw";
          room.scores[2]++;
        } else {
          room.turn = other(me.side);
        }
        broadcast(room);
        break;
      }

      case "rematch": {
        if (!ws.ctx) return;
        const { room, idx } = ws.ctx;
        if (!room.over || !room.players[0] || !room.players[1]) return;
        room.rematch[idx] = true;
        if (room.rematch[0] && room.rematch[1]) resetGame(room, true);
        room.lastActive = Date.now();
        broadcast(room);
        break;
      }

      case "emote": {
        if (!ws.ctx || !EMOTES.has(m.e)) return;
        const { room, idx } = ws.ctx;
        const opp = room.players[1 - idx];
        if (opp && opp.ws) send(opp.ws, { t: "emote", e: m.e });
        break;
      }

      case "chat": {
        if (!ws.ctx) return;
        const { room, idx } = ws.ctx;
        // bỏ ký tự điều khiển, gộp khoảng trắng, cắt độ dài
        const text = String(m.text == null ? "" : m.text)
          .replace(/[\u0000-\u001F\u007F]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, CHAT_MAX_LEN);
        if (!text) return;

        const now = Date.now();
        ws.chatTimes = (ws.chatTimes || []).filter((t) => now - t < CHAT_WINDOW_MS);
        if (ws.chatTimes.length >= CHAT_BURST) {
          return send(ws, { t: "error", code: "slow", msg: "Gõ chậm lại một chút nhé 🐢" });
        }
        ws.chatTimes.push(now);

        const msg = { from: idx, text, ts: now };
        room.chat.push(msg);
        if (room.chat.length > CHAT_KEEP) room.chat.shift();
        room.lastActive = now;
        room.players.forEach((p) => {
          if (p && p.ws) send(p.ws, { t: "chat", ...msg });
        });
        break;
      }

      case "leave": {
        leaveRoom(ws);
        break;
      }

      default:
        break;
    }
  });

  ws.on("close", () => {
    const ctx = ws.ctx;
    if (!ctx) return;
    const { room, idx } = ctx;
    const p = room.players[idx];
    if (p && p.ws === ws) {
      p.ws = null;
      room.lastActive = Date.now();
      broadcast(room);
    }
  });

  ws.on("error", () => { /* bỏ qua lỗi socket lẻ */ });
});

// Giữ kết nối sống (Render/proxy hay ngắt kết nối im lặng) và phát hiện kết nối chết
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch (_) { /* bỏ qua */ }
  });
}, 25000);

// Dọn các phòng không còn ai kết nối
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyOnline = room.players.some((p) => p && p.ws);
    if (!anyOnline && now - room.lastActive > ROOM_IDLE_MS) rooms.delete(code);
  }
}, 60000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Caro game đang chạy tại cổng ${PORT}`);
});

module.exports = { server, rooms };
