// main.js — boot, game loop and state machine for The Gilded Hour.
// States: title -> playing -> paused | busted -> playing | gameover | won.
// URL shots (?shot=title|cover|alarm|vault) freeze the game in one exact,
// seeded state so screenshots are reproducible. ?selftest=1 runs a
// scripted in-browser check and writes its verdict into #probe.
import { createSeededRng } from './rng.js';
import { buildLevel, LOOT_SPOTS, STAR_SPOT, EXIT_SPOT, pointInShadow } from './level.js';
import { createGuards, updateGuards, distractNearestGuard, resetGuards, highestMeter } from './guards.js';
import { setConeState } from './vision.js';
import { createPlayer, updatePlayer, throwCoin, updateCoin, nearestGrabbable, grabLoot, atExit, respawnPlayer, MAX_STRIKES } from './player.js';
import { initHud, updateHud, drawMinimap, showBanner, hideBanner, showToast, setPrompt, formatTime } from './hud.js';
import {
  initAudio, setMuted, isMuted, playFootstep, playCoinClink, playPickupChime,
  playStarChime, playAlarmSting, playCaughtSting, playWinFanfare, panFor,
} from './audio.js';

window.__errors = [];
window.addEventListener('error', (e) => { window.__errors.push(String(e.message || e.error)); });

const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot');
const SELFTEST = params.get('selftest') === '1';

let renderer;
let scene;
let camera;
let player;
let guards;
let levelHandles;
let clock;
let state = 'title';
let elapsed = 0;
let everSpotted = false;
let frozen = false;
let coinsOnFloor = [];
let camTarget = { x: 0, z: 3 };
let nearMissCooldown = 0;
let guardStepTimers = [];
let audioReady = false;

const canvas = document.getElementById('scene');

function setupRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07060f);
  scene.fog = new THREE.FogExp2(0x0a0817, 0.012);
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  // Night lighting that shows what is safe: cold moonlight from above,
  // warm lamps on the floor, and deep shadow pools in between.
  const moon = new THREE.DirectionalLight(0x8fa8d8, 0.9);
  moon.position.set(6, 22, -6);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -26;
  moon.shadow.camera.right = 26;
  moon.shadow.camera.top = 20;
  moon.shadow.camera.bottom = -20;
  moon.shadow.camera.far = 60;
  moon.shadow.bias = -0.0004;
  scene.add(moon);
  scene.add(new THREE.HemisphereLight(0x2a3550, 0x120e1a, 0.85));
  scene.add(new THREE.AmbientLight(0x1a1626, 0.7));
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function updateCamera(dt) {
  const tx = state === 'title' ? 0 : player.x;
  const tz = state === 'title' ? 3 : player.z;
  camTarget.x += (tx - camTarget.x) * Math.min(1, dt * 4);
  camTarget.z += (tz - camTarget.z) * Math.min(1, dt * 4);
  if (frozen && SHOT && SHOT !== 'title') {
    // Shots zoom in so the figures read at thumbnail size; the cover
    // zooms closest, because the player must read at a glance.
    if (SHOT === 'cover') {
      camera.position.set(camTarget.x, 8.5, camTarget.z + 6);
      camera.lookAt(camTarget.x, 0, camTarget.z - 0.8);
    } else {
      camera.position.set(camTarget.x, 11.5, camTarget.z + 8.2);
      camera.lookAt(camTarget.x, 0, camTarget.z - 1);
    }
  } else {
    camera.position.set(camTarget.x, 17, camTarget.z + 12.5);
    camera.lookAt(camTarget.x, 0, camTarget.z - 1.5);
  }
}

function startGame() {
  initAudio();
  audioReady = true;
  document.getElementById('title-screen').classList.add('hidden');
  document.getElementById('end-screen').classList.add('hidden');
  state = 'playing';
  showToast('Steal the Meridian Star. Reach the skylight. Stay unseen.', 3600);
}

function endRun(won, detailHtml, title) {
  state = won ? 'won' : 'gameover';
  const titleEl = document.getElementById('end-title');
  titleEl.textContent = title;
  titleEl.style.color = won ? '#7ddb8a' : '#ff2a1e';
  document.getElementById('end-detail').innerHTML = detailHtml;
  document.getElementById('end-screen').classList.remove('hidden');
  if (won) playWinFanfare();
}

