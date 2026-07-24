(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const heightEl = document.getElementById('height');
  const comboEl = document.getElementById('combo');
  const comboCountEl = document.getElementById('combo-count');
  const multiplierEl = document.getElementById('multiplier');
  const multiplierFillEl = document.getElementById('multiplier-fill');
  const overlay = document.getElementById('overlay');
  const gameoverEl = document.getElementById('gameover');
  const finalScoreEl = document.getElementById('final-score');
  const finalHeightEl = document.getElementById('final-height');
  const medalEl = document.getElementById('medal');
  const newRecordEl = document.getElementById('new-record');
  const milestoneBanner = document.getElementById('milestone-banner');

  const STORAGE_KEY = 'stack-rush-best';
  const BLOCK_HEIGHT = 28;
  const PERFECT_THRESHOLD = 4;
  const GREAT_THRESHOLD = 14;
  const MIN_BLOCK_WIDTH = 8;
  const BASE_SPEED = 2.2;
  const GOLDEN_INTERVAL = 15;
  const MILESTONE_INTERVAL = 10;
  const MAX_MULTIPLIER = 8;

  const MEDALS = [
    { min: 0, label: '', emoji: '' },
    { min: 10, label: 'BRONZE', emoji: '🥉' },
    { min: 25, label: 'SILVER', emoji: '🥈' },
    { min: 50, label: 'GOLD', emoji: '🥇' },
    { min: 80, label: 'DIAMOND', emoji: '💎' },
    { min: 120, label: 'LEGEND', emoji: '👑' },
  ];

  const SKY_THEMES = [
    { top: '#12122a', bottom: '#0a0a1a', accent: '#4dabf7' },
    { top: '#1a1040', bottom: '#0d0820', accent: '#c44dff' },
    { top: '#0a2040', bottom: '#051525', accent: '#4dabf7' },
    { top: '#401040', bottom: '#200820', accent: '#ff6b9d' },
    { top: '#402010', bottom: '#201008', accent: '#ffd166' },
    { top: '#002040', bottom: '#001020', accent: '#06ffa5' },
    { top: '#1a0030', bottom: '#0a0018', accent: '#ff3d81' },
  ];

  const PALETTE = [
    ['#ff6b9d', '#c44dff'],
    ['#c44dff', '#4dabf7'],
    ['#4dabf7', '#06ffa5'],
    ['#06ffa5', '#ffd166'],
    ['#ffd166', '#ff6b9d'],
    ['#ff8c42', '#ff3d81'],
    ['#7b68ee', '#00d4ff'],
  ];

  let W, H, dpr;
  let state = 'idle';
  let score = 0;
  let best = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
  let combo = 0;
  let streak = 0;
  let multiplier = 1;
  let speed = BASE_SPEED;
  let direction = 1;
  let cameraY = 0;
  let targetCameraY = 0;
  let shake = 0;
  let flash = 0;
  let slowMo = 0;
  let blocks = [];
  let debris = [];
  let particles = [];
  let floatingTexts = [];
  let currentBlock = null;
  let failedBlock = null;
  let nextGolden = GOLDEN_INTERVAL;

  bestEl.textContent = best;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.min(window.innerWidth, 480);
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function paletteForLevel(level) {
    return PALETTE[level % PALETTE.length];
  }

  function skyForHeight(floors) {
    return SKY_THEMES[Math.min(Math.floor(floors / 12), SKY_THEMES.length - 1)];
  }

  function createBlock(width, x, y, level, opts = {}) {
    const [c1, c2] = paletteForLevel(level);
    return {
      width, x, y, level,
      moving: opts.moving || false,
      golden: opts.golden || false,
      c1: opts.golden ? '#ffd166' : c1,
      c2: opts.golden ? '#ff8c42' : c2,
      squash: 0,
      dropped: false,
    };
  }

  function updateHUD() {
    scoreEl.textContent = score;
    heightEl.textContent = Math.max(0, blocks.length - 1);
    multiplierEl.textContent = 'x' + multiplier;
    const pct = Math.min(100, (streak / (MAX_MULTIPLIER * 2)) * 100);
    multiplierFillEl.style.width = pct + '%';
  }

  function resetGame() {
    score = 0;
    combo = 0;
    streak = 0;
    multiplier = 1;
    speed = BASE_SPEED;
    direction = 1;
    cameraY = 0;
    targetCameraY = 0;
    shake = 0;
    flash = 0;
    slowMo = 0;
    blocks = [];
    debris = [];
    particles = [];
    floatingTexts = [];
    failedBlock = null;
    nextGolden = GOLDEN_INTERVAL;
    comboEl.classList.add('hidden');
    milestoneBanner.classList.add('hidden');
    updateHUD();

    const baseWidth = W * 0.55;
    const baseY = H * 0.72;
    blocks.push(createBlock(baseWidth, (W - baseWidth) / 2, baseY, 0));
    spawnNextBlock();
  }

  function spawnNextBlock() {
    const prev = blocks[blocks.length - 1];
    const level = blocks.length;
    const y = prev.y - BLOCK_HEIGHT;
    const isGolden = level >= nextGolden;
    if (isGolden) nextGolden += GOLDEN_INTERVAL;

    currentBlock = createBlock(
      prev.width,
      direction > 0 ? 0 : W - prev.width,
      y, level,
      { moving: true, golden: isGolden }
    );
  }

  function getRating(overlapRatio, perfect) {
    if (perfect) return 'PERFECT';
    if (overlapRatio >= 0.85) return 'GREAT';
    if (overlapRatio >= 0.6) return 'GOOD';
    return 'OK';
  }

  function addScore(base, x, y, color) {
    const earned = base * multiplier;
    score += earned;
    updateHUD();
    floatingTexts.push({
      x, y, text: '+' + earned, life: 1, color, size: earned >= 10 ? 20 : 16,
    });
  }

  function spawnDebris(piece, dir) {
    debris.push({
      x: piece.x,
      y: piece.y,
      width: piece.width,
      height: BLOCK_HEIGHT,
      c1: piece.c1,
      c2: piece.c2,
      vx: dir * (2 + Math.random() * 2),
      vy: -1 - Math.random() * 2,
      rot: 0,
      rotV: dir * (0.05 + Math.random() * 0.08),
      life: 1,
    });
  }

  function dropBlock() {
    if (!currentBlock || !currentBlock.moving) return;

    currentBlock.moving = false;
    currentBlock.dropped = true;
    currentBlock.squash = 1;

    const prev = blocks[blocks.length - 1];
    const overlapLeft = Math.max(currentBlock.x, prev.x);
    const overlapRight = Math.min(currentBlock.x + currentBlock.width, prev.x + prev.width);
    const overlap = overlapRight - overlapLeft;
    const overlapRatio = overlap / prev.width;

    if (overlap <= MIN_BLOCK_WIDTH) {
      state = 'dying';
      failedBlock = { ...currentBlock, vy: 0, falling: true };
      currentBlock = null;
      GameAudio.gameOver();
      setTimeout(endGame, 700);
      return;
    }

    const perfect = Math.abs(currentBlock.x - prev.x) <= PERFECT_THRESHOLD &&
                    Math.abs(currentBlock.width - prev.width) <= PERFECT_THRESHOLD;
    const rating = getRating(overlapRatio, perfect);
    const cx = overlapLeft + overlap / 2;

    if (currentBlock.x < prev.x) {
      spawnDebris({
        x: currentBlock.x, y: currentBlock.y,
        width: prev.x - currentBlock.x,
        c1: currentBlock.c1, c2: currentBlock.c2,
      }, -1);
    }
    if (currentBlock.x + currentBlock.width > prev.x + prev.width) {
      spawnDebris({
        x: prev.x + prev.width,
        y: currentBlock.y,
        width: currentBlock.x + currentBlock.width - prev.x - prev.width,
        c1: currentBlock.c1, c2: currentBlock.c2,
      }, 1);
    }

    let newX = overlapLeft;
    let newWidth = overlap;

    if (perfect) {
      newX = prev.x;
      newWidth = prev.width;
      currentBlock.x = newX;
      combo++;
      streak += 2;
      if (combo >= 5) slowMo = 8;
      addScore(currentBlock.golden ? 5 : 2, cx, currentBlock.y - 10, '#06ffa5');
      showCombo(combo);
      spawnPerfectFX(cx, currentBlock.y);
      flash = 0.35;
      shake = 4;
      GameAudio.perfect(combo);
    } else {
      currentBlock.x = newX;
      currentBlock.width = newWidth;
      combo = 0;
      comboEl.classList.add('hidden');
      streak += 1;

      const colors = { GREAT: '#4dabf7', GOOD: '#ffd166', OK: '#fff' };
      const points = { GREAT: 2, GOOD: 1, OK: 1 };
      const bonus = currentBlock.golden ? points[rating] * 3 : points[rating];
      addScore(bonus, cx, currentBlock.y - 10, colors[rating]);

      floatingTexts.push({
        x: cx, y: currentBlock.y - 28,
        text: rating, life: 0.9,
        color: colors[rating], size: rating === 'GREAT' ? 18 : 15,
      });

      spawnDropFX(cx, currentBlock.y, currentBlock.c1);
      shake = rating === 'GREAT' ? 2 : 1.2;

      if (rating === 'GREAT') GameAudio.great();
      else if (rating === 'GOOD') GameAudio.good();
      else GameAudio.drop();
    }

    if (currentBlock.golden) {
      GameAudio.golden();
      flash = 0.5;
      spawnPerfectFX(cx, currentBlock.y);
      floatingTexts.push({
        x: cx, y: currentBlock.y - 44,
        text: '★ GOLD ★', life: 1.2, color: '#ffd166', size: 16,
      });
    }

    currentBlock.width = newWidth;
    blocks.push(currentBlock);
    currentBlock = null;

    multiplier = Math.min(MAX_MULTIPLIER, 1 + Math.floor(streak / 3));
    updateHUD();

    speed = BASE_SPEED + blocks.length * 0.07;
    direction *= -1;

    const floors = blocks.length - 1;
    if (floors > 0 && floors % MILESTONE_INTERVAL === 0) {
      showMilestone(floors);
    }

    targetCameraY = Math.max(0, (H * 0.72 - blocks[blocks.length - 1].y) - H * 0.38);

    spawnNextBlock();
  }

  function showCombo(n) {
    if (n >= 2) {
      comboCountEl.textContent = n;
      comboEl.classList.remove('hidden');
      comboEl.style.animation = 'none';
      comboEl.offsetHeight;
      comboEl.style.animation = '';
    }
  }

  function showMilestone(floors) {
    milestoneBanner.textContent = floors + ' FLOORS!';
    milestoneBanner.classList.remove('hidden');
    milestoneBanner.style.animation = 'none';
    milestoneBanner.offsetHeight;
    milestoneBanner.style.animation = '';
    GameAudio.milestone();
    flash = 0.4;
    setTimeout(() => milestoneBanner.classList.add('hidden'), 1500);
  }

  function spawnPerfectFX(x, y) {
    const [c1, c2] = paletteForLevel(blocks.length);
    for (let i = 0; i < 24; i++) {
      const angle = (Math.PI * 2 * i) / 24;
      const spd = 2 + Math.random() * 5;
      particles.push({
        x, y: y + BLOCK_HEIGHT / 2,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 2,
        life: 1,
        color: Math.random() > 0.5 ? c1 : c2,
        size: 3 + Math.random() * 5,
      });
    }
  }

  function spawnDropFX(x, y, color) {
    for (let i = 0; i < 10; i++) {
      particles.push({
        x, y: y + BLOCK_HEIGHT / 2,
        vx: (Math.random() - 0.5) * 4,
        vy: -Math.random() * 3,
        life: 0.7,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  function getMedal(floors) {
    let m = MEDALS[0];
    for (const medal of MEDALS) {
      if (floors >= medal.min) m = medal;
    }
    return m;
  }

  function endGame() {
    state = 'gameover';
    const floors = Math.max(0, blocks.length - 1);
    const medal = getMedal(floors);

    if (score > best) {
      best = score;
      localStorage.setItem(STORAGE_KEY, String(best));
      bestEl.textContent = best;
      newRecordEl.classList.remove('hidden');
      GameAudio.newRecord();
    } else {
      newRecordEl.classList.add('hidden');
    }

    finalScoreEl.textContent = score;
    finalHeightEl.textContent = floors;
    medalEl.textContent = medal.emoji;
    medalEl.dataset.label = medal.label;
    gameoverEl.classList.remove('hidden');
  }

  function startGame() {
    overlay.classList.add('hidden');
    overlay.classList.remove('visible');
    gameoverEl.classList.add('hidden');
    resetGame();
    state = 'playing';
  }

  function handleTap() {
    if (state === 'idle') startGame();
    else if (state === 'gameover') {
      gameoverEl.classList.add('hidden');
      resetGame();
      state = 'playing';
    } else if (state === 'playing') dropBlock();
  }

  function update() {
    cameraY += (targetCameraY - cameraY) * 0.12;

    if (state === 'playing') {
      const spdMul = slowMo > 0 ? 0.55 : 1;
      if (slowMo > 0) slowMo--;

      if (currentBlock && currentBlock.moving) {
        currentBlock.x += speed * direction * spdMul;
        if (currentBlock.x <= 0) {
          currentBlock.x = 0;
          direction = 1;
        } else if (currentBlock.x + currentBlock.width >= W) {
          currentBlock.x = W - currentBlock.width;
          direction = -1;
        }
      }

      blocks.forEach(b => {
        if (b.squash > 0) b.squash *= 0.82;
      });
    }

    if (failedBlock && failedBlock.falling) {
      failedBlock.vy += 0.5;
      failedBlock.y += failedBlock.vy;
      failedBlock.x += (Math.random() - 0.5) * 2;
      shake = 2;
    }

    debris.forEach(d => {
      d.x += d.vx;
      d.y += d.vy;
      d.vy += 0.35;
      d.rot += d.rotV;
      d.life -= 0.012;
    });
    debris = debris.filter(d => d.life > 0);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= 0.025;
    });
    particles = particles.filter(p => p.life > 0);

    floatingTexts.forEach(t => {
      t.y -= 1.4;
      t.life -= 0.018;
    });
    floatingTexts = floatingTexts.filter(t => t.life > 0);

    if (shake > 0) shake *= 0.85;
    if (flash > 0) flash -= 0.04;
  }

  function drawBlock(b, offsetY = 0) {
    const screenY = b.y + cameraY + offsetY;
    if (screenY > H + BLOCK_HEIGHT * 2 || screenY < -BLOCK_HEIGHT * 3) return;

    const squashH = b.squash ? BLOCK_HEIGHT * (1 + b.squash * 0.15) : BLOCK_HEIGHT;
    const squashW = b.squash ? b.width * (1 - b.squash * 0.05) : b.width;
    const sx = b.x + (b.width - squashW) / 2;
    const sy = screenY + BLOCK_HEIGHT - squashH;

    const grad = ctx.createLinearGradient(sx, sy, sx + squashW, sy + squashH);
    grad.addColorStop(0, b.c1);
    grad.addColorStop(1, b.c2);

    ctx.fillStyle = grad;
    ctx.shadowColor = b.golden ? '#ffd166' : b.c1;
    ctx.shadowBlur = b.moving ? 18 : (b.golden ? 14 : 8);
    ctx.fillRect(sx, sy, squashW, squashH);

    if (b.golden) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(sx + 4, sy + 4, squashW - 8, 3);
    }

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(sx, sy, squashW, 4);
  }

  function drawDebris(d) {
    const screenY = d.y + cameraY;
    ctx.save();
    ctx.translate(d.x + d.width / 2, screenY + BLOCK_HEIGHT / 2);
    ctx.rotate(d.rot);
    ctx.globalAlpha = d.life;
    const grad = ctx.createLinearGradient(-d.width / 2, 0, d.width / 2, BLOCK_HEIGHT);
    grad.addColorStop(0, d.c1);
    grad.addColorStop(1, d.c2);
    ctx.fillStyle = grad;
    ctx.fillRect(-d.width / 2, -BLOCK_HEIGHT / 2, d.width, BLOCK_HEIGHT);
    ctx.restore();
  }

  function draw() {
    const sx = shake > 0.5 ? (Math.random() - 0.5) * shake : 0;
    const sy = shake > 0.5 ? (Math.random() - 0.5) * shake : 0;
    const floors = Math.max(0, blocks.length - 1);
    const sky = skyForHeight(floors);

    ctx.save();
    ctx.translate(sx, sy);

    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, sky.top);
    bgGrad.addColorStop(1, sky.bottom);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    const gridOff = (cameraY * 0.3) % 40;
    for (let y = -gridOff; y < H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    const starCount = 20 + Math.floor(floors / 5);
    for (let i = 0; i < starCount; i++) {
      const sx2 = ((i * 137.5) % W);
      const sy2 = ((i * 97.3 + cameraY * 0.05) % H);
      ctx.fillStyle = `rgba(255,255,255,${0.1 + (i % 5) * 0.06})`;
      ctx.fillRect(sx2, sy2, 1.5, 1.5);
    }

    blocks.forEach(b => drawBlock(b));
    if (currentBlock) drawBlock(currentBlock);
    if (failedBlock) drawBlock(failedBlock);
    debris.forEach(drawDebris);

    particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y + cameraY, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    floatingTexts.forEach(t => {
      ctx.globalAlpha = t.life;
      ctx.font = `bold ${t.size || 16}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 12;
      ctx.fillText(t.text, t.x, t.y + cameraY);
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;

    if (state === 'playing' && currentBlock) {
      const prev = blocks[blocks.length - 1];
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y + cameraY);
      ctx.lineTo(prev.x + prev.width, prev.y + cameraY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.25})`;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  const app = document.getElementById('app');
  const soundToggle = document.getElementById('sound-toggle');

  function handleInput(e) {
    if (soundToggle && (e.target === soundToggle || soundToggle.contains(e.target))) return;
    e.preventDefault();
    handleTap();
  }

  app.addEventListener('pointerdown', handleInput);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      handleTap();
    }
  });

  window.addEventListener('resize', () => {
    resize();
    if (state === 'playing') resetGame();
  });

  resize();
  loop();
})();
