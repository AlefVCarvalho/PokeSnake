
(() => {
  "use strict";

  // Elementos da interface
  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");

  const scoreElement = document.querySelector("#score");
  const bestElement = document.querySelector("#best");
  const overlay = document.querySelector("#overlay");
  const overlayTitle = document.querySelector("#overlay-title");
  const overlayMessage = document.querySelector("#overlay-message");
  const startButton = document.querySelector("#start-button");
  const statusElement = document.querySelector("#status");

  // Configurações
  const STORAGE_KEY = "snake-game-data-v1";
  const CELLS = 24;
  const CELL = canvas.width / CELLS;
  const STEP_MS = 115;

  const ASSET_PATHS = {
    background: "assets/background.png",
    head: "assets/snake-head.png",
    body: "assets/snake-body.png",
    tail: "assets/snake-tail.png",
    fruit: "assets/fruit.png"
  };

  // Carregamento das imagens
  const images = {};

  for (const [name, src] of Object.entries(ASSET_PATHS)) {
    const image = new Image();
    image.src = src;
    image.onload = draw;
    images[name] = image;
  }

  // Dados persistentes
  let saved = loadData();

  // Estado atual da partida
  let snake;
  let direction;
  let nextDirection;
  let fruit;
  let score = 0;
  let state = "ready";
  let lastStep = 0;
  let animationId;

  function loadData() {
    const defaults = {
      best: 0,
      gamesPlayed: 0,
      totalScore: 0
    };

    try {
      const data = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || "{}"
      );

      return {
        best: validNumber(data.best),
        gamesPlayed: validNumber(data.gamesPlayed),
        totalScore: validNumber(data.totalScore)
      };
    } catch {
      return defaults;
    }
  }

  function validNumber(value) {
    return Number.isSafeInteger(value) && value >= 0
      ? value
      : 0;
  }

  function saveData() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(saved)
      );

      statusElement.textContent =
        "Progresso salvo neste navegador.";
    } catch {
      statusElement.textContent =
        "Não foi possível salvar. Exporte o JSON para guardar os dados.";
    }

    updateScoreboard();
  }

  function updateScoreboard() {
    scoreElement.textContent = score;
    bestElement.textContent = saved.best;
  }

  // Geração de posições
  function randomCell() {
    return Math.floor(Math.random() * CELLS);
  }

  function placeFruit() {
    let candidate;

    do {
      candidate = {
        x: randomCell(),
        y: randomCell()
      };
    } while (
      snake.some(
        part =>
          part.x === candidate.x &&
          part.y === candidate.y
      )
    );

    return candidate;
  }

  // Inicialização e interface
  function resetGame() {
    cancelAnimationFrame(animationId);

    snake = [
      { x: 8, y: 12 },
      { x: 7, y: 12 },
      { x: 6, y: 12 },
      { x: 5, y: 12 }
    ];

    direction = { x: 1, y: 0 };
    nextDirection = { ...direction };

    fruit = placeFruit();
    score = 0;
    state = "ready";
    lastStep = 0;

    updateScoreboard();

    showOverlay(
      "Snake",
      "Use as setas ou WASD para começar.",
      "Jogar"
    );

    draw();
  }

  function showOverlay(title, message, buttonText) {
    overlayTitle.textContent = title;
    overlayMessage.textContent = message;
    startButton.textContent = buttonText;

    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function startGame() {
    if (state === "over") {
      resetGame();
    }

    if (state === "running") {
      return;
    }

    state = "running";
    hideOverlay();

    lastStep = 0;

    cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(loop);
  }

  function endGame() {
    if (state === "over") {
      return;
    }

    state = "over";

    saved.gamesPlayed += 1;
    saved.totalScore += score;
    saved.best = Math.max(saved.best, score);

    saveData();

    showOverlay(
      "Fim de jogo",
      `Pontuação: ${score}. Recorde: ${saved.best}.`,
      "Jogar novamente"
    );

    draw();
  }

  function togglePause() {
    if (state === "running") {
      state = "paused";

      showOverlay(
        "Pausado",
        "Clique em Continuar ou aperte Espaço.",
        "Continuar"
      );
    } else if (state === "paused") {
      startGame();
    }
  }

  // Ciclo principal
  function loop(timestamp) {
    if (state !== "running") {
      return;
    }

    if (!lastStep) {
      lastStep = timestamp;
    }

    if (timestamp - lastStep >= STEP_MS) {
      update();
      lastStep = timestamp;
      draw();
    }

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

    const hitWall =
      head.x < 0 ||
      head.y < 0 ||
      head.x >= CELLS ||
      head.y >= CELLS;

    const eating =
      head.x === fruit.x &&
      head.y === fruit.y;

    // A cauda pode sair da posição atual no mesmo passo.
    const bodyToCheck = eating
      ? snake
      : snake.slice(0, -1);

    const hitSelf = bodyToCheck.some(
      part =>
        part.x === head.x &&
        part.y === head.y
    );

    if (hitWall || hitSelf) {
      endGame();
      return;
    }

    snake.unshift(head);

    if (eating) {
      score += 1;

      fruit = placeFruit();

      if (score > saved.best) {
        saved.best = score;
      }

      updateScoreboard();
    } else {
      snake.pop();
    }
  }

  // Controles de direção
  function setDirection(x, y) {
    if (state === "ready") {
      startGame();
    }

    if (state !== "running") {
      return;
    }

    // Impede a cobra de inverter a direção diretamente.
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

    const controlledKeys = [
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
      " ",
      "w",
      "a",
      "s",
      "d"
    ];

    if (controlledKeys.includes(key)) {
      event.preventDefault();
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

      case " ":
        togglePause();
        break;
    }
  });

  // Desenho do cenário
  function draw() {
    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    drawBackground();
    drawFruit();
    drawSnake();

    if (state === "over") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
      ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );
    }
  }

  function drawBackground() {
    const image = images.background;

    if (image.complete && image.naturalWidth) {
      ctx.drawImage(
        image,
        0,
        0,
        canvas.width,
        canvas.height
      );

      return;
    }

    // Cenário alternativo enquanto não há imagem.
    ctx.fillStyle = "#18291e";
    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.strokeStyle = "rgba(190, 230, 180, 0.055)";
    ctx.lineWidth = 1;

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

  // Desenho da fruta
  function drawFruit() {
    const x = fruit.x * CELL;
    const y = fruit.y * CELL;
    const image = images.fruit;

    if (image.complete && image.naturalWidth) {
      ctx.drawImage(
        image,
        x,
        y,
        CELL,
        CELL
      );

      return;
    }

    // Fruta alternativa.
    ctx.fillStyle = "#f26b5b";
    ctx.beginPath();

    ctx.arc(
      x + CELL / 2,
      y + CELL / 2,
      CELL * 0.36,
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

  // Desenho da cobra
  function drawSnake() {
    snake.forEach((part, index) => {
      const x = part.x * CELL;
      const y = part.y * CELL;

      const isHead = index === 0;
      const isTail = index === snake.length - 1;

      const image = isHead
        ? images.head
        : isTail
          ? images.tail
          : images.body;

      if (image.complete && image.naturalWidth) {
        drawSnakeImage(
          image,
          x,
          y,
          index,
          isHead,
          isTail
        );
      } else {
        drawFallbackSegment(
          x,
          y,
          isHead,
          index
        );
      }
    });
  }


  function drawSnakeImage(
    image,
    x,
    y,
    index,
    isHead,
    isTail
  ) {
    ctx.save();

    ctx.translate(
      x + CELL / 2,
      y + CELL / 2
    );

    let angle = 0;

    if (isHead) {
      angle = Math.atan2(
        direction.y,
        direction.x
      );
    } else if (index > 0) {
      const previous = snake[index - 1];
      const current = snake[index];

      angle = Math.atan2(
        current.y - previous.y,
        current.x - previous.x
      );
    }

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


  function partDifference(previous, current) {
    return current - previous;
  }

  function drawFallbackSegment(
    x,
    y,
    isHead,
    index
  ) {
    const isTail = index === snake.length - 1;

    ctx.fillStyle = isHead
      ? "#d2ff9e"
      : isTail
        ? "#6db84f"
        : "#8bdc62";

    ctx.beginPath();

    ctx.roundRect(
      x + 1,
      y + 1,
      CELL - 2,
      CELL - 2,
      CELL * 0.25
    );

    ctx.fill();

    if (!isHead) {
      return;
    }

    // Olhos simples no desenho alternativo da cabeça.
    ctx.fillStyle = "#18351b";

    const eyeX =
      x + CELL * (
        direction.x === -1
          ? 0.25
          : direction.x === 1
            ? 0.68
            : 0.3
      );

    const eyeY =
      y + CELL * (
        direction.y === -1
          ? 0.25
          : direction.y === 1
            ? 0.68
            : 0.3
      );

    ctx.beginPath();
    ctx.arc(
      eyeX,
      eyeY,
      CELL * 0.06,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.beginPath();
    ctx.arc(
      eyeX + (direction.y ? CELL * 0.35 : 0),
      eyeY + (direction.x ? CELL * 0.35 : 0),
      CELL * 0.06,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  // Exportação e importação JSON
  function exportJson() {
    const payload = {
      version: 1,
      best: saved.best,
      gamesPlayed: saved.gamesPlayed,
      totalScore: saved.totalScore,
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

    statusElement.textContent =
      "Arquivo snake-data.json exportado.";
  }

  async function importJson(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

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
        throw new Error("Formato inválido");
      }

      saved = {
        best: data.best,
        gamesPlayed: data.gamesPlayed,
        totalScore: data.totalScore
      };

      saveData();

      statusElement.textContent =
        "Dados JSON importados com sucesso.";
    } catch {
      statusElement.textContent =
        "JSON inválido. Selecione um arquivo exportado por este jogo.";
    } finally {
      event.target.value = "";
    }
  }

  // Botões
  startButton.addEventListener("click", startGame);

  document
    .querySelector("#restart-button")
    .addEventListener("click", resetGame);

  document
    .querySelector("#export-button")
    .addEventListener("click", exportJson);

  document
    .querySelector("#import-input")
    .addEventListener("change", importJson);

  // Inicialização
  updateScoreboard();
  resetGame();
})();
