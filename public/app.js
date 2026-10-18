(() => {
  "use strict";

  const N = 15;
  const WIN = 5;
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

  const $ = (id) => document.getElementById(id);
  const boardEl = $("board");
  const statusEl = $("status");
  const els = {
    mode: $("mode"), level: $("level"), side: $("side"),
    levelField: $("levelField"), sideField: $("sideField"),
    newBtn: $("newBtn"), undoBtn: $("undoBtn"), soundBtn: $("soundBtn"), resetBtn: $("resetBtn"),
    winsX: $("winsX"), winsO: $("winsO"), draws: $("draws"),
    nameX: $("nameX"), nameO: $("nameO"), scoreX: $("scoreX"), scoreO: $("scoreO"),
    modal: $("modal"), modalEmoji: $("modalEmoji"), modalTitle: $("modalTitle"), modalText: $("modalText"),
    modalNew: $("modalNew"), modalClose: $("modalClose"), confetti: $("confetti"),
    // online
    lobby: $("lobby"), roomInfo: $("roomInfo"), boardWrap: $("boardWrap"),
    createRoom: $("createRoom"), joinForm: $("joinForm"), roomCode: $("roomCode"),
    lobbyMsg: $("lobbyMsg"), roomCodeText: $("roomCodeText"),
    copyLink: $("copyLink"), leaveRoom: $("leaveRoom"),
    emotes: $("emotes"), emoteLayer: $("emoteLayer"),
    chat: $("chat"), chatToggle: $("chatToggle"), chatBadge: $("chatBadge"),
    chatBody: $("chatBody"), chatLog: $("chatLog"), chatForm: $("chatForm"), chatInput: $("chatInput"),
  };

  let board = [];
  let cells = [];
  let turn = "X";
  let over = false;
  let thinking = false;
  let history = [];
  let aiTimer = null;
  let soundOn = true;
  let scores = { X: 0, O: 0, D: 0 };

  const isOnline = () => els.mode.value === "online";
  const isAI = () => els.mode.value === "ai";

  /* ---------- Lưu trữ nhẹ trong trình duyệt ---------- */
  const STORE = "caro-cute-v1";
  const SESSION = "caro-online-session";

  function loadStore() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || "{}");
      if (s.scores) scores = { X: +s.scores.X || 0, O: +s.scores.O || 0, D: +s.scores.D || 0 };
      if (s.mode) els.mode.value = s.mode;
      if (s.level) els.level.value = s.level;
      if (s.side) els.side.value = s.side;
      if (typeof s.sound === "boolean") soundOn = s.sound;
    } catch (_) { /* bỏ qua */ }
    if (!els.mode.value) els.mode.value = "ai";
  }
  function saveStore() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        scores, mode: els.mode.value, level: els.level.value, side: els.side.value, sound: soundOn,
      }));
    } catch (_) { /* bỏ qua */ }
  }
  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION) || "null"); } catch (_) { return null; }
  }
  function setSession(s) {
    try { sessionStorage.setItem(SESSION, JSON.stringify(s)); } catch (_) { /* bỏ qua */ }
  }
  function clearSession() {
    try { sessionStorage.removeItem(SESSION); } catch (_) { /* bỏ qua */ }
  }

  /* ---------- Âm thanh ---------- */
  let audioCtx = null;
  function tone(freq, dur = 0.12, type = "sine", delay = 0, vol = 0.07) {
    if (!soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const t = audioCtx.currentTime + delay;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (_) { /* bỏ qua */ }
  }
  const sfxMove = (p) => tone(p === "X" ? 620 : 480, 0.11, "triangle");
  const sfxWin = () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, "sine", i * 0.12, 0.09));
  const sfxLose = () => [392, 330, 262].forEach((f, i) => tone(f, 0.28, "sine", i * 0.14, 0.07));
  const sfxDraw = () => [440, 440].forEach((f, i) => tone(f, 0.2, "sine", i * 0.18));
  const sfxPing = () => { tone(880, 0.1, "sine", 0, 0.06); tone(1175, 0.14, "sine", 0.1, 0.06); };

  /* ---------- Tiện ích bàn cờ ---------- */
  const inb = (r, c) => r >= 0 && c >= 0 && r < N && c < N;
  const other = (p) => (p === "X" ? "O" : "X");

  function markSvg(p) {
    if (p === "X") {
      return '<svg class="x" viewBox="0 0 100 100" aria-hidden="true"><path class="mark" d="M22 22 L78 78 M78 22 L22 78"/></svg>';
    }
    return '<svg class="o" viewBox="0 0 100 100" aria-hidden="true"><circle class="mark" cx="50" cy="50" r="29"/></svg>';
  }

  function buildBoard() {
    boardEl.innerHTML = "";
    cells = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cell";
        b.dataset.r = r;
        b.dataset.c = c;
        b.setAttribute("role", "gridcell");
        b.setAttribute("aria-label", `Hàng ${r + 1}, cột ${c + 1}`);
        cells.push(b);
        boardEl.appendChild(b);
      }
    }
  }
  const cellAt = (r, c) => cells[r * N + c];

  function resetBoardView() {
    cells.forEach((b, i) => {
      b.className = "cell";
      b.innerHTML = "";
      delete b.dataset.mark;
      b.setAttribute("aria-label", `Hàng ${Math.floor(i / N) + 1}, cột ${(i % N) + 1}`);
    });
  }

  function setStatus(html, cls = "") {
    statusEl.className = "status " + cls;
    statusEl.innerHTML = html;
  }

  /* ---------- Hộp thoại + confetti ---------- */
  function showModal(emoji, title, text) {
    els.modalEmoji.textContent = emoji;
    els.modalTitle.textContent = title;
    els.modalText.textContent = text;
    els.modal.hidden = false;
    els.modalNew.focus();
  }
  function hideModal() { els.modal.hidden = true; }

  function confetti() {
    const icons = ["🌸", "✨", "💖", "⭐", "🎀", "🍬", "🌈"];
    for (let i = 0; i < 36; i++) {
      const s = document.createElement("span");
      s.textContent = icons[(Math.random() * icons.length) | 0];
      s.style.left = Math.random() * 100 + "vw";
      s.style.animationDuration = 2.2 + Math.random() * 2.2 + "s";
      s.style.animationDelay = Math.random() * 0.8 + "s";
      s.style.fontSize = 1 + Math.random() * 1.2 + "rem";
      els.confetti.appendChild(s);
    }
    setTimeout(() => { els.confetti.innerHTML = ""; }, 6000);
  }

  /* =====================================================================
     CHẾ ĐỘ CHƠI TRÊN MỘT MÁY (với máy / 2 người)
     ===================================================================== */
  const isAiTurn = () => isAI() && turn === aiSide();
  const humanSide = () => els.side.value;
  const aiSide = () => other(humanSide());

  function names() {
    if (isAI()) {
      const h = humanSide();
      return { X: h === "X" ? "Bạn (X)" : "Máy (X)", O: h === "O" ? "Bạn (O)" : "Máy (O)" };
    }
    return { X: "Mèo (X)", O: "Thỏ (O)" };
  }

  function updateScoreUI() {
    if (isOnline()) {
      const st = onl.state;
      els.nameX.textContent = "Bạn";
      els.nameO.textContent = "Đối thủ";
      els.winsX.textContent = st ? st.scores.you : 0;
      els.winsO.textContent = st ? st.scores.opp : 0;
      els.draws.textContent = st ? st.scores.draw : 0;
      const playing = !!(st && st.opponent && !st.over);
      els.scoreX.classList.toggle("active", playing && st.turn === st.you);
      els.scoreO.classList.toggle("active", playing && st.turn !== st.you);
      return;
    }
    const n = names();
    els.nameX.textContent = n.X;
    els.nameO.textContent = n.O;
    els.winsX.textContent = scores.X;
    els.winsO.textContent = scores.O;
    els.draws.textContent = scores.D;
    els.scoreX.classList.toggle("active", !over && turn === "X");
    els.scoreO.classList.toggle("active", !over && turn === "O");
  }

  function refreshStatus() {
    updateScoreUI();
    if (isOnline() || over) return;
    const n = names();
    const dot = `<span class="dot ${turn.toLowerCase()}"></span>`;
    if (thinking) setStatus(`${dot} Máy đang suy nghĩ… 🤔`, "thinking");
    else if (isAI() && !isAiTurn()) setStatus(`${dot} Đến lượt bạn nè! ✨`);
    else setStatus(`${dot} Lượt của ${n[turn]}`);
  }

  function updateButtons() {
    const online = isOnline();
    els.levelField.classList.toggle("hidden", !isAI());
    els.sideField.classList.toggle("hidden", !isAI());
    els.undoBtn.hidden = online;
    els.resetBtn.hidden = online;
    els.soundBtn.classList.toggle("off", !soundOn);
    els.soundBtn.setAttribute("aria-pressed", String(soundOn));
    els.soundBtn.textContent = soundOn ? "🔔 Âm thanh" : "🔕 Âm thanh";

    if (online) {
      const st = onl.state;
      const canRematch = !!(st && st.over && st.opponent && !st.rematchYou);
      els.newBtn.disabled = !canRematch;
      els.newBtn.textContent = !st || !st.over
        ? "🎀 Chơi lại"
        : st.rematchYou ? "⏳ Đợi đối thủ…" : st.rematchOpp ? "🎀 Đồng ý chơi lại" : "🎀 Chơi lại";
      boardEl.classList.toggle("locked", !(st && st.opponent && !st.over && st.turn === st.you));
      return;
    }
    els.newBtn.disabled = false;
    els.newBtn.textContent = "🎀 Ván mới";
    els.undoBtn.disabled = history.length < 1 || thinking;
    boardEl.classList.toggle("locked", over || thinking || isAiTurn());
  }

  function newGame() {
    if (isOnline()) return;
    clearTimeout(aiTimer);
    thinking = false;
    over = false;
    turn = "X";
    history = [];
    board = Array.from({ length: N }, () => Array(N).fill(""));
    resetBoardView();
    hideModal();
    els.confetti.innerHTML = "";
    refreshStatus();
    updateButtons();
    if (isAiTurn()) scheduleAI();
  }

  function place(r, c, p) {
    board[r][c] = p;
    history.push({ r, c, p });
    const b = cellAt(r, c);
    b.classList.add("filled");
    b.innerHTML = markSvg(p);
    b.setAttribute("aria-label", `Hàng ${r + 1}, cột ${c + 1}: ${p}`);
    cells.forEach((x) => x.classList.remove("last"));
    b.classList.add("last");
    sfxMove(p);

    const line = findWin(r, c, p);
    if (line) return finish(p, line);
    if (history.length === N * N) return finish(null, null);

    turn = other(p);
    refreshStatus();
    updateButtons();
    if (isAiTurn()) scheduleAI();
  }

  function findWin(r, c, p) {
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

  function finish(winner, line) {
    over = true;
    thinking = false;
    if (winner) {
      scores[winner]++;
      line.forEach(([r, c]) => cellAt(r, c).classList.add("win"));
    } else {
      scores.D++;
    }
    saveStore();
    updateScoreUI();
    updateButtons();

    const n = names();
    let emoji, title, text;
    if (!winner) {
      emoji = "🤝"; title = "Hòa rồi!"; text = "Bàn cờ đã đầy, hai bên đều giỏi lắm!";
      sfxDraw();
      setStatus("🤝 Ván này hòa nhau!");
    } else if (isAI() && winner !== humanSide()) {
      emoji = "🤖"; title = "Máy thắng rồi"; text = "Đừng buồn, thử lại ván nữa nhé!";
      sfxLose();
      setStatus("🤖 Máy thắng! Thử lại nào 💪");
    } else {
      emoji = "🎉"; title = isAI() ? "Bạn thắng rồi!" : `${n[winner]} thắng!`;
      text = "Giỏi quá đi! Xếp được 5 quân liên tiếp rồi 🌟";
      sfxWin();
      confetti();
      setStatus(`🏆 ${isAI() ? "Bạn" : n[winner]} đã chiến thắng!`);
    }
    setTimeout(() => { if (over && !isOnline()) showModal(emoji, title, text); }, line ? 900 : 400);
  }

  /* ---------- AI ---------- */
  function scoreLine(count, open) {
    if (count >= 5) return 1e6;
    if (open === 0) return 0;
    switch (count) {
      case 4: return open === 2 ? 50000 : 5000;
      case 3: return open === 2 ? 5000 : 500;
      case 2: return open === 2 ? 500 : 50;
      default: return open === 2 ? 5 : 1;
    }
  }

  function evaluate(r, c, p) {
    let total = 0;
    for (const [dr, dc] of DIRS) {
      let count = 1, open = 0;
      for (const s of [1, -1]) {
        let rr = r + dr * s, cc = c + dc * s;
        while (inb(rr, cc) && board[rr][cc] === p) {
          count++;
          rr += dr * s;
          cc += dc * s;
        }
        if (inb(rr, cc) && board[rr][cc] === "") open++;
      }
      total += scoreLine(count, open);
    }
    return total;
  }

  function candidates() {
    const set = new Set();
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (!board[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const rr = r + dr, cc = c + dc;
            if (inb(rr, cc) && !board[rr][cc]) set.add(rr * N + cc);
          }
        }
      }
    }
    return [...set].map((k) => [Math.floor(k / N), k % N]);
  }

  function chooseMove() {
    const me = aiSide();
    const foe = other(me);
    if (history.length === 0) return [7, 7];
    const cand = candidates();
    if (!cand.length) return [7, 7];

    const level = els.level.value;
    const cfg = {
      easy: { def: 0.45, noise: 4000 },
      medium: { def: 0.95, noise: 350 },
      hard: { def: 1.08, noise: 0 },
    }[level];

    let best = null, bestScore = -Infinity;
    for (const [r, c] of cand) {
      const att = evaluate(r, c, me);
      const def = evaluate(r, c, foe);
      let score = att * 1.0 + def * cfg.def;
      if (att >= 1e6) score += 1e9;
      else if (def >= 1e6 && (level !== "easy" || Math.random() > 0.3)) score += 5e8;
      score += (14 - Math.abs(r - 7) - Math.abs(c - 7)) * 0.5;
      score += Math.random() * cfg.noise + Math.random();
      if (score > bestScore) { bestScore = score; best = [r, c]; }
    }
    return best;
  }

  function scheduleAI() {
    thinking = true;
    refreshStatus();
    updateButtons();
    clearTimeout(aiTimer);
    aiTimer = setTimeout(() => {
      if (over || isOnline()) return;
      const mv = chooseMove();
      thinking = false;
      place(mv[0], mv[1], aiSide());
    }, 450 + Math.random() * 350);
  }

  /* =====================================================================
     CHẾ ĐỘ ONLINE (WebSocket)
     ===================================================================== */
  const onl = {
    ws: null,
    state: null,
    code: null,
    idx: null,         // mình là người chơi số mấy trong phòng (0/1)
    queue: null,       // tin nhắn chờ gửi khi kết nối mở
    retry: 0,
    retryTimer: null,
    wantClose: false,
  };

  function wsUrl() {
    return (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";
  }

  function onlineConnect() {
    if (onl.ws && (onl.ws.readyState === 0 || onl.ws.readyState === 1)) return;
    onl.wantClose = false;
    let ws;
    try { ws = new WebSocket(wsUrl()); } catch (_) { return scheduleRetry(); }
    onl.ws = ws;

    ws.onopen = () => {
      onl.retry = 0;
      const q = onl.queue;
      onl.queue = null;
      if (q) ws.send(JSON.stringify(q));
      else {
        const s = getSession();
        if (s && s.code) ws.send(JSON.stringify({ t: "join", code: s.code, token: s.token }));
      }
    };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (_) { return; }
      handleMsg(m);
    };
    ws.onclose = () => {
      if (onl.ws !== ws) return;
      onl.ws = null;
      if (onl.wantClose || !isOnline()) return;
      if (onl.code || onl.queue) {
        setStatus("📡 Mất kết nối, đang thử lại…");
        scheduleRetry();
      }
    };
    ws.onerror = () => { /* onclose sẽ xử lý */ };
  }

  function scheduleRetry() {
    clearTimeout(onl.retryTimer);
    const delay = Math.min(1000 * 2 ** onl.retry, 8000);
    onl.retry++;
    onl.retryTimer = setTimeout(() => { if (isOnline()) onlineConnect(); }, delay);
  }

  function onlineSend(msg) {
    if (onl.ws && onl.ws.readyState === 1) onl.ws.send(JSON.stringify(msg));
    else {
      onl.queue = msg;
      onlineConnect();
    }
  }

  function onlineDisconnect() {
    clearTimeout(onl.retryTimer);
    onl.wantClose = true;
    onl.queue = null;
    if (onl.ws) { try { onl.ws.close(); } catch (_) { /* bỏ qua */ } }
    onl.ws = null;
  }

  function resetOnlineState() {
    onl.state = null;
    onl.code = null;
    onl.idx = null;
    clearSession();
    clearChat();
    resetBoardView();
    hideModal();
    els.confetti.innerHTML = "";
    try { history_replaceUrl(""); } catch (_) { /* bỏ qua */ }
  }

  function history_replaceUrl(code) {
    const url = location.pathname + (code ? "?room=" + code : "");
    window.history.replaceState(null, "", url);
  }

  function setLobbyMsg(t) { els.lobbyMsg.textContent = t || ""; }

  function syncOnlineUI() {
    const online = isOnline();
    const inRoom = online && !!onl.code;
    els.lobby.hidden = !(online && !inRoom);
    els.roomInfo.hidden = !inRoom;
    els.boardWrap.hidden = online && !inRoom;
    els.emotes.hidden = !(inRoom && onl.state && onl.state.opponent);
    els.chat.hidden = !(inRoom && onl.state && onl.state.opponent);
    els.roomCodeText.textContent = onl.code || "----";
  }

  function onlineStatusHtml(st) {
    const dot = `<span class="dot ${st.turn.toLowerCase()}"></span>`;
    if (!st.opponent) return `⏳ Đang chờ bạn bè vào phòng… Mã: <b>${st.code}</b>`;
    if (!st.oppOnline) return "📡 Đối thủ mất kết nối, đang chờ họ quay lại…";
    if (st.over) {
      let t;
      if (st.winner === "draw") t = "🤝 Ván này hòa nhau!";
      else if (st.winner === st.you) t = "🏆 Bạn đã chiến thắng!";
      else t = "😿 Đối thủ thắng rồi!";
      if (st.rematchOpp && !st.rematchYou) t += " · Đối thủ muốn chơi lại!";
      return t;
    }
    return st.turn === st.you
      ? `${dot} Đến lượt bạn nè! ✨ (bạn cầm ${st.you})`
      : `${dot} Đợi đối thủ đi… ⏳`;
  }

  function renderOnline(prev) {
    const st = onl.state;
    if (!st) return;

    // Bàn cờ
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const ch = st.board[r][c];
        const want = ch === "." ? "" : ch;
        const b = cellAt(r, c);
        if ((b.dataset.mark || "") !== want) {
          b.dataset.mark = want;
          b.innerHTML = want ? markSvg(want) : "";
          b.classList.toggle("filled", !!want);
          b.setAttribute("aria-label", `Hàng ${r + 1}, cột ${c + 1}${want ? ": " + want : ""}`);
        }
        b.classList.remove("last", "win");
      }
    }
    if (st.last) cellAt(st.last.r, st.last.c).classList.add("last");
    if (st.line) st.line.forEach(([r, c]) => cellAt(r, c).classList.add("win"));

    // Âm thanh khi có nước đi mới
    if (prev && st.moves > prev.moves && st.last) sfxMove(st.board[st.last.r][st.last.c]);
    if (prev && !prev.opponent && st.opponent) sfxPing();

    // Kết thúc ván / bắt đầu ván mới
    if (st.over && prev && !prev.over) onlineFinish(st);
    if (!st.over && prev && prev.over) {
      hideModal();
      els.confetti.innerHTML = "";
    }

    setStatus(onlineStatusHtml(st), st.turn === st.you && !st.over && st.opponent ? "" : "");
    updateScoreUI();
    updateButtons();
    syncOnlineUI();
  }

  function onlineFinish(st) {
    let emoji, title, text;
    if (st.winner === "draw") {
      emoji = "🤝"; title = "Hòa rồi!"; text = "Bàn cờ đã đầy, hai bạn đều giỏi lắm!";
      sfxDraw();
    } else if (st.winner === st.you) {
      emoji = "🎉"; title = "Bạn thắng rồi!"; text = "Giỏi quá đi! Xếp được 5 quân liên tiếp rồi 🌟";
      sfxWin();
      confetti();
    } else {
      emoji = "😿"; title = "Đối thủ thắng"; text = "Không sao đâu, đòi lại ván sau nhé!";
      sfxLose();
    }
    setTimeout(() => {
      if (isOnline() && onl.state && onl.state.over) showModal(emoji, title, text);
    }, st.line ? 900 : 400);
  }

  function handleMsg(m) {
    switch (m.t) {
      case "joined":
        onl.code = m.code;
        onl.idx = m.idx;
        setSession({ code: m.code, token: m.token });
        history_replaceUrl(m.code);
        setLobbyMsg("");
        syncOnlineUI();
        break;

      case "state": {
        const prev = onl.state;
        onl.state = m;
        onl.code = m.code;
        renderOnline(prev);
        break;
      }

      case "error":
        if (m.code === "no_room" || m.code === "full") {
          resetOnlineState();
          setLobbyMsg(m.msg);
          syncOnlineUI();
          setStatus("🌐 Chọn tạo phòng hoặc nhập mã để chơi cùng bạn bè");
          updateScoreUI();
          updateButtons();
        } else {
          setStatus("⚠️ " + (m.msg || "Có lỗi xảy ra"));
          setTimeout(() => { if (onl.state) setStatus(onlineStatusHtml(onl.state)); }, 2200);
        }
        break;

      case "closed":
        resetOnlineState();
        setLobbyMsg("Đối thủ đã rời phòng 🥺");
        syncOnlineUI();
        setStatus("🌐 Bạn có thể tạo phòng mới hoặc nhập mã phòng khác");
        updateScoreUI();
        updateButtons();
        break;

      case "chat_history":
        clearChat();
        (m.msgs || []).forEach((x) => addChat(x, true));
        break;

      case "chat":
        addChat(m, false);
        break;

      case "emote":
        showEmote(m.e, "opp");
        sfxPing();
        break;

      default:
        break;
    }
  }

  function showEmote(e, who) {
    const s = document.createElement("span");
    s.className = "emote-pop " + who;
    s.textContent = e;
    els.emoteLayer.appendChild(s);
    setTimeout(() => s.remove(), 2000);
  }

  /* ---------- Chat ---------- */
  let unread = 0;
  const chatOpen = () => els.chatToggle.getAttribute("aria-expanded") === "true";

  function updateBadge() {
    els.chatBadge.hidden = unread <= 0;
    els.chatBadge.textContent = unread > 9 ? "9+" : String(unread);
  }

  function clearChat() {
    els.chatLog.innerHTML = "";
    unread = 0;
    updateBadge();
    showChatEmpty();
  }

  function showChatEmpty() {
    if (els.chatLog.children.length) return;
    const e = document.createElement("div");
    e.className = "chat-empty";
    e.textContent = "Chưa có tin nhắn nào, chào bạn mình đi nè 👋";
    els.chatLog.appendChild(e);
  }

  function addChat(m, fromHistory) {
    if (!m || typeof m.text !== "string") return;
    const empty = els.chatLog.querySelector(".chat-empty");
    if (empty) empty.remove();

    const mine = m.from === onl.idx;
    const nearBottom = els.chatLog.scrollHeight - els.chatLog.scrollTop - els.chatLog.clientHeight < 60;

    const b = document.createElement("div");
    b.className = "bubble " + (mine ? "me" : "opp");
    const t = document.createElement("span");
    t.textContent = m.text; // textContent: an toàn, không chạy được HTML/JS
    const time = document.createElement("small");
    try {
      time.textContent = new Date(m.ts).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    } catch (_) { time.textContent = ""; }
    b.appendChild(t);
    b.appendChild(time);
    els.chatLog.appendChild(b);
    while (els.chatLog.children.length > 100) els.chatLog.removeChild(els.chatLog.firstChild);

    if (mine || nearBottom) els.chatLog.scrollTop = els.chatLog.scrollHeight;

    if (!mine && !fromHistory) {
      sfxPing();
      if (!chatOpen() || document.hidden) {
        unread++;
        updateBadge();
      }
    }
  }

  function enterOnline(joinCode) {
    clearTimeout(aiTimer);
    thinking = false;
    over = true;
    resetBoardView();
    hideModal();
    els.confetti.innerHTML = "";
    onl.state = null;

    const s = getSession();
    if (joinCode) {
      onl.code = joinCode;
      const token = s && s.code === joinCode ? s.token : undefined;
      onl.queue = { t: "join", code: joinCode, token };
      setStatus("🌐 Đang vào phòng…");
      onlineConnect();
    } else if (s && s.code) {
      onl.code = s.code;
      setStatus("🌐 Đang kết nối lại phòng…");
      onlineConnect();
    } else {
      onl.code = null;
      setStatus("🌐 Chọn tạo phòng hoặc nhập mã để chơi cùng bạn bè");
    }
    setLobbyMsg("");
    syncOnlineUI();
    updateScoreUI();
    updateButtons();
  }

  function leaveOnlineMode() {
    if (onl.ws && onl.ws.readyState === 1) onl.ws.send(JSON.stringify({ t: "leave" }));
    onlineDisconnect();
    resetOnlineState();
    syncOnlineUI();
  }

  function requestRematch() {
    const st = onl.state;
    if (st && st.over && st.opponent && !st.rematchYou) onlineSend({ t: "rematch" });
  }

  function inviteLink() {
    return location.origin + "/?room=" + (onl.code || "");
  }

  /* ---------- Sự kiện ---------- */
  boardEl.addEventListener("click", (e) => {
    const b = e.target.closest(".cell");
    if (!b) return;
    const r = +b.dataset.r, c = +b.dataset.c;

    if (isOnline()) {
      const st = onl.state;
      if (!st || !st.opponent || st.over || st.turn !== st.you) return;
      if (st.board[r][c] !== ".") return;
      onlineSend({ t: "move", r, c });
      return;
    }

    if (over || thinking || isAiTurn()) return;
    if (board[r][c]) return;
    place(r, c, turn);
  });

  boardEl.addEventListener("keydown", (e) => {
    const b = e.target.closest(".cell");
    if (!b) return;
    let r = +b.dataset.r, c = +b.dataset.c;
    if (e.key === "ArrowUp") r--;
    else if (e.key === "ArrowDown") r++;
    else if (e.key === "ArrowLeft") c--;
    else if (e.key === "ArrowRight") c++;
    else return;
    e.preventDefault();
    if (inb(r, c)) cellAt(r, c).focus();
  });

  els.newBtn.addEventListener("click", () => (isOnline() ? requestRematch() : newGame()));
  els.modalNew.addEventListener("click", () => {
    if (isOnline()) { requestRematch(); hideModal(); } else newGame();
  });
  els.modalClose.addEventListener("click", hideModal);
  els.modal.addEventListener("click", (e) => { if (e.target === els.modal) hideModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideModal(); });

  els.undoBtn.addEventListener("click", () => {
    if (isOnline() || thinking || !history.length) return;
    clearTimeout(aiTimer);
    if (over) {
      const last = history[history.length - 1];
      const hadWin = cells.some((c) => c.classList.contains("win"));
      if (hadWin) scores[last.p] = Math.max(0, scores[last.p] - 1);
      else scores.D = Math.max(0, scores.D - 1);
      saveStore();
    }
    let steps = 1;
    if (isAI()) {
      const last = history[history.length - 1];
      steps = last.p === aiSide() && history.length >= 2 ? 2 : 1;
    }
    for (let i = 0; i < steps && history.length; i++) {
      const m = history.pop();
      board[m.r][m.c] = "";
      const b = cellAt(m.r, m.c);
      b.className = "cell";
      b.innerHTML = "";
      b.setAttribute("aria-label", `Hàng ${m.r + 1}, cột ${m.c + 1}`);
      turn = m.p;
    }
    cells.forEach((x) => x.classList.remove("win", "last"));
    const lastMove = history[history.length - 1];
    if (lastMove) cellAt(lastMove.r, lastMove.c).classList.add("last");
    over = false;
    hideModal();
    els.confetti.innerHTML = "";
    refreshStatus();
    updateButtons();
    if (isAiTurn()) scheduleAI();
  });

  els.soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    saveStore();
    updateButtons();
    if (soundOn) tone(660, 0.1, "triangle");
  });

  els.resetBtn.addEventListener("click", () => {
    scores = { X: 0, O: 0, D: 0 };
    saveStore();
    updateScoreUI();
  });

  // Đổi chế độ
  els.mode.addEventListener("change", () => {
    saveStore();
    if (isOnline()) {
      enterOnline();
    } else {
      leaveOnlineMode();
      newGame();
      syncOnlineUI();
    }
  });
  [els.level, els.side].forEach((s) =>
    s.addEventListener("change", () => {
      saveStore();
      newGame();
    })
  );

  // Online: tạo phòng / vào phòng / link / emote
  els.createRoom.addEventListener("click", () => {
    setLobbyMsg("");
    setStatus("🌐 Đang tạo phòng…");
    onlineSend({ t: "create" });
  });

  els.roomCode.addEventListener("input", () => {
    els.roomCode.value = els.roomCode.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });

  els.joinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = els.roomCode.value.trim().toUpperCase();
    if (code.length < 4) {
      setLobbyMsg("Mã phòng gồm 4 ký tự nhé 🔤");
      return;
    }
    setLobbyMsg("");
    setStatus("🌐 Đang vào phòng…");
    onlineSend({ t: "join", code });
  });

  els.copyLink.addEventListener("click", async () => {
    const link = inviteLink();
    const old = els.copyLink.textContent;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(link);
      } else {
        const ta = document.createElement("textarea");
        ta.value = link;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      els.copyLink.textContent = "✅ Đã chép link!";
    } catch (_) {
      els.copyLink.textContent = "Mã: " + (onl.code || "");
      window.prompt("Gửi link này cho bạn bè nhé:", link);
    }
    setTimeout(() => { els.copyLink.textContent = old; }, 1800);
  });

  els.leaveRoom.addEventListener("click", () => {
    leaveOnlineMode();
    setLobbyMsg("");
    setStatus("🌐 Chọn tạo phòng hoặc nhập mã để chơi cùng bạn bè");
    syncOnlineUI();
    updateScoreUI();
    updateButtons();
  });

  els.emotes.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-e]");
    if (!btn || !onl.state || !onl.state.opponent) return;
    onlineSend({ t: "emote", e: btn.dataset.e });
    showEmote(btn.dataset.e, "me");
  });

  els.chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = els.chatInput.value.trim();
    if (!text || !onl.state || !onl.state.opponent) return;
    onlineSend({ t: "chat", text });
    els.chatInput.value = "";
    els.chatInput.focus();
  });

  els.chatToggle.addEventListener("click", () => {
    const open = !chatOpen();
    els.chatToggle.setAttribute("aria-expanded", String(open));
    els.chatBody.hidden = !open;
    if (open) {
      unread = 0;
      updateBadge();
      els.chatLog.scrollTop = els.chatLog.scrollHeight;
    }
  });

  // Quay lại tab (điện thoại hay ngắt kết nối khi chạy nền) -> nối lại
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isOnline() && onl.code && !onl.ws) {
      onl.retry = 0;
      onlineConnect();
    }
    if (document.visibilityState === "visible" && chatOpen() && unread) {
      unread = 0;
      updateBadge();
    }
  });

  /* ---------- Cài app (PWA) ---------- */
  const installBtn = $("installBtn");
  const installHint = $("installHint");
  const standalone =
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  const isIOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let deferredInstall = null;

  if (!standalone) {
    // iPhone/iPad không có hộp thoại cài tự động -> hiện hướng dẫn
    if (isIOS) installBtn.hidden = false;

    // Android / Chrome: có hộp thoại cài chính thức
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstall = e;
      installBtn.hidden = false;
    });

    installBtn.addEventListener("click", async () => {
      if (deferredInstall) {
        deferredInstall.prompt();
        try { await deferredInstall.userChoice; } catch (_) { /* bỏ qua */ }
        deferredInstall = null;
        installBtn.hidden = true;
      } else {
        installHint.hidden = !installHint.hidden;
      }
    });
  }
  window.addEventListener("appinstalled", () => {
    installBtn.hidden = true;
    installHint.hidden = true;
  });

  // Service worker (cần HTTPS hoặc localhost)
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* bỏ qua */ });
    });
  }

  /* ---------- Khởi động ---------- */
  loadStore();
  buildBoard();
  showChatEmpty();

  const params = new URLSearchParams(location.search);
  const roomParam = (params.get("room") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  if (roomParam.length === 4) {
    els.mode.value = "online";
    enterOnline(roomParam);
  } else if (isOnline()) {
    enterOnline();
  } else {
    newGame();
    syncOnlineUI();
  }
})();
