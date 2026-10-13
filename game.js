/* =================================================================
   CYBERPUNK RUNNER — Game Engine
   game.js
   ================================================================= */

// ── DOM refs ──────────────────────────────────────────────────────
const gameAreaEl       = document.getElementById('gameArea');
const playerEl         = document.getElementById('player');
const groundPlaneEl    = document.getElementById('groundPlane');
const layerFarEl       = document.getElementById('layerFar');
const layerNearEl      = document.getElementById('layerNear');
const scoreDisplayEl   = document.getElementById('scoreDisplay');
const bestDisplayEl    = document.getElementById('bestDisplay');
const speedDisplayEl   = document.getElementById('speedDisplay');
const startScreenEl    = document.getElementById('startScreen');
const gameOverScreenEl = document.getElementById('gameOverScreen');
const goScoreEl        = document.getElementById('goScore');
const goHighEl         = document.getElementById('goHigh');
const pip1El           = document.getElementById('pip1');
const pip2El           = document.getElementById('pip2');
const speedFlashEl     = document.getElementById('speedFlash');
const startBtnEl       = document.getElementById('startBtn');
const restartBtnEl     = document.getElementById('restartBtn');

// ── Constants ─────────────────────────────────────────────────────
const GROUND_Y      = 0;      // px above ground (gameArea bottom)
const GRAVITY       = 2200;   // px/s²
const JUMP_VEL      = -720;   // px/s upward (negative = up in screen space)

const INITIAL_SPEED = 380;    // px/s
const SPEED_INC     = 18;     // px/s per score tier
const MAX_SPEED     = 900;

const SPAWN_MIN     = 1.2;    // seconds between obstacles (min)
const SPAWN_MAX     = 2.6;    // seconds between obstacles (max)

// ── Obstacle type definitions ─────────────────────────────────────
//  hitShrink: fraction to inset the collision bounding box on each axis.
//  e.g. 0.18 means each side is pulled inward by 18% of the element's width.
//  The Structural Block gets intentionally larger shrink values (the bug fix).
const OBS_TYPES = [
  {
    id:           'block',
    cls:          'obs-block',
    w:            52, h: 52,
    groundOffset: 0,
    // ↓ Collision box shrunk ~18% on x-axis, ~12% on y-axis (requested fix)
    hitShrink:    { x: 0.18, y: 0.12 }
  },
  {
    id:           'spike',
    cls:          'obs-spike',
    w:            36, h: 52,
    groundOffset: 0,
    // Triangle is narrow toward the top — shrink x more than y
    hitShrink:    { x: 0.24, y: 0.08 }
  },
  {
    id:           'laser',
    cls:          'obs-laser',
    w:            8, h: 90,
    groundOffset: 0,
    hitShrink:    { x: 0.04, y: 0.04 }
  },
  {
    id:           'drone',
    cls:          'obs-drone',
    w:            60, h: 28,
    groundOffset: 70,   // floats above ground
    hitShrink:    { x: 0.12, y: 0.15 }
  }
];

// ── Game state ────────────────────────────────────────────────────
let running       = false;
let playerY       = GROUND_Y;
let velY          = 0;
let jumpsLeft     = 2;
let score         = 0;
let best          = parseInt(localStorage.getItem('cpBest') || '0', 10);
let speed         = INITIAL_SPEED;
let lastTime      = null;
let nextSpawnIn   = 1.5;
let spawnTimer    = 0;
let obstacles     = [];
let particles     = [];
let gameTime      = 0;
let lastSpeedTier = 0;

// Parallax scroll offsets
let farOffset  = 0;
let nearOffset = 0;
const FAR_SPEED  = 0.15;
const NEAR_SPEED = 0.40;