function onCaught(guard) {
  player.strikes += 1;
  player.alive = false;
  playCaughtSting();
  showBanner('BUSTED!', guard.name + ' caught you in the ' + (player.z > 10 ? 'Entrance Hall' : player.z > -4 ? 'Sculpture Gallery' : 'the Vault') + '.', 'danger');
  setTimeout(() => {
    hideBanner();
    if (player.strikes >= MAX_STRIKES) {
      endRun(false,
        '<p><b>Three strikes — the night is over.</b> The gallery locks its doors and the Star stays on its plinth.</p>'
        + '<p>Score: <b>' + player.score + '</b> · Loot taken: <b>' + player.loot.length + '/' + LOOT_SPOTS.length + '</b>'
        + (player.hasStar ? ' · The Star was yours — so close.' : ' · The Star was never taken.')
        + '</p><p>Patrols are fixed and learnable: watch Marlowe in the Vault, wait for the cone to turn, and cross in shadow.</p>',
        'CAUGHT 3 TIMES');
    } else {
      document.getElementById('end-title').textContent = 'BUSTED!';
      document.getElementById('end-title').style.color = '#ff2a1e';
      document.getElementById('end-detail').innerHTML =
        '<p><b>' + guard.name + '</b> caught you. Strike <b>' + player.strikes + ' / ' + MAX_STRIKES + '</b>.</p>'
        + '<p>The guards go back to their routes. You wake up by the entrance, one coin lighter in luck.</p>'
        + '<p>Press <b>R</b> or the button below to slip back in.</p>';
      document.getElementById('end-screen').classList.remove('hidden');
      state = 'busted';
    }
  }, 1400);
}

function retryAfterBusted() {
  resetGuards(guards);
  respawnPlayer(player);
  document.getElementById('end-screen').classList.add('hidden');
  state = 'playing';
  showToast('Back at the entrance. The patrols have forgotten you — for now.', 2600);
}

function onWin() {
  const timeBonus = Math.max(0, 600 - Math.floor(elapsed) * 2);
  const ghostBonus = everSpotted ? 0 : 500;
  const total = player.score + timeBonus + ghostBonus;
  player.score = total;
  endRun(true,
    '<p><b>The Meridian Star is yours.</b> You slip through the skylight as the first grey light touches the roof.</p>'
    + '<p>Loot: <b>' + player.score + '</b> &nbsp;·&nbsp; Time bonus: <b>+' + timeBonus + '</b> &nbsp;·&nbsp; Ghost bonus: <b>+' + ghostBonus + '</b>'
    + (everSpotted ? ' (lost — you were spotted once)' : ' (never spotted — a perfect ghost)')
    + '</p><p>Final score: <b>' + total + '</b> in ' + formatTime(elapsed) + '.</p>',
    'CLEAN GETAWAY');
}

function handleGrab() {
  const target = nearestGrabbable(player);
  if (!target) return;
  const got = grabLoot(player, target);
  if (!got) return;
  if (got.kind === 'star') {
    playStarChime();
    levelHandles.star.visible = false;
    showBanner('THE MERIDIAN STAR!', 'Now reach the skylight exit — don\'t get caught holding it.', 'good', 3200);
    showToast('★ The Meridian Star is yours — reach the skylight!', 3200);
  } else {
    playPickupChime();
    const mesh = levelHandles.lootMeshes[target.spot.id];
    if (mesh) mesh.visible = false;
    showToast(got.name + ' pocketed  ·  +' + got.value + '  ·  +1 coin', 2400);
  }
}

function handleClick(event) {
  if (state !== 'playing' || frozen) return;
  initAudio();
  const rect = canvas.getBoundingClientRect();
  const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  const ray = new THREE.Raycaster();
  ray.setFromCamera({ x: nx, y: ny }, camera);
  const origin = ray.ray.origin;
  const dir = ray.ray.direction;
  if (Math.abs(dir.y) < 1e-6) return;
  const t = -origin.y / dir.y;
  if (t < 0) return;
  const tx = origin.x + dir.x * t;
  const tz = origin.z + dir.z * t;
  const landing = throwCoin(player, scene, tx, tz);
  if (landing) {
    showToast('Coin tossed — someone heard that.', 1500);
  } else {
    showToast(player.coins <= 0 ? 'Out of coins — grab loot to earn more.' : 'Coin still in the air.', 1500);
  }
}

