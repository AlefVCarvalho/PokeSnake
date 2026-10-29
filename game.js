
(() => {
  "use strict";

  // Elementos da interface
  const $ = selector => document.querySelector(selector);

  const canvas = $("#game");
  const ctx = canvas.getContext("2d");

  const menuScreen = $("#menu-screen");
  const gameScreen = $("#game-screen");
  const tutorialScreen = $("#tutorial-screen");

  const characterList = $("#character-list");
  const scoreElement = $("#score");
  const bestElement = $("#best");
  const gamesElement = $("#games-played");
  const timerElement = $("#timer");
  const difficultyElement = $("#current-difficulty");

  const gameOverlay = $("#game-overlay");
  const overlayTitle = $("#overlay-title");
  const overlayMessage = $("#overlay-message");
  const resumeButton = $("#resume-button");
  const menuStatus = $("#menu-status");

  // Configurações
  const STORAGE_KEY = "snake-game-data-v2";
  const CELLS = 24;
  const CELL = canvas.width / CELLS;
  const SAVE_VERSION = 2;

  const DIFFICULTIES = {
    easy: {
      label: "Easy",
      time: 600,
      speed: 7,
      fruitPoints: 10,
      survivalPoints: 1
    },
    medium: {
      label: "Medium",
      time: 480,
      speed: 9,
      fruitPoints: 15,
      survivalPoints: 2
    },
    hard: {
      label: "Hard",
      time: 300,
      speed: 12,
      fruitPoints: 20,
      survivalPoints: 3
    }
  };

  const CHARACTERS = [
    { id: "ekans", name: "Ekans", unlock: 0 },
    { id: "onix", name: "Onix", unlock: 100 },
    { id: "serperior", name: "Serperior", unlock: 200 },
    { id: "dratini", name: "Dratini", unlock: 300 },
    { id: "gyarados", name: "Gyarados", unlock: 400 },
    { id: "rayquaza", name: "Rayquaza", unlock: 500 }
  ];

  const FRUIT_IMAGES = [
    "assets/fruits/fruit-1.png",
    "assets/fruits/fruit-2.png",
    "assets/fruits/fruit-3.png"
  ];

  const background = new Image();
  background.src = "assets/background.png";
  background.onload = draw;

  const imageCache = new Map();

  function getImage(path) {
    if (!imageCache.has(path)) {
      const image = new Image();
      image.src = path;
      image.onload = draw;
      imageCache.set(path, image);
    }

    return imageCache.get(path);
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
      const data = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || "{}"
      );

      return {
        best: validInteger(data.best),
        gamesPlayed: validInteger(data.gamesPlayed),
        totalScore: validInteger(data.totalScore),
        selectedSkin:
          typeof data.selectedSkin === "string"
            ? data.selectedSkin
            : defaults.selectedSkin,
        difficulty:
          DIFFICULTIES[data.difficulty]
            ? data.difficulty
            : defaults.difficulty
      };
    } catch {
      return defaults;
    }
  }

  function validInteger(value) {
    return Number.isSafeInteger(value) && value >= 0
      ? value
      : 0;
  }

  let saved = loadData();

  let selectedSkin = saved.selectedSkin;
  let difficulty = saved.difficulty;

  let snake = [];
  let direction = { x: 1, y: 0 };
  let nextDirection = { x: 1, y: 0 };
  let fruit = null;

  let score = 0;
  let timeLeft = 0;
  let elapsedSeconds = 0;
  let survivalRemainder = 0;
  let moveAccumulator = 0;

  let state = "menu";
  let animationId = null;
  let lastFrame = 0;

  // Persistência
  function saveData() {
    saved.selectedSkin = selectedSkin;
    saved.difficulty = difficulty;

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(saved)
      );
    } catch {
      menuStatus.textContent =
        "Não foi possível salvar no navegador. Exporte seus dados.";
    }

    updateHeader();
  }

  function updateHeader() {
    bestElement.textContent = saved.best;
    gamesElement.textContent = saved.gamesPlayed;
  }

  function isUnlocked(character) {
    return saved.best >= character.unlock;
  }

  function selectedCharacter() {
    return CHARACTERS.find(
      character => character.id === selectedSkin
    ) || CHARACTERS[0];
  }

  // Menu de personagens
  function renderCharacters() {
    characterList.replaceChildren();

    for (const character of CHARACTERS) {
      const unlocked = isUnlocked(character);
      const selected = character.id === selectedSkin;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "character-card";

      if (selected) button.classList.add("selected");
      if (!unlocked) button.classList.add("locked");

      button.disabled = !unlocked;

      const image = document.createElement("img");
      image.src =
        `assets/snakes/${character.id}-head.png`;
      image.alt = character.name;
      image.onerror = () => {
        image.style.display = "none";
      };

      const name = document.createElement("strong");
      name.textContent = character.name;

      const description = document.createElement("small");
      description.textContent = unlocked
        ? selected
          ? "Selecionado"
          : "Desbloqueado"
        : `Recorde necessário: ${character.unlock}`;

      button.append(image, name, description);

      if (!unlocked) {
        const lockLabel = document.createElement("small");
        lockLabel.className = "lock-label";
        lockLabel.textContent = "Bloqueado";
        button.append(lockLabel);
      }

      button.addEventListener("click", () => {
        if (!isUnlocked(character)) return;

        selectedSkin = character.id;
        saveData();
        renderCharacters();
      });

      characterList.append(button);
    }
  }

  function showScreen(screen) {
    menuScreen.hidden = screen !== "menu";
    gameScreen.hidden = screen !== "game";
    tutorialScreen.hidden = screen !== "tutorial";
  }

  function openMenu() {
    cancelAnimationFrame(animationId);
    animationId = null;
    state = "menu";

    gameOverlay.hidden = true;

    showScreen("menu");
    updateHeader();
    renderCharacters();

    menuStatus.textContent = "";
  }

  function openTutorial() {
    if (state === "running" || state === "paused") {
      return;
    }

    showScreen("tutorial");
  }

  // Configuração da partida
  function startGame() {
    const config = DIFFICULTIES[difficulty];

    cancelAnimationFrame(animationId);

    snake = [
      { x: 8, y: 12 },
      { x: 7, y: 12 },
      { x: 6, y: 12 },
      { x: 5, y: 12 }
    ];

    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };

    score = 0;
    timeLeft = config.time;
    elapsedSeconds = 0;
    survivalRemainder = 0;
    moveAccumulator = 0;
    lastFrame = 0;

    fruit = placeFruit();

    state = "running";

    showScreen("game");
    gameOverlay.hidden = true;

    difficultyElement.textContent = config.label;

    updateScore();
    updateTimer();
    draw();

    animationId = requestAnimationFrame(loop);
  }

  function placeFruit() {
    if (snake.length >= CELLS * CELLS) {
      return null;
    }

    let position;

    do {
      position = {
        x: Math.floor(Math.random() * CELLS),
        y: Math.floor(Math.random() * CELLS)
      };
    } while (
      snake.some(
        part =>
          part.x === position.x &&
          part.y === position.y
      )
    );

    return {
      ...position,
      image: FRUIT_IMAGES[
        Math.floor(Math.random() * FRUIT_IMAGES.length)
      ]
    };
  }

  // Ciclo de atualização
  function loop(timestamp) {
    if (state !== "running") return;

    if (!lastFrame) lastFrame = timestamp;

    // Limita grandes saltos após suspensão da aba.
    const delta = Math.min(
      (timestamp - lastFrame) / 1000,
      0.1
    );

    lastFrame = timestamp;

    timeLeft -= delta;
    elapsedSeconds += delta;
    survivalRemainder += delta;

    const config = DIFFICULTIES[difficulty];

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

    while (
      moveAccumulator >= moveInterval &&
      state === "running"
    ) {
      moveAccumulator -= moveInterval;
      update();
    }

    draw();

    if (state === "running") {
      animationId = requestAnimationFrame(loop);
    }
  }

  function update() {
    direction = { ...nextDirection };

    const head = {
      x: snake[0].x + direction.x,
      y: snake[0].y + direction.y
    };

    const eating = fruit &&
      head.x === fruit.x &&
      head.y === fruit.y;

    const hitWall =
      head.x < 0 ||
      head.y < 0 ||
      head.x >= CELLS ||
      head.y >= CELLS;

    // Se não comer, a cauda vai sair desta posição.
    const bodyToCheck = eating
      ? snake
      : snake.slice(0, -1);

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
      timeLeft += 20;

      fruit = placeFruit();

      updateScore();
      updateTimer();

      // Vitória se preencher todo o tabuleiro.
      if (!fruit) {
        endGame("Você preencheu todo o tabuleiro!");
      }
    } else {
      snake.pop();
    }
  }

  // Pontuação e cronômetro
  function updateScore() {
    scoreElement.textContent = score;
  }

  function updateTimer() {
    const seconds = Math.ceil(Math.max(0, timeLeft));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;

    timerElement.textContent =
      `${String(minutes).padStart(2, "0")}:` +
      `${String(remainder).padStart(2, "0")}`;
  }

  function endGame(message) {
    if (state !== "running") return;

    cancelAnimationFrame(animationId);
    animationId = null;
    state = "over";

    saved.gamesPlayed += 1;
    saved.totalScore += score;
    saved.best = Math.max(saved.best, score);

    saveData();
    renderCharacters();

    overlayTitle.textContent =
      message === "Você preencheu todo o tabuleiro!"
        ? "Vitória!"
        : "Fim de jogo";

    overlayMessage.textContent =
      `${message} Pontuação: ${score}. ` +
      `Recorde: ${saved.best}.`;

    resumeButton.textContent = "Jogar novamente";
    gameOverlay.hidden = false;
  }

  // Pausa
  function pauseGame() {
    if (state !== "running") return;

    state = "paused";
    cancelAnimationFrame(animationId);
    animationId = null;

    overlayTitle.textContent = "Pausado";
    overlayMessage.textContent =
      "O cronômetro está parado. Continue quando estiver pronto.";

    resumeButton.textContent = "Continuar";
    gameOverlay.hidden = false;
  }

  function resumeGame() {
    if (state === "over") {
      startGame();
      return;
    }

    if (state !== "paused") return;

    state = "running";
    lastFrame = 0;
    gameOverlay.hidden = true;
    animationId = requestAnimationFrame(loop);
  }

  // Controles
  function setDirection(x, y) {
    if (state !== "running") return;

    if (
      x === -direction.x &&
      y === -direction.y
    ) {
      return;
    }

    // Evita múltiplas inversões entre movimentos.
    if (
      x === -nextDirection.x &&
      y === -nextDirection.y
    ) {
      return;
    }

    nextDirection = { x, y };
  }

  document.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();

    const controlled = [
      "arrowup", "arrowdown",
      "arrowleft", "arrowright",
      "w", "a", "s", "d", " "
    ];

    if (controlled.includes(key)) {
      event.preventDefault();
    }

    if (key === "escape") {
      if (state === "running") pauseGame();
      else if (state === "paused") resumeGame();
      return;
    }

    if (key === " " && state === "running") {
      pauseGame();
      return;
    }

    if (key === " " && state === "paused") {
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

  // Renderização
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground();

    if (fruit) drawFruit();

    drawSnake();
  }

  function drawBackground() {
    if (background.complete && background.naturalWidth) {
      ctx.drawImage(
        background,
        0,
        0,
        canvas.width,
        canvas.height
      );
      return;
    }

    ctx.fillStyle = "#18291e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(190, 230, 180, 0.07)";

    for (let i = 0; i <= CELLS; i++) {
      const position = i * CELL;

      ctx.beginPath();
      ctx.moveTo(position, 0);
      ctx.lineTo(position, canvas.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, position);
      ctx.lineTo(canvas.width, position);
      ctx.stroke();
    }
  }

  function drawFruit() {
    const image = getImage(fruit.image);
    const x = fruit.x * CELL;
    const y = fruit.y * CELL;

    if (image.complete && image.naturalWidth) {
      ctx.drawImage(image, x, y, CELL, CELL);
      return;
    }

    // Fruta alternativa.
    ctx.fillStyle = "#f26b5b";
    ctx.beginPath();
    ctx.arc(
      x + CELL / 2,
      y + CELL / 2,
      CELL * 0.35,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.fillStyle = "#a5ed69";
    ctx.fillRect(
      x + CELL * 0.53,
      y + CELL * 0.12,
      CELL * 0.1,
      CELL * 0.2
    );
  }

  function drawSnake() {
    const character = selectedCharacter();

    snake.forEach((part, index) => {
      const isHead = index === 0;
      const isTail = index === snake.length - 1;

      const type = isHead
        ? "head"
        : isTail
          ? "tail"
          : "body";

      const image = getImage(
        `assets/snakes/${character.id}-${type}.png`
      );

      const x = part.x * CELL;
      const y = part.y * CELL;

      if (image.complete && image.naturalWidth) {
        drawSprite(image, x, y, index, isHead);
      } else {
        drawFallbackSegment(x, y, isHead);
      }
    });
  }

  function drawSprite(image, x, y, index, isHead) {
    let angle = 0;

    if (isHead) {
      angle = Math.atan2(direction.y, direction.x);
    } else if (index > 0) {
      const previous = snake[index - 1];
      const current = snake[index];

      angle = Math.atan2(
        current.y - previous.y,
        current.x - previous.x
      );
    }

    ctx.save();
    ctx.translate(x + CELL / 2, y + CELL / 2);
    ctx.rotate(angle);

    ctx.drawImage(
      image,
      -CELL / 2,
      -CELL / 2,
      CELL,
      CELL
    );

    ctx.restore();
  }

  function drawFallbackSegment(x, y, isHead) {
    ctx.fillStyle = isHead ? "#d2ff9e" : "#8bdc62";

    ctx.beginPath();
    ctx.roundRect(
      x + 1,
      y + 1,
      CELL - 2,
      CELL - 2,
      CELL * 0.25
    );
    ctx.fill();

    if (!isHead) return;

    ctx.fillStyle = "#18351b";

    ctx.beginPath();
    ctx.arc(
      x + CELL * 0.65,
      y + CELL * 0.3,
      CELL * 0.06,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.beginPath();
    ctx.arc(
      x + CELL * 0.65,
      y + CELL * 0.7,
      CELL * 0.06,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  // Exportar dados
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

    const blob = new Blob(
      [JSON.stringify(payload, null, 2)],
      { type: "application/json" }
    );

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
        !Number.isSafeInteger(data.best) ||
        data.best < 0 ||
        !Number.isSafeInteger(data.gamesPlayed) ||
        data.gamesPlayed < 0 ||
        !Number.isSafeInteger(data.totalScore) ||
        data.totalScore < 0
      ) {
        throw new Error("Dados inválidos");
      }

      saved.best = data.best;
      saved.gamesPlayed = data.gamesPlayed;
      saved.totalScore = data.totalScore;

      const importedCharacter = CHARACTERS.find(
        character => character.id === data.selectedSkin
      );

      selectedSkin =
        importedCharacter && data.best >= importedCharacter.unlock
          ? importedCharacter.id
          : "ekans";

      difficulty = DIFFICULTIES[data.difficulty]
        ? data.difficulty
        : "easy";

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

  // Eventos da interface
  $("#play-button").addEventListener("click", () => {
    const radio = document.querySelector(
      'input[name="difficulty"]:checked'
    );

    difficulty = radio?.value || "easy";

    saveData();
    startGame();
  });

  $("#tutorial-button").addEventListener(
    "click",
    openTutorial
  );

  $("#tutorial-back-button").addEventListener(
    "click",
    () => showScreen("menu")
  );

  $("#pause-button").addEventListener(
    "click",
    pauseGame
  );

  resumeButton.addEventListener(
    "click",
    resumeGame
  );

  $("#menu-button").addEventListener(
    "click",
    openMenu
  );

  $("#export-button").addEventListener(
    "click",
    exportJson
  );

  $("#import-input").addEventListener(
    "change",
    importJson
  );

  // Inicialização
  const initialRadio = document.querySelector(
    `input[name="difficulty"][value="${difficulty}"]`
  );

  if (initialRadio) initialRadio.checked = true;

  // Evita iniciar com um personagem ainda bloqueado.
  if (
    !CHARACTERS.some(
      character =>
        character.id === selectedSkin &&
        isUnlocked(character)
    )
  ) {
    selectedSkin = "ekans";
  }

  updateHeader();
  renderCharacters();
  showScreen("menu");
  draw();
})();