// ── SKYLINE BUILDING GENERATION ───────────────────────────────────
function generateBuildings(container, count, minH, maxH, minW, maxW, palette) {
  container.innerHTML = '';
  const totalW = container.offsetWidth || window.innerWidth * 3;

  for (let i = 0; i < count; i++) {
    const el  = document.createElement('div');
    el.className = 'building';
    const h   = minH + Math.random() * (maxH - minH);
    const w   = minW + Math.random() * (maxW - minW);
    const x   = Math.random() * (totalW - w);
    const col = palette[Math.floor(Math.random() * palette.length)];

    el.style.cssText = `left:${x}px;width:${w}px;height:${h}px;background:${col};`;

    // Randomised lit windows
    const rows = Math.floor(h / 18);
    const cols = Math.floor(w / 14);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() < 0.38) {
          const win = document.createElement('div');
          const lit = Math.random() < 0.55;
          const wc  = lit
            ? (Math.random() < 0.5 ? 'rgba(0,245,255,0.7)' : 'rgba(255,0,170,0.6)')
            : 'rgba(255,255,255,0.04)';
          win.style.cssText =
            `position:absolute;left:${c * 14 + 4}px;bottom:${r * 18 + 6}px;` +
            `width:6px;height:8px;background:${wc};` +
            (lit ? `box-shadow:0 0 4px ${wc};` : '');
          el.appendChild(win);
        }
      }
    }

    // Rooftop antenna (occasional)
    if (Math.random() < 0.28) {
      const ant = document.createElement('div');
      ant.style.cssText =
        'position:absolute;top:-20px;left:50%;transform:translateX(-50%);' +
        'width:2px;height:20px;background:#333;';
      const blink = document.createElement('div');
      const dur   = (0.8 + Math.random()).toFixed(1);
      blink.style.cssText =
        'position:absolute;top:0;left:50%;transform:translateX(-50%);' +
        'width:4px;height:4px;border-radius:50%;' +
        'background:var(--neon-magenta);box-shadow:0 0 6px var(--neon-magenta);' +
        `animation:antBlink ${dur}s ease-in-out infinite alternate;`;
      ant.appendChild(blink);
      el.appendChild(ant);
    }

    container.appendChild(el);
  }
}

// ── LANE LINES ────────────────────────────────────────────────────
function initLaneLines() {
  groundPlaneEl.innerHTML = '';
  const rows = [
    { top: '28%', dur: 0.70, op: 0.30 },
    { top: '52%', dur: 0.85, op: 0.40 },
    { top: '74%', dur: 1.00, op: 0.50 }
  ];
  rows.forEach(row => {
    for (let j = 0; j < 22; j++) {
      const line = document.createElement('div');
      line.className = 'lane-line';
      line.style.top               = row.top;
      line.style.animationDuration = row.dur + 's';
      line.style.animationDelay    = `${-(j * 0.075)}s`;
      line.style.opacity           = row.op;
      groundPlaneEl.appendChild(line);
    }
  });
}

// ── OBSTACLE SPAWNING ─────────────────────────────────────────────
function spawnObstacle() {
  const def = OBS_TYPES[Math.floor(Math.random() * OBS_TYPES.length)];
  const el  = document.createElement('div');
  el.className = `obstacle ${def.cls}`;
  gameAreaEl.appendChild(el);

  obstacles.push({
    el,
    x:          window.innerWidth + 80,
    type:       def,
    driftPhase: Math.random() * Math.PI * 2
  });
}

// ── COLLISION DETECTION ───────────────────────────────────────────
//  getBoundingClientRect gives live pixel positions regardless of CSS transforms.
//  Both the player rect and the obstacle rect are independently inset
//  by their hitShrink fractions before the AABB test, making collisions
//  match the visible shape rather than the full element box.
function checkCollision(obs) {
  const def = obs.type;

  // Player rect — shrunk 12% x, 8% y
  const pR  = playerEl.getBoundingClientRect();
  const pSx = pR.width  * 0.12;
  const pSy = pR.height * 0.08;
  const px1 = pR.left   + pSx;
  const px2 = pR.right  - pSx;
  const py1 = pR.top    + pSy;
  const py2 = pR.bottom - pSy;

  // Obstacle rect — shrunk per its hitShrink definition
  const oR  = obs.el.getBoundingClientRect();
  const oSx = oR.width  * def.hitShrink.x;
  const oSy = oR.height * def.hitShrink.y;
  const ox1 = oR.left   + oSx;
  const ox2 = oR.right  - oSx;
  const oy1 = oR.top    + oSy;
  const oy2 = oR.bottom - oSy;

  // AABB intersection test
  return !(px2 < ox1 || px1 > ox2 || py2 < oy1 || py1 > oy2);
}