const keys = {};
function bindInput() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      const m = setMuted(!isMuted());
      showToast(m ? 'Sound muted.' : 'Sound on.', 1200);
      return;
    }
    keys[e.key.toLowerCase()] = true;
    if (e.key === 'p' || e.key === 'P') {
      if (state === 'playing') {
        state = 'paused';
        document.getElementById('pause-screen').classList.remove('hidden');
      } else if (state === 'paused') {
        state = 'playing';
        document.getElementById('pause-screen').classList.add('hidden');
      }
    }
    if (e.key === 'e' || e.key === 'E') {
      if (state === 'playing') handleGrab();
    }
    if (e.key === 'r' || e.key === 'R') {
      if (state === 'busted') retryAfterBusted();
      else if (state === 'gameover' || state === 'won') location.reload();
    }
    if (e.key === 'Enter' && state === 'title') startGame();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  canvas.addEventListener('click', handleClick);
  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('resume-btn').addEventListener('click', () => {
    state = 'playing';
    document.getElementById('pause-screen').classList.add('hidden');
  });
  document.getElementById('retry-btn').addEventListener('click', () => {
    if (state === 'busted') retryAfterBusted();
    else location.reload();
  });
  canvas.addEventListener('click', () => initAudio());
}

function readInput() {
  let x = 0;
  let z = 0;
  if (keys.w || keys.arrowup) z -= 1;
  if (keys.s || keys.arrowdown) z += 1;
  if (keys.a || keys.arrowleft) x -= 1;
  if (keys.d || keys.arrowright) x += 1;
  return { x, z, sneak: !!(keys.shift) };
}

// --- Screenshot shots: frozen, seeded, exact states. ---
function applyShot(name) {
  frozen = true;
  hideBanner();
  document.getElementById('banner-wrap').classList.remove('high');
  const labelFor = (g) => (g.state === 'alerted' ? 'HUNTING!'
    : g.state === 'suspicious' ? 'SUSPICIOUS ?'
    : g.state === 'searching' ? 'SEARCHING'
    : g.state === 'returning' ? 'RETURNING' : 'PATROL');
  if (name === 'title') {
    state = 'title';
    camTarget.x = 0;
    camTarget.z = 3;
    return;
  }
  document.getElementById('title-screen').classList.add('hidden');
  state = 'playing';
  if (name === 'cover') {
    // Climactic mid-infiltration: Wren crouched in shadow at the very edge
    // of Marlowe's cone, the Star glowing on its plinth just behind her.
    player.x = 0;
    player.z = -11;
    player.facing = 0;
    player.sneaking = true;
    player.score = 700;
    player.loot = ['fox'];
    const marlowe = guards[0];
    marlowe.x = 3.5;
    marlowe.z = -13.5;
    // Face just past the player, so Wren sits on the cone's edge: CLOSE!
    marlowe.facing = Math.atan2(player.x - marlowe.x, -(player.z - marlowe.z)) + 0.42;
    marlowe.state = 'suspicious';
    marlowe.meter = 55;
    camTarget.x = 0;
    camTarget.z = -12;
    document.getElementById('banner-wrap').classList.add('high');
    showBanner('CLOSE!', 'Marlowe is looking right at you — one step and the alarm sounds.', '');
  } else if (name === 'alarm') {
    // Every cone red, every guard converging on the player, close in.
    player.x = 0;
    player.z = 0;
    const ring = [[3.2, -3.2], [-3.2, -3.2], [3.2, 3.2], [-3.2, 3.2]];
    guards.forEach((g, i) => {
      g.x = ring[i][0];
      g.z = ring[i][1];
      g.facing = Math.atan2(player.x - g.x, -(player.z - g.z));
      g.state = 'alerted';
      g.meter = 100;
      g.lastSeenX = player.x;
      g.lastSeenZ = player.z;
    });
    camTarget.x = 0;
    camTarget.z = 0;
    document.getElementById('banner-wrap').classList.add('high');
    showBanner('SPOTTED!', 'Every guard is converging on you — run for the shadows!', 'danger');
  } else if (name === 'vault') {
    // The Star on its plinth, Wren about to lift it, Marlowe on patrol.
    player.x = 2;
    player.z = -13;
    player.facing = 0;
    player.score = 700;
    player.loot = ['fox', 'crown', 'violin'];
    const marlowe = guards[0];
    marlowe.x = -8;
    marlowe.z = -10;
    marlowe.facing = Math.atan2(8 - marlowe.x, -(-14 - marlowe.z));
    marlowe.state = 'patrol';
    marlowe.meter = 8;
    camTarget.x = 0;
    camTarget.z = -13;
    showToast('★ The Meridian Star — grab it and run for the skylight!', 999999);
    setPrompt('Press E — Take the Meridian Star ★');
  }
  // Sync figures to their frozen poses, cones coloured by state.
  for (const g of guards) g.stateLabel = labelFor(g);
  player.figure.position.set(player.x, 0, player.z);
  player.figure.rotation.y = Math.PI - player.facing;
  for (const g of guards) {
    g.figure.position.set(g.x, 0, g.z);
    g.figure.rotation.y = Math.PI - g.facing;
    g.cone.position.set(g.x, 0.06, g.z);
    g.cone.rotation.y = Math.PI - g.facing;
    const px = g.x + Math.sin(g.facing) * 2.4;
    const pz = g.z - Math.cos(g.facing) * 2.4;
    g.pool.position.set(px, 0.05, pz);
    setConeState(g.cone, g.state === 'alerted' ? 'alerted' : g.state === 'suspicious' ? 'suspicious' : 'calm');
  }
  updateHud({ player, guards, elapsed: 234, ghost: true });
  drawMinimap(player, guards, coinsOnFloor);
}

