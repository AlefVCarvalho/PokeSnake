(() => {
  "use strict";

  // ------------------------------------------------------------
  // Elementos da interface
  // ------------------------------------------------------------
  const $ = selector => document.querySelector(selector);

  const field = $("#field");
  const canvas = $("#game");
  const ctx = canvas.getContext("2d");

  const menuScreen = $("#menu-screen");
  const gameScreen = $("#game-screen");
  const tutorialScreen = $("#tutorial-screen");

  const characterList = $("#character-list");
  const stageEl = $("#stage");
  const stageImg = $("#stage-img");
  const stageName = $("#stage-name");
  const stageNote = $("#stage-note");
  const unlockHint = $("#unlock-hint");
  const hudSkin = $("#hud-skin");

  const scoreElement = $("#score");
  const hudBest = $("#hud-best");
  const bestElement = $("#best");
  const gamesElement = $("#games-played");
  const timerElement = $("#timer");
  const timerBox = $("#timer-box");
  const timeFill = $("#time-fill");
  const difficultyElement = $("#current-difficulty");

  const countdownEl = $("#countdown");
  const countdownLabel = $("#countdown-label");
  const countdownNumber = $("#countdown-number");

  const gameOverlay = $("#game-overlay");
  const overlayTitle = $("#overlay-title");
  const overlayMessage = $("#overlay-message");
  const overlayStats = $("#overlay-stats");
  const overlayScore = $("#overlay-score");
  const overlayBest = $("#overlay-best");
  const overlayBadge = $("#overlay-badge");
  const resumeButton = $("#resume-button");
  const menuStatus = $("#menu-status");

  // ------------------------------------------------------------
  // Configurações
  // ------------------------------------------------------------
  const STORAGE_KEY = "snake-game-data-v2";
  const SAVE_VERSION = 2;

  const TIME_BONUS = 20;          // segundos por fruta
  const COUNTDOWN_STEP = 0.8;     // segundos por número
  const COUNTDOWN_GO = 0.55;      // duração do "Vai!"
  const LOW_TIME = 30;            // alerta de pouco tempo

  const DIFFICULTIES = {
    easy:   { label: "Easy",   time: 600, speed: 7,  fruitPoints: 10, survivalPoints: 1 },
    medium: { label: "Medium", time: 480, speed: 9,  fruitPoints: 15, survivalPoints: 2 },
    hard:   { label: "Hard",   time: 300, speed: 12, fruitPoints: 20, survivalPoints: 3 }
  };

  // "hint" é a dica mostrada enquanto a cobra está bloqueada.
  // "color" é usado no palco do menu e como cor reserva
  // enquanto o sprite da cobra ainda não existe.
  const CHARACTERS = [
    { id: "ekans",    name: "Ekans",    unlock: 0,   color: "#a45be6" },
    { id: "onix",     name: "Onix",     unlock: 100, color: "#9aa3ad", hint: "Pesada como uma rocha" },
    { id: "serperior", name: "Serperior", unlock: 200, color: "#5bc46a", hint: "Altiva e elegante" },
    { id: "dratini",  name: "Dratini",  unlock: 300, color: "#5aa7ff", hint: "Calma como a água" },
    { id: "gyarados", name: "Gyarados", unlock: 400, color: "#3d6fcf", hint: "Fúria das profundezas" },
    { id: "rayquaza", name: "Rayquaza", unlock: 500, color: "#2fbf8a", hint: "Domina os céus" }
  ];

  const FRUIT_IMAGES = [
    "assets/fruits/fruit-1.png",
    "assets/fruits/fruit-2.png",
    "assets/fruits/fruit-3.png"
  ];

  // Cor (R,G,B) dos feixes de luz atrás de cada fruta.
  const FRUIT_TINTS = {
    "assets/fruits/fruit-1.png": "255, 216, 90",
    "assets/fruits/fruit-2.png": "130, 205, 255",
    "assets/fruits/fruit-3.png": "206, 160, 255"
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // ------------------------------------------------------------
  // Sprites
  // Remove fundos brancos opacos (assets provisórios) para que
  // as cobras fiquem recortadas. PNGs já transparentes passam
  // direto. Se o navegador bloquear a leitura dos pixels
  // (abrindo via file://), usa a imagem original.
  // ------------------------------------------------------------
  const sprites = new Map();
  let refreshQueued = false;

  function sprite(path) {
    let entry = sprites.get(path);
    if (entry) return entry;

    entry = { path, ready: false, failed: false, art: null, url: path };
    sprites.set(path, entry);

    const img = new Image();
    img.onload = () => {
      entry.art = img;
      // Só as cobras recebem recorte de fundo branco.
      try {
        if (!path.includes("/snakes/")) throw 0;
        const keyed = keyOutWhite(img);
        entry.art = keyed;
        entry.url = keyed.toDataURL();
      } catch {
        /* mantém a imagem original */
      }
      entry.ready = true;
      queueRefresh();
    };
    img.onerror = () => {
      entry.failed = true;
      queueRefresh();
    };
    img.src = path;

    return entry;
  }

  function keyOutWhite(img) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;

    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0);

    const image = g.getImageData(0, 0, w, h);
    const d = image.data;

    for (let i = 3; i < d.length; i += 4) {
      if (d[i] < 250) return c; // já tem transparência
    }

    const isWhite = p =>
      d[p * 4] >= 232 && d[p * 4 + 1] >= 232 && d[p * 4 + 2] >= 232;

    const seen = new Uint8Array(w * h);
    const stack = [];

    const push = p => {
      if (!seen[p] && isWhite(p)) {
        seen[p] = 1;
        stack.push(p);
      }
    };

    for (let x = 0; x < w; x++) {
      push(x);
      push((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      push(y * w);
      push(y * w + w - 1);
    }

    while (stack.length) {
      const p = stack.pop();
      d[p * 4 + 3] = 0;

      const x = p % w;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (p >= w) push(p - w);
      if (p < w * (h - 1)) push(p + w);
    }

    g.putImageData(image, 0, 0);
    return c;
  }

  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;

    requestAnimationFrame(() => {
      refreshQueued = false;
      if (!menuScreen.hidden) renderCharacters();
      applySkinToHud();
      if (!gameScreen.hidden) {
        renderBackdrop();
        draw();
      }
    });
  }

  // Caminho dos sprites: assets/snakes/<id>/<id>-<peça>.png
  // Peças: head, body, body-corner, tail.
  const SNAKE_PARTS = ["head", "body", "body-corner", "tail"];

  const snakePath = (id, part) =>
    `assets/snakes/${id}/${id}-${part}.png`;

  // "?" em pixels, usado no lugar das cobras ainda bloqueadas.
  let questionCache = null;

  function questionURL() {
    if (questionCache) return questionCache;

    const rows = [
      "01110", "10001", "00001", "00010", "00100", "00000", "00100"
    ];
    const c = document.createElement("canvas");
    c.width = c.height = 100;

    const g = c.getContext("2d");
    const cell = 10;
    const ox = (100 - 5 * cell) / 2;
    const oy = (100 - 7 * cell) / 2;

    g.fillStyle = "#4f8070";
    rows.forEach((row, y) => {
      [...row].forEach((bit, x) => {
        if (bit === "1") g.fillRect(ox + x * cell, oy + y * cell, cell, cell);
      });
    });

    questionCache = c.toDataURL();
    return questionCache;
  }

  // Silhueta usada quando o sprite de uma cobra ainda não existe.
  const placeholderCache = new Map();

  function placeholderURL(color) {
    if (placeholderCache.has(color)) return placeholderCache.get(color);

    const c = document.createElement("canvas");
    c.width = c.height = 100;

    const g = c.getContext("2d");
    g.fillStyle = "rgba(0,0,0,.35)";
    g.fillRect(10, 20, 80, 70);

    g.fillStyle = color;
    const blocks = [
      [30, 20, 40, 10], [20, 30, 60, 10], [20, 40, 70, 30],
      [30, 70, 50, 10], [40, 80, 30, 10]
    ];
    for (const [x, y, w, h] of blocks) g.fillRect(x, y, w, h);

    g.fillStyle = "#031011";
    g.fillRect(60, 42, 10, 10);

    const url = c.toDataURL();
    placeholderCache.set(color, url);
    return url;
  }

  function headURL(character) {
    // Cobras bloqueadas não revelam o sprite.
    if (!isUnlocked(character)) return questionURL();

    const entry = sprite(snakePath(character.id, "head"));
    if (entry.ready) return entry.url;
    if (entry.failed) return placeholderURL(character.color);
    return null;
  }

  function setImg(el, url) {
    if (url) {
      if (el.getAttribute("src") !== url) el.src = url;
      el.style.visibility = "visible";
    } else {
      el.style.visibility = "hidden";
    }
  }

  // ------------------------------------------------------------
  // Dados salvos
  // ------------------------------------------------------------
  function validInteger(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  function loadData() {
    const defaults = {
      best: 0,
      gamesPlayed: 0,
      totalScore: 0,
      selectedSkin: "ekans",
      difficulty: "easy"
    };

    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

      return {
        best: validInteger(data.best),
        gamesPlayed: validInteger(data.gamesPlayed),
        totalScore: validInteger(data.totalScore),
        selectedSkin:
          typeof data.selectedSkin === "string"
            ? data.selectedSkin
            : defaults.selectedSkin,
        difficulty: DIFFICULTIES[data.difficulty]
          ? data.difficulty
          : defaults.difficulty
      };
    } catch {
      return defaults;
    }
  }

  let saved = loadData();
  let selectedSkin = saved.selectedSkin;
  let previewSkin = null; // cobra bloqueada sendo espiada no menu
  let difficulty = saved.difficulty;

  function saveData() {
    saved.selectedSkin = selectedSkin;
    saved.difficulty = difficulty;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      menuStatus.textContent =
        "Não foi possível salvar no navegador. Exporte seus dados.";
    }

    updateHeader();
  }

  function updateHeader() {
    bestElement.textContent = saved.best;
    gamesElement.textContent = saved.gamesPlayed;
    hudBest.textContent = Math.max(saved.best, score);
  }

  function isUnlocked(character) {
    return saved.best >= character.unlock;
  }

  function selectedCharacter() {
    return (
      CHARACTERS.find(c => c.id === selectedSkin) || CHARACTERS[0]
    );
  }

  // ------------------------------------------------------------
  // Estado da partida
  // ------------------------------------------------------------
  let cols = 24;
  let rows = 16;

  let snake = [];
  let direction = { x: 1, y: 0 };
  let nextDirection = { x: 1, y: 0 };
  let fruit = null;

  let score = 0;
  let timeLeft = 0;
  let survivalRemainder = 0;
  let moveAccumulator = 0;

  let state = "menu"; // menu | countdown | running | paused | over
  let animationId = null;
  let lastTs = 0;
  let fxTime = 0;

  let cdElapsed = 0;
  let cdStep = -1;

  let effects = []; // partículas e textos flutuantes

  // ------------------------------------------------------------
  // Geometria: o campo ocupa toda a área abaixo do HUD.
  // O número de colunas/linhas é escolhido pela proporção da tela
  // para que as casas fiquem quadradas e nada saia da vista.
  // ------------------------------------------------------------
  const geo = { W: 0, H: 0, dpr: 1, ox: 0, oy: 0, sx: 1, sy: 1, s: 1 };
  let backdrop = null;

  function chooseGrid() {
    const rect = field.getBoundingClientRect();
    const W = Math.max(rect.width, 200);
    const H = Math.max(rect.height, 150);

    rows = clamp(Math.round(H / 52), 11, 18);
    cols = clamp(Math.round(W / (H / rows)), 16, 46);
  }

  function layout() {
    const rect = field.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    geo.W = rect.width;
    geo.H = rect.height;
    geo.dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    canvas.width = Math.round(geo.W * geo.dpr);
    canvas.height = Math.round(geo.H * geo.dpr);

    const sx = geo.W / cols;
    const sy = geo.H / rows;
    const ratio = sx / sy;

    if (ratio > 0.86 && ratio < 1.16) {
      // Preenche a área inteira; casas quase quadradas.
      geo.sx = sx;
      geo.sy = sy;
      geo.ox = geo.oy = 0;
    } else {
      // Janela mudou muito de formato: mantém casas quadradas.
      const s = Math.min(sx, sy);
      geo.sx = geo.sy = s;
      geo.ox = (geo.W - cols * s) / 2;
      geo.oy = (geo.H - rows * s) / 2;
    }

    geo.s = Math.min(geo.sx, geo.sy);

    renderBackdrop();
  }

  function renderBackdrop() {
    if (!geo.W) return;

    backdrop = document.createElement("canvas");
    backdrop.width = canvas.width;
    backdrop.height = canvas.height;

    const g = backdrop.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.scale(geo.dpr, geo.dpr);

    const bg = sprite("assets/background.png");
    const bx = geo.ox;
    const by = geo.oy;
    const bw = cols * geo.sx;
    const bh = rows * geo.sy;

    g.fillStyle = "#06191a";
    g.fillRect(0, 0, geo.W, geo.H);

    g.save();
    g.beginPath();
    g.rect(bx, by, bw, bh);
    g.clip();

    if (bg.ready || bg.art) {
      // Preenche o campo sem distorcer (equivalente a "cover").
      const src = bg.art;
      const iw = src.naturalWidth || src.width;
      const ih = src.naturalHeight || src.height;
      const k = Math.max(bw / iw, bh / ih);
      const dw = iw * k;
      const dh = ih * k;
      g.drawImage(src, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh);
    } else {
      g.fillStyle = "#18412f";
      g.fillRect(bx, by, bw, bh);
    }

    // Escurece levemente e desenha o tabuleiro em xadrez bem suave.
    g.fillStyle = "rgba(3, 16, 17, 0.16)";
    g.fillRect(bx, by, bw, bh);

    g.fillStyle = "rgba(255, 255, 255, 0.045)";
    for (let y = 0; y < rows; y++) {
      for (let x = (y % 2); x < cols; x += 2) {
        g.fillRect(bx + x * geo.sx, by + y * geo.sy, geo.sx, geo.sy);
      }
    }

    const vignette = g.createRadialGradient(
      geo.W / 2, geo.H / 2, Math.min(geo.W, geo.H) * 0.45,
      geo.W / 2, geo.H / 2, Math.max(geo.W, geo.H) * 0.75
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.42)");
    g.fillStyle = vignette;
    g.fillRect(bx, by, bw, bh);

    g.restore();

    // Parede: contorno fino para deixar claro onde a cobra bate.
    g.strokeStyle = "rgba(255, 194, 46, 0.55)";
    g.lineWidth = 2;
    g.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
  }

  // ------------------------------------------------------------
  // Menu
  // ------------------------------------------------------------
  function applySkinToHud() {
    setImg(hudSkin, headURL(selectedCharacter()));
  }

  function renderCharacters() {
    characterList.replaceChildren();

    for (const character of CHARACTERS) {
      const unlocked = isUnlocked(character);
      const selected = character.id === selectedSkin;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "slot";
      if (selected) button.classList.add("selected");
      if (!unlocked) button.classList.add("locked");

      button.setAttribute(
        "aria-label",
        unlocked
          ? `${character.name}${selected ? ", selecionada" : ""}`
          : `Cobra bloqueada. Recorde necessário: ${character.unlock}`
      );
      button.setAttribute("aria-pressed", String(selected));

      const image = document.createElement("img");
      image.alt = "";
      image.width = image.height = 100;
      setImg(image, headURL(character));
      button.append(image);

      if (!unlocked) {
        const lock = document.createElement("span");
        lock.className = "lock";
        lock.innerHTML =
          '<svg class="ico" aria-hidden="true"><use href="#i-lock"/></svg>' +
          character.unlock;
        button.append(lock);
      }

      button.addEventListener("click", () => {
        if (isUnlocked(character)) {
          selectedSkin = character.id;
          previewSkin = null;
          saveData();
        } else {
          previewSkin = character.id;
        }

        renderCharacters();
      });

      characterList.append(button);
    }

    renderStage();
    applySkinToHud();
  }

  function renderStage() {
    const character =
      CHARACTERS.find(c => c.id === previewSkin) || selectedCharacter();
    const unlocked = isUnlocked(character);

    stageEl.style.setProperty(
      "--skin",
      unlocked ? character.color : "#4f8070"
    );
    stageName.textContent = unlocked ? character.name : "???";
    stageImg.classList.remove("locked");
    setImg(stageImg, headURL(character));

    if (!unlocked) {
      stageNote.textContent =
        `${character.hint}. Libera com ${character.unlock} pontos de recorde.`;
    } else if (character.id === selectedSkin) {
      stageNote.textContent = "Cobra selecionada";
    } else {
      stageNote.textContent = "Desbloqueada";
    }

    const next = CHARACTERS.find(c => !isUnlocked(c));

    if (next) {
      const left = next.unlock - saved.best;
      unlockHint.textContent =
        `Próxima cobra com ${next.unlock} pontos de recorde (faltam ${left}).`;
    } else {
      unlockHint.textContent = "Todas as cobras foram desbloqueadas.";
    }
  }

  function showScreen(screen) {
    menuScreen.hidden = screen !== "menu";
    gameScreen.hidden = screen !== "game";
    tutorialScreen.hidden = screen !== "tutorial";
  }

  function openMenu() {
    stopLoop();
    state = "menu";

    gameOverlay.hidden = true;
    countdownEl.hidden = true;

    showScreen("menu");
    previewSkin = null;
    updateHeader();
    renderCharacters();

    menuStatus.textContent = "";
  }

  function openTutorial() {
    if (state === "countdown" || state === "running" || state === "paused") {
      return;
    }

    showScreen("tutorial");
  }

  // ------------------------------------------------------------
  // Partida
  // ------------------------------------------------------------
  function stopLoop() {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  function startGame() {
    const config = DIFFICULTIES[difficulty];

    stopLoop();
    showScreen("game");
    chooseGrid();
    layout();

    const row = Math.floor(rows / 2);
    snake = [
      { x: 5, y: row },
      { x: 4, y: row },
      { x: 3, y: row },
      { x: 2, y: row }
    ];

    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };

    score = 0;
    timeLeft = config.time;
    survivalRemainder = 0;
    moveAccumulator = 0;
    effects = [];

    fruit = placeFruit();

    gameOverlay.hidden = true;
    difficultyElement.textContent = config.label;

    applySkinToHud();
    updateScore();
    updateTimer();

    beginCountdown();
  }

  function placeFruit() {
    if (snake.length >= cols * rows) return null;

    let position;

    do {
      position = {
        x: Math.floor(Math.random() * cols),
        y: Math.floor(Math.random() * rows)
      };
    } while (
      snake.some(part => part.x === position.x && part.y === position.y)
    );

    return {
      ...position,
      image: FRUIT_IMAGES[Math.floor(Math.random() * FRUIT_IMAGES.length)]
    };
  }

  // ---------- Contagem inicial ----------

  function beginCountdown() {
    stopLoop();

    state = "countdown";
    cdElapsed = 0;
    cdStep = -1;
    lastTs = 0;

    countdownEl.hidden = false;
    gameOverlay.hidden = true;

    showCountdownStep(0);
    animationId = requestAnimationFrame(frame);
  }

  function showCountdownStep(step) {
    cdStep = step;

    const isGo = step >= 3;

    countdownLabel.textContent = isGo ? "" : "Prepare-se";
    countdownNumber.textContent = isGo ? "Vai!" : String(3 - step);

    countdownNumber.classList.remove("tick", "go");
    void countdownNumber.offsetWidth; // reinicia a animação
    countdownNumber.classList.add("tick");
    if (isGo) countdownNumber.classList.add("go");
  }

  function tickCountdown(delta) {
    cdElapsed += delta;

    const step = Math.min(3, Math.floor(cdElapsed / COUNTDOWN_STEP));
    if (step !== cdStep) showCountdownStep(step);

    if (cdElapsed >= COUNTDOWN_STEP * 3 + COUNTDOWN_GO) {
      countdownEl.hidden = true;
      state = "running";
      moveAccumulator = 0;
    }
  }

  // ---------- Ciclo principal ----------

  function frame(timestamp) {
    if (state !== "running" && state !== "countdown") return;

    if (!lastTs) lastTs = timestamp;

    // Limita grandes saltos após suspensão da aba.
    const delta = Math.min((timestamp - lastTs) / 1000, 0.1);
    lastTs = timestamp;

    fxTime += delta;

    if (state === "countdown") {
      tickCountdown(delta);
    } else {
      tickGame(delta);
    }

    updateEffects(delta);
    draw();

    if (state === "running" || state === "countdown") {
      animationId = requestAnimationFrame(frame);
    }
  }

  function tickGame(delta) {
    const config = DIFFICULTIES[difficulty];

    timeLeft -= delta;
    survivalRemainder += delta;

    // Bônus de sobrevivência a cada 5 segundos.
    while (survivalRemainder >= 5) {
      survivalRemainder -= 5;
      score += config.survivalPoints;
      updateScore();
    }

    updateTimer();

    if (timeLeft <= 0) {
      timeLeft = 0;
      updateTimer();
      endGame("O tempo acabou!");
      return;
    }

    moveAccumulator += delta;

    const moveInterval = 1 / config.speed;

    while (moveAccumulator >= moveInterval && state === "running") {
      moveAccumulator -= moveInterval;
      update();
    }
  }

  function update() {
    direction = { ...nextDirection };

    const head = {
      x: snake[0].x + direction.x,
      y: snake[0].y + direction.y
    };

    const eating = fruit && head.x === fruit.x && head.y === fruit.y;

    const hitWall =
      head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows;

    // Se não comer, a cauda vai sair desta posição.
    const bodyToCheck = eating ? snake : snake.slice(0, -1);

    const hitSelf = bodyToCheck.some(
      part => part.x === head.x && part.y === head.y
    );

    if (hitWall || hitSelf) {
      endGame("A cobra colidiu!");
      return;
    }

    snake.unshift(head);

    if (eating) {
      const config = DIFFICULTIES[difficulty];

      score += config.fruitPoints;
      timeLeft += TIME_BONUS;

      spawnPickup(fruit, config.fruitPoints);

      fruit = placeFruit();

      updateScore();
      updateTimer();
      bumpTimer();

      // Vitória se preencher todo o tabuleiro.
      if (!fruit) endGame("Você preencheu todo o tabuleiro!");
    } else {
      snake.pop();
    }
  }

  // ---------- Pontuação e cronômetro ----------

  function updateScore() {
    scoreElement.textContent = score;
    hudBest.textContent = Math.max(saved.best, score);
  }

  function updateTimer() {
    const seconds = Math.ceil(Math.max(0, timeLeft));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;

    timerElement.textContent =
      `${String(minutes).padStart(2, "0")}:` +
      `${String(remainder).padStart(2, "0")}`;

    const total = DIFFICULTIES[difficulty].time;
    timeFill.style.transform =
      `scaleX(${clamp(timeLeft / total, 0, 1)})`;

    timerBox.classList.toggle("low", timeLeft > 0 && timeLeft <= LOW_TIME);
  }

  function bumpTimer() {
    timerBox.classList.remove("bump");
    void timerBox.offsetWidth;
    timerBox.classList.add("bump");
  }

  function endGame(message) {
    if (state !== "running") return;

    stopLoop();
    state = "over";
    countdownEl.hidden = true;

    const previousBest = saved.best;

    saved.gamesPlayed += 1;
    saved.totalScore += score;
    saved.best = Math.max(saved.best, score);

    saveData();
    renderCharacters();

    const won = message === "Você preencheu todo o tabuleiro!";

    overlayTitle.textContent = won ? "Vitória!" : "Fim de jogo";
    overlayMessage.textContent = message;

    overlayScore.textContent = score;
    overlayBest.textContent = saved.best;
    overlayStats.hidden = false;
    overlayBadge.hidden = !(score > previousBest && score > 0);

    resumeButton.textContent = "Jogar novamente";
    gameOverlay.hidden = false;

    draw();
  }

  // ---------- Pausa ----------

  function pauseGame() {
    if (state !== "running" && state !== "countdown") return;

    stopLoop();
    state = "paused";
    countdownEl.hidden = true;

    overlayTitle.textContent = "Pausado";
    overlayMessage.textContent =
      "O cronômetro está parado. Uma contagem de 3 segundos antecede a retomada.";
    overlayStats.hidden = true;
    overlayBadge.hidden = true;

    resumeButton.textContent = "Continuar";
    gameOverlay.hidden = false;

    draw();
  }

  function resumeGame() {
    if (state === "over") {
      startGame();
      return;
    }

    if (state !== "paused") return;

    beginCountdown();
  }

  // ------------------------------------------------------------
  // Controles
  // ------------------------------------------------------------
  function setDirection(x, y) {
    if (state !== "running" && state !== "countdown") return;

    if (x === -direction.x && y === -direction.y) return;

    // Evita múltiplas inversões entre movimentos.
    if (x === -nextDirection.x && y === -nextDirection.y) return;

    nextDirection = { x, y };
  }

  document.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key.toLowerCase();

    const controlled = [
      "arrowup", "arrowdown", "arrowleft", "arrowright",
      "w", "a", "s", "d", " "
    ];

    if (controlled.includes(key) && !gameScreen.hidden) {
      event.preventDefault();
    }

    if (key === "f" && !event.repeat) {
      toggleFullscreen();
      return;
    }

    if (key === "escape") {
      if (state === "running" || state === "countdown") pauseGame();
      else if (state === "paused") resumeGame();
      return;
    }

    if (key === " " && !event.repeat) {
      if (state === "running" || state === "countdown") pauseGame();
      else if (state === "paused") resumeGame();
      return;
    }

    if (
      key === "enter" &&
      document.activeElement === document.body &&
      (state === "paused" || state === "over")
    ) {
      resumeGame();
      return;
    }

    switch (key) {
      case "arrowup":
      case "w":
        setDirection(0, -1);
        break;
      case "arrowdown":
      case "s":
        setDirection(0, 1);
        break;
      case "arrowleft":
      case "a":
        setDirection(-1, 0);
        break;
      case "arrowright":
      case "d":
        setDirection(1, 0);
        break;
    }
  });

  // Deslizar o dedo na tela (celular e tablet).
  let touchStart = null;

  field.addEventListener("touchstart", event => {
    const t = event.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  field.addEventListener("touchmove", event => {
    if (!touchStart) return;
    event.preventDefault();

    const t = event.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const threshold = Math.max(18, geo.s * 0.6);

    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;

    if (Math.abs(dx) > Math.abs(dy)) setDirection(Math.sign(dx), 0);
    else setDirection(0, Math.sign(dy));

    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: false });

  field.addEventListener("touchend", () => {
    touchStart = null;
  }, { passive: true });

  // Pausa automática quando o jogador sai da aba ou desvira o aparelho.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame();
  });

  const portraitPhone = window.matchMedia(
    "(orientation: portrait) and (pointer: coarse)"
  );
  portraitPhone.addEventListener("change", event => {
    if (event.matches) pauseGame();
  });

  // ------------------------------------------------------------
  // Tela cheia
  // ------------------------------------------------------------
  const fsButtons = document.querySelectorAll("[data-fs]");
  const canFullscreen =
    !!document.documentElement.requestFullscreen;

  function toggleFullscreen() {
    if (!canFullscreen) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  function updateFullscreenButtons() {
    const on = !!document.fullscreenElement;

    for (const button of fsButtons) {
      const icon = button.querySelector("use");
      const label = button.querySelector("span");

      icon.setAttribute("href", on ? "#i-shrink" : "#i-expand");
      if (label) label.textContent = on ? "Sair da tela cheia" : "Tela cheia";
      button.setAttribute(
        "aria-label",
        on ? "Sair da tela cheia" : "Tela cheia"
      );
    }
  }

  for (const button of fsButtons) {
    if (!canFullscreen) button.hidden = true;
    button.addEventListener("click", toggleFullscreen);
  }

  document.addEventListener("fullscreenchange", updateFullscreenButtons);

  // O campo acompanha qualquer mudança de tamanho da janela.
  new ResizeObserver(() => {
    if (gameScreen.hidden) return;
    layout();
    draw();
  }).observe(field);

  // ------------------------------------------------------------
  // Efeitos: partículas e pontos flutuantes
  // ------------------------------------------------------------
  function spawnPickup(item, points) {
    const tint = FRUIT_TINTS[item.image] || "255, 216, 90";
    const cx = item.x + 0.5;
    const cy = item.y + 0.5;

    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.4;
      const speed = 2.2 + Math.random() * 2.6;

      effects.push({
        kind: "spark",
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.55,
        age: 0,
        tint
      });
    }

    effects.push({
      kind: "text", text: `+${points}`, x: cx, y: cy - 0.3,
      vx: 0, vy: -1.6, life: 0.9, age: 0, tint: "255, 255, 255"
    });

    effects.push({
      kind: "text", text: `+${TIME_BONUS}s`, x: cx, y: cy + 0.55,
      vx: 0, vy: -1.2, life: 0.9, age: 0, tint: "255, 216, 90"
    });
  }

  function updateEffects(delta) {
    for (const e of effects) {
      e.age += delta;
      e.x += e.vx * delta;
      e.y += e.vy * delta;

      if (e.kind === "spark") {
        e.vx *= 0.94;
        e.vy *= 0.94;
      }
    }

    effects = effects.filter(e => e.age < e.life);
  }

  // ------------------------------------------------------------
  // Renderização
  // ------------------------------------------------------------
  function draw() {
    if (!geo.W) return;

    ctx.setTransform(geo.dpr, 0, 0, geo.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, geo.W, geo.H);

    if (backdrop) {
      ctx.drawImage(backdrop, 0, 0, geo.W, geo.H);
    }

    if (fruit) drawFruit();

    drawSnake();
    drawEffects();
  }

  const cellX = x => geo.ox + x * geo.sx;
  const cellY = y => geo.oy + y * geo.sy;

  // Feixes de luz giratórios atrás do item coletável.
  function drawGlow(cx, cy, tint) {
    const s = geo.s;
    const R = s * 2.9;
    const pulse = 0.5 + 0.5 * Math.sin(fxTime * 3.2);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(cx, cy);

    // Halo suave
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.62);
    halo.addColorStop(0, `rgba(${tint}, ${0.5 + pulse * 0.2})`);
    halo.addColorStop(1, `rgba(${tint}, 0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.62, 0, Math.PI * 2);
    ctx.fill();

    // Feixes principais, giram devagar
    const beams = ctx.createRadialGradient(0, 0, s * 0.15, 0, 0, R);
    beams.addColorStop(0, `rgba(${tint}, 0.85)`);
    beams.addColorStop(0.55, `rgba(${tint}, 0.28)`);
    beams.addColorStop(1, `rgba(${tint}, 0)`);

    rayLayer(beams, 8, 0.4, R, fxTime * 0.7);

    // Camada fina e clara em sentido oposto
    const fine = ctx.createRadialGradient(0, 0, s * 0.15, 0, 0, R * 0.8);
    fine.addColorStop(0, "rgba(255, 255, 255, 0.55)");
    fine.addColorStop(1, "rgba(255, 255, 255, 0)");

    rayLayer(fine, 12, 0.2, R * 0.8, -fxTime * 1.1 + 0.3);

    ctx.restore();
  }

  function rayLayer(fill, count, width, radius, rotation) {
    const step = (Math.PI * 2) / count;
    const half = (step * width) / 2;

    ctx.fillStyle = fill;
    ctx.beginPath();

    for (let i = 0; i < count; i++) {
      const a = rotation + i * step;
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, a - half, a + half);
      ctx.closePath();
    }

    ctx.fill();
  }

  function drawFruit() {
    const s = geo.s;
    const cx = cellX(fruit.x) + geo.sx / 2;
    const cy = cellY(fruit.y) + geo.sy / 2;
    const tint = FRUIT_TINTS[fruit.image] || "255, 216, 90";

    drawGlow(cx, cy, tint);

    const entry = sprite(fruit.image);
    const bob = 1.5 + 0.08 * Math.sin(fxTime * 5);
    const size = s * bob;

    if (entry.art) {
      ctx.drawImage(entry.art, cx - size / 2, cy - size / 2, size, size);
      return;
    }

    // Fruta reserva enquanto o sprite carrega.
    ctx.fillStyle = "#f26b5b";
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  const QUARTER = Math.PI / 2;

  // Vetor 90° no sentido horário (eixo y para baixo).
  const turnCW = d => ({ x: -d.y, y: d.x });
  const sameDir = (a, b) => a.x === b.x && a.y === b.y;

  // O sprite "body-corner" liga a base (baixo) e a direita.
  // Descobre quantos giros de 90° levam essas duas ligações até
  // as direções reais dos vizinhos.
  function cornerTurns(towardHead, towardTail) {
    let down = { x: 0, y: 1 };
    let right = { x: 1, y: 0 };

    for (let k = 0; k < 4; k++) {
      if (
        (sameDir(down, towardHead) && sameDir(right, towardTail)) ||
        (sameDir(down, towardTail) && sameDir(right, towardHead))
      ) {
        return k;
      }

      down = turnCW(down);
      right = turnCW(right);
    }

    return 0;
  }

  function drawSnake() {
    const character = selectedCharacter();
    const s = geo.s;

    snake.forEach((part, index) => {
      const isHead = index === 0;
      const isTail = index === snake.length - 1;

      const cx = cellX(part.x) + geo.sx / 2;
      const cy = cellY(part.y) + geo.sy / 2;

      // Direções (a partir desta casa) até os vizinhos.
      const towardHead = isHead
        ? null
        : {
            x: snake[index - 1].x - part.x,
            y: snake[index - 1].y - part.y
          };
      const towardTail = isTail
        ? null
        : {
            x: snake[index + 1].x - part.x,
            y: snake[index + 1].y - part.y
          };

      let type = isHead ? "head" : isTail ? "tail" : "body";
      let angle;

      if (isHead) {
        angle = Math.atan2(direction.y, direction.x);
      } else {
        // Frente da peça aponta para a cabeça.
        angle = Math.atan2(towardHead.y, towardHead.x);

        if (
          type === "body" &&
          towardHead.x !== -towardTail.x &&
          towardHead.y !== -towardTail.y
        ) {
          type = "body-corner";
          angle = cornerTurns(towardHead, towardTail) * QUARTER;
        }
      }

      let entry = sprite(snakePath(character.id, type));

      // Sem o sprite da curva, usa o corpo reto.
      if (type === "body-corner" && !entry.art) {
        angle = Math.atan2(towardHead.y, towardHead.x);
        entry = sprite(snakePath(character.id, "body"));
      }

      if (entry.art) {
        drawSprite(entry.art, cx, cy, s * 1.2, angle);
      } else {
        drawFallbackSegment(cx, cy, s, isHead, character.color);
      }
    });
  }

  function drawSprite(art, cx, cy, size, angle) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.drawImage(art, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function drawFallbackSegment(cx, cy, s, isHead, color) {
    const half = s / 2;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(cx - half + 1, cy - half + 1, s - 2, s - 2, s * 0.25);
    ctx.fill();

    if (!isHead) return;

    ctx.fillStyle = "#031011";

    for (const dy of [-0.2, 0.2]) {
      ctx.beginPath();
      ctx.arc(
        cx + direction.x * s * 0.15 - direction.y * dy * s,
        cy + direction.y * s * 0.15 + direction.x * dy * s,
        s * 0.07, 0, Math.PI * 2
      );
      ctx.fill();
    }
  }

  function drawEffects() {
    const s = geo.s;

    for (const e of effects) {
      const t = e.age / e.life;
      const x = cellX(e.x - 0.5) + geo.sx / 2;
      const y = cellY(e.y - 0.5) + geo.sy / 2;

      if (e.kind === "spark") {
        const size = Math.max(2, s * 0.14 * (1 - t * 0.6));
        ctx.fillStyle = `rgba(${e.tint}, ${1 - t})`;
        ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
      } else {
        const size = Math.round(s * 0.7);
        ctx.font = `400 ${size}px "Jersey 10", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(3, size * 0.22);
        ctx.strokeStyle = `rgba(3, 16, 17, ${0.9 * (1 - t * t)})`;
        ctx.strokeText(e.text, x, y);
        ctx.fillStyle = `rgba(${e.tint}, ${1 - t * t})`;
        ctx.fillText(e.text, x, y);
      }
    }
  }

  // ------------------------------------------------------------
  // Exportar e importar dados
  // ------------------------------------------------------------
  function exportJson() {
    const payload = {
      version: SAVE_VERSION,
      best: saved.best,
      gamesPlayed: saved.gamesPlayed,
      totalScore: saved.totalScore,
      selectedSkin,
      difficulty,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "snake-data.json";
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    menuStatus.textContent = "Dados exportados para snake-data.json.";
  }

  async function importJson(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const data = JSON.parse(await file.text());

      if (
        !data ||
        typeof data !== "object" ||
        !Number.isSafeInteger(data.best) || data.best < 0 ||
        !Number.isSafeInteger(data.gamesPlayed) || data.gamesPlayed < 0 ||
        !Number.isSafeInteger(data.totalScore) || data.totalScore < 0
      ) {
        throw new Error("Dados inválidos");
      }

      saved.best = data.best;
      saved.gamesPlayed = data.gamesPlayed;
      saved.totalScore = data.totalScore;

      const importedCharacter = CHARACTERS.find(
        c => c.id === data.selectedSkin
      );

      selectedSkin =
        importedCharacter && data.best >= importedCharacter.unlock
          ? importedCharacter.id
          : "ekans";

      difficulty = DIFFICULTIES[data.difficulty] ? data.difficulty : "easy";

      previewSkin = null;
      saveData();
      renderCharacters();
      updateHeader();

      const radio = document.querySelector(
        `input[name="difficulty"][value="${difficulty}"]`
      );

      if (radio) radio.checked = true;

      menuStatus.textContent = "Dados importados com sucesso.";
    } catch {
      menuStatus.textContent =
        "Arquivo inválido. Importe um JSON exportado pelo jogo.";
    } finally {
      event.target.value = "";
    }
  }

  // ------------------------------------------------------------
  // Eventos da interface
  // ------------------------------------------------------------
  $("#play-button").addEventListener("click", () => {
    const radio = document.querySelector('input[name="difficulty"]:checked');

    difficulty = radio?.value || "easy";
    saveData();

    // Em celulares, entra em tela cheia e trava na horizontal.
    if (canFullscreen && window.matchMedia("(pointer: coarse)").matches) {
      document.documentElement
        .requestFullscreen()
        .then(() => screen.orientation?.lock?.("landscape"))
        .catch(() => {});
    }

    startGame();
  });

  $("#tutorial-button").addEventListener("click", openTutorial);
  $("#tutorial-back-button").addEventListener("click", () => showScreen("menu"));
  $("#pause-button").addEventListener("click", pauseGame);
  resumeButton.addEventListener("click", resumeGame);
  $("#menu-button").addEventListener("click", openMenu);
  $("#export-button").addEventListener("click", exportJson);
  $("#import-input").addEventListener("change", importJson);

  // ------------------------------------------------------------
  // Inicialização
  // ------------------------------------------------------------
  const initialRadio = document.querySelector(
    `input[name="difficulty"][value="${difficulty}"]`
  );

  if (initialRadio) initialRadio.checked = true;

  // Evita iniciar com um personagem ainda bloqueado.
  if (!CHARACTERS.some(c => c.id === selectedSkin && isUnlocked(c))) {
    selectedSkin = "ekans";
  }

  // Pré-carrega tudo que o jogo usa.
  sprite("assets/background.png");
  FRUIT_IMAGES.forEach(sprite);
  for (const c of CHARACTERS) {
    for (const part of SNAKE_PARTS) sprite(snakePath(c.id, part));
  }

  document.fonts?.load('400 20px "Jersey 10"');

  updateHeader();
  updateFullscreenButtons();
  renderCharacters();
  showScreen("menu");
})();