// ── PARTICLES ─────────────────────────────────────────────────────
function spawnParticles(cx, cy, count) {
  const cols = ['#00f5ff', '#ff00aa', '#ffe600', '#39ff14', '#fff'];
  for (let i = 0; i < count; i++) {
    const p    = document.createElement('div');
    p.className = 'particle';
    const sz   = 4 + Math.random() * 7;
    const col  = cols[Math.floor(Math.random() * cols.length)];
    p.style.cssText =
      `left:${cx}px;top:${cy}px;width:${sz}px;height:${sz}px;` +
      `background:${col};box-shadow:0 0 ${sz}px ${col};`;
    document.getElementById('gameWrapper').appendChild(p);

    const angle = Math.random() * Math.PI * 2;
    const spd   = 80 + Math.random() * 220;
    const life  = 0.4 + Math.random() * 0.5;
    particles.push({
      el: p,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      x: cx, y: cy,
      life, maxLife: life
    });
  }
}

// ── INPUT ─────────────────────────────────────────────────────────
function tryJump() {
  if (!running) { startGame(); return; }
  if (jumpsLeft > 0) {
    velY = JUMP_VEL;
    jumpsLeft--;
    playerEl.classList.add('jumping');
    if (jumpsLeft === 0) {
      // Double-jump: flash magenta glow
      playerEl.style.filter = 'drop-shadow(0 0 18px var(--neon-magenta))';
      setTimeout(() => { playerEl.style.filter = ''; }, 220);
    }
    updatePips();
  }
}

document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    tryJump();
  }
});

document.getElementById('gameWrapper').addEventListener('pointerdown', e => {
  if (e.target.closest('.btn')) return; // let button clicks propagate normally
  tryJump();
});

startBtnEl.addEventListener('click',   startGame);
restartBtnEl.addEventListener('click', startGame);

function updatePips() {
  pip1El.classList.toggle('used', jumpsLeft < 2);
  pip2El.classList.toggle('used', jumpsLeft < 1);
}

// ── FORMATTING ────────────────────────────────────────────────────
function fmt(n) { return String(Math.floor(n)).padStart(5, '0'); }

// ── INIT ──────────────────────────────────────────────────────────
function init() {
  generateBuildings(layerFarEl,  40, 120, 280, 30, 80,
    ['#0d0d30', '#0a0a28', '#111130', '#0d0d25']);
  generateBuildings(layerNearEl, 24, 80,  200, 40, 110,
    ['#161636', '#120d30', '#1a1040', '#111128']);
  initLaneLines();
  bestDisplayEl.textContent = fmt(best);
}

// ── RESET STATE ───────────────────────────────────────────────────
function resetState() {
  obstacles.forEach(o => o.el.remove());
  obstacles = [];
  particles.forEach(p => p.el.remove());
  particles = [];

  playerY       = GROUND_Y;
  velY          = 0;
  jumpsLeft     = 2;
  score         = 0;
  speed         = INITIAL_SPEED;
  gameTime      = 0;
  spawnTimer    = 0;
  nextSpawnIn   = 1.5;
  lastSpeedTier = 0;
  lastTime      = null;
  farOffset     = 0;
  nearOffset    = 0;

  playerEl.style.bottom = GROUND_Y + 'px';
  playerEl.classList.remove('jumping');
  playerEl.style.filter = '';
  updatePips();
  scoreDisplayEl.textContent = fmt(0);
  speedDisplayEl.textContent = '1.0x';
}

// ── START / GAME-OVER ─────────────────────────────────────────────
function startGame() {
  startScreenEl.classList.add('hidden');
  gameOverScreenEl.classList.add('hidden');
  resetState();
  running = true;
  requestAnimationFrame(gameLoop);
}