// --- Self-test: scripted in-browser check, verdict into #probe. ---
async function runSelfTest() {
  const out = { errors: window.__errors, checks: {} };
  // Frame-based waits: software rendering is slow, so count real frames
  // instead of trusting wall-clock time.
  const waitFrames = (n) => new Promise((resolve) => {
    const start = window.__frames || 0;
    const deadline = Date.now() + 30000;
    const check = () => {
      if ((window.__frames || 0) - start >= n || Date.now() > deadline) resolve();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
  try {
    startGame();
    await waitFrames(10);
    out.checks.stateAfterStart = state;
    const x0 = player.x;
    const z0 = player.z;
    keys.w = true;
    await waitFrames(90);
    keys.w = false;
    out.checks.playerMoved = Math.hypot(player.x - x0, player.z - z0) > 0.5;
    out.checks.playerPos = [Math.round(player.x * 10) / 10, Math.round(player.z * 10) / 10];
    // Walk into Marlowe's patrol lane and watch the meter fill.
    player.x = 0;
    player.z = -11;
    const marlowe = guards[0];
    marlowe.x = 0;
    marlowe.z = -14;
    marlowe.facing = Math.PI; // looking +z, straight at the player
    marlowe.state = 'patrol';
    marlowe.pauseLeft = 5; // stand still so the sighting is steady
    marlowe.meter = 0;
    await waitFrames(120);
    out.checks.meterRose = marlowe.meter > 5;
    out.checks.meterValue = Math.round(marlowe.meter);
    out.checks.coneVisible = !!marlowe.cone && marlowe.cone.visible;
    // Coin distracts.
    const before = marlowe.investigateX;
    throwCoin(player, scene, 8, -11);
    await waitFrames(90);
    out.checks.coinLanded = marlowe.investigateX !== null || before !== null;
    // Loot grab.
    player.x = -16;
    player.z = 5;
    handleGrab();
    out.checks.lootGrabbed = player.loot.includes('fox');
    out.checks.score = player.score;
    // Win path: star + exit.
    player.x = STAR_SPOT.x;
    player.z = STAR_SPOT.z;
    handleGrab();
    out.checks.starTaken = player.hasStar;
    player.x = EXIT_SPOT.x;
    player.z = EXIT_SPOT.z;
    await waitFrames(30);
    out.checks.winState = state;
    // Resources loaded: only local files.
    const resources = performance.getEntriesByType('resource').map((r) => r.name);
    out.checks.resourceCount = resources.length;
    out.checks.externalRequests = resources.filter((u) => !u.startsWith('http://localhost') && !u.startsWith('http://127.0.0.1'));
    out.checks.shadowHides = pointInShadow(-18, 14);
    out.checks.deterministicSeed = createSeededRng(20261121)() === createSeededRng(20261121)();
  } catch (err) {
    out.checks.exception = String(err && err.message ? err.message : err);
  }
  document.getElementById('probe').textContent = JSON.stringify(out);
  document.title = 'SELFTEST-DONE';
}

function tick() {
  requestAnimationFrame(tick);
  window.__frames = (window.__frames || 0) + 1;
  const dt = Math.min(clock.getDelta(), 0.05);
  nearMissCooldown = Math.max(0, nearMissCooldown - dt);

  if (state === 'playing' && !frozen) {
    elapsed += dt;
    const input = readInput();
    updatePlayer(player, input, dt);
    if (player.stepped) {
      player.stepped = false;
      playFootstep(false, 0, 0);
    }
    const landed = updateCoin(player, scene, dt);
    if (landed) {
      coinsOnFloor.push(landed);
      playCoinClink(panFor(landed.x, player.x, Math.hypot(landed.x - player.x, landed.z - player.z)), Math.hypot(landed.x - player.x, landed.z - player.z));
      const distracted = distractNearestGuard(guards, landed.x, landed.z);
      if (distracted) showToast(distracted.name + ' heard the coin — going to look.', 2000);
      player.noiseFlash = 0.6;
    }
    const events = [];
    const anyAlerted = updateGuards(guards, player, dt, events);
    if (anyAlerted) everSpotted = true;
    for (const ev of events) {
      if (ev.type === 'spotted') {
        playAlarmSting();
        showBanner('SPOTTED!', ev.guard.name + ' raised the alarm — break line of sight!', 'danger', 2600);
      } else if (ev.type === 'nearMiss') {
        if (nearMissCooldown <= 0) {
          showBanner('CLOSE!', 'A cone nearly touched you — hold still in the dark.', '', 1600);
          nearMissCooldown = 4;
        }
      } else if (ev.type === 'caught') {
        onCaught(ev.guard);
      }
    }
    // Guard footsteps, panned by direction and distance.
    guards.forEach((g, i) => {
      const moving = g.state === 'patrol' || g.state === 'alerted' || g.state === 'returning';
      if (!moving) return;
      guardStepTimers[i] = (guardStepTimers[i] || 0) - dt;
      if (guardStepTimers[i] <= 0) {
        guardStepTimers[i] = 0.55;
        const d = Math.hypot(g.x - player.x, g.z - player.z);
        playFootstep(true, panFor(g.x, player.x, d), d);
      }
    });
    // Star shimmer.
    if (levelHandles.star && levelHandles.star.userData.star) {
      levelHandles.star.userData.star.rotation.y += dt * 1.2;
      levelHandles.star.userData.star.position.y = 1.15 + Math.sin(elapsed * 2) * 0.08;
    }
    // Prompt line.
    const grab = nearestGrabbable(player);
    if (grab && grab.kind === 'star') setPrompt('Press E — Take the Meridian Star ★');
    else if (grab) setPrompt('Press E — Grab ' + grab.spot.name + ' (' + grab.spot.value + ')');
    else if (player.hasStar && atExit(player)) setPrompt('You have the Star — you are home free!');
    else if (atExit(player)) setPrompt('The skylight is your way out — steal the Star first.');
    else setPrompt('');
    // Win check.
    if (player.hasStar && atExit(player)) onWin();
    updateHud({ player, guards, elapsed, ghost: !everSpotted });
    drawMinimap(player, guards, coinsOnFloor);
  }

  updateCamera(frozen ? 1 : dt);
  renderer.render(scene, camera);
}

function boot() {
  setupRenderer();
  initHud();
  levelHandles = buildLevel(scene);
  guards = createGuards(scene);
  player = createPlayer(scene);
  guardStepTimers = guards.map(() => 0);
  clock = new THREE.Clock();
  bindInput();
  updateHud({ player, guards, elapsed: 0, ghost: true });
  drawMinimap(player, guards, coinsOnFloor);
  window.__gilded = {
    get state() { return state; },
    player,
    guards,
    startGame,
    applyShot,
    version: 'the-gilded-hour-1.0',
  };
  if (SHOT) applyShot(SHOT);
  if (SELFTEST) {
    setTimeout(runSelfTest, 800);
  }
  tick();
}

boot();