function triggerGameOver() {
  running = false;
  if (score > best) {
    best = score;
    localStorage.setItem('cpBest', String(Math.floor(best)));
  }
  bestDisplayEl.textContent = fmt(best);
  goScoreEl.textContent     = `SCORE: ${fmt(score)}`;
  goHighEl.textContent      = `BEST:  ${fmt(best)}`;
  gameOverScreenEl.classList.remove('hidden');
}

// ── MAIN GAME LOOP ────────────────────────────────────────────────
function gameLoop(ts) {
  if (!running) return;

  if (!lastTime) lastTime = ts;
  const dt = Math.min((ts - lastTime) / 1000, 0.05); // cap delta at 50 ms
  lastTime  = ts;
  gameTime += dt;

  // ── Score & speed ramp ──
  score += dt * speed * 0.06;
  const tier = Math.floor(score / 10);
  if (tier !== lastSpeedTier) {
    lastSpeedTier = tier;
    speed = Math.min(INITIAL_SPEED + tier * SPEED_INC, MAX_SPEED);
    speedFlashEl.classList.add('active');
    setTimeout(() => speedFlashEl.classList.remove('active'), 200);
  }
  scoreDisplayEl.textContent = fmt(score);
  speedDisplayEl.textContent = (speed / INITIAL_SPEED).toFixed(1) + 'x';

  // ── Player physics ──
  velY    += GRAVITY * dt;
  playerY -= velY * dt;   // velY < 0 → moving upward → bottom increases

  if (playerY <= GROUND_Y) {
    playerY   = GROUND_Y;
    velY      = 0;
    jumpsLeft = 2;
    playerEl.classList.remove('jumping');
    updatePips();
  }
  playerEl.style.bottom = playerY + 'px';

  // ── Obstacle spawning ──
  spawnTimer += dt;
  if (spawnTimer >= nextSpawnIn) {
    spawnTimer  = 0;
    const base  = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
    nextSpawnIn = base * Math.max(0.5, INITIAL_SPEED / speed); // shorter gaps at high speed
    spawnObstacle();
  }

  // ── Move obstacles & check collision ──
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const obs = obstacles[i];
    obs.x -= speed * dt;
    obs.el.style.left = obs.x + 'px';

    // Drone: additional sinusoidal vertical drift
    if (obs.type.id === 'drone') {
      const drift = Math.sin(gameTime * 2.5 + obs.driftPhase) * 12;
      obs.el.style.bottom = (obs.type.groundOffset + drift) + 'px';
    }

    // Cull obstacles that have passed off the left edge
    if (obs.x + obs.type.w < -30) {
      obs.el.remove();
      obstacles.splice(i, 1);
      continue;
    }

    // Collision → game over
    if (checkCollision(obs)) {
      const r = obs.el.getBoundingClientRect();
      spawnParticles(r.left + r.width * 0.5, r.top + r.height * 0.5, 22);
      obs.el.remove();
      obstacles.splice(i, 1);
      triggerGameOver();
      return;
    }
  }

  // ── Parallax skyline scroll ──
  const layerFarW  = layerFarEl.offsetWidth  || window.innerWidth * 3;
  const layerNearW = layerNearEl.offsetWidth || window.innerWidth * 3;
  farOffset  = (farOffset  + speed * FAR_SPEED  * dt) % (layerFarW  / 3);
  nearOffset = (nearOffset + speed * NEAR_SPEED * dt) % (layerNearW / 3);
  layerFarEl.style.transform  =
    `rotateX(4deg) translateZ(-200px) scale(1.15) translateX(-${farOffset}px)`;
  layerNearEl.style.transform =
    `rotateX(2deg) translateZ(-60px) scale(1.05) translateX(-${nearOffset}px)`;

  // ── Particle update ──
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { p.el.remove(); particles.splice(i, 1); continue; }
    p.x  += p.vx * dt;
    p.y  += p.vy * dt;
    p.vy += 300 * dt; // gravity pulls particles down
    const a = p.life / p.maxLife;
    p.el.style.left      = p.x + 'px';
    p.el.style.top       = p.y + 'px';
    p.el.style.opacity   = a;
    p.el.style.transform = `scale(${a})`;
  }

  requestAnimationFrame(gameLoop);
}

// ── BOOT ──────────────────────────────────────────────────────────
init();
