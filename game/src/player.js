// player.js — Wren: movement, sneaking, noise, coins, loot, strikes.
// Collision is a circle against wall rectangles and prop circles, so the
// thief slides along cover instead of sticking on it.
import { WORLD, WALLS, PROPS, propRadius, PLAYER_START, EXIT_SPOT, LOOT_SPOTS, STAR_SPOT } from './level.js';
import { makePlayerFigure, makeCoinFigure } from './models.js';

export const WALK_SPEED = 4.2;
export const SNEAK_SPEED = 2.0;
export const PLAYER_RADIUS = 0.45;
export const GRAB_DIST = 1.4;
export const MAX_COINS = 5;
export const MAX_STRIKES = 3;

function collideCircle(x, z, radius) {
  // Walls: push the circle out of any overlapping rectangle.
  for (const w of WALLS) {
    const minX = w.x - w.w / 2;
    const maxX = w.x + w.w / 2;
    const minZ = w.z - w.d / 2;
    const maxZ = w.z + w.d / 2;
    const cx = Math.max(minX, Math.min(x, maxX));
    const cz = Math.max(minZ, Math.min(z, maxZ));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * radius;
        z = cz + (dz / d) * radius;
      } else {
        // Centre inside the wall: push out along the smallest penetration.
        const pushL = x - (minX - radius);
        const pushR = (maxX + radius) - x;
        const pushT = z - (minZ - radius);
        const pushB = (maxZ + radius) - z;
        const m = Math.min(pushL, pushR, pushT, pushB);
        if (m === pushL) x = minX - radius;
        else if (m === pushR) x = maxX + radius;
        else if (m === pushT) z = minZ - radius;
        else z = maxZ + radius;
      }
    }
  }
  // Props: push out of prop circles.
  for (const p of PROPS) {
    const r = propRadius(p.kind) + radius * 0.7;
    const dx = x - p.x;
    const dz = z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 1e-9) {
      const d = Math.sqrt(d2);
      x = p.x + (dx / d) * r;
      z = p.z + (dz / d) * r;
    }
  }
  x = Math.max(WORLD.minX + radius, Math.min(WORLD.maxX - radius, x));
  z = Math.max(WORLD.minZ + radius, Math.min(WORLD.maxZ - radius, z));
  return { x, z };
}

export function createPlayer(scene) {
  const figure = makePlayerFigure();
  scene.add(figure);
  const player = {
    figure,
    x: PLAYER_START.x,
    z: PLAYER_START.z,
    facing: 0, // facing -z, into the gallery
    sneaking: false,
    moving: false,
    alive: true,
    coins: MAX_COINS,
    strikes: 0,
    loot: [], // collected loot ids
    hasStar: false,
    score: 0,
    noise: 0, // 0..1, shown on the noise meter
    noiseFlash: 0,
    walkPhase: 0,
    stepTimer: 0,
    coinInFlight: null,
    coinsThrown: 0,
  };
  syncPlayerFigure(player, 0);
  return player;
}

export function syncPlayerFigure(player, dt) {
  player.figure.position.set(player.x, 0, player.z);
  player.figure.rotation.y = Math.PI - player.facing;
  if (player.moving) player.walkPhase += dt * (player.sneaking ? 7 : 11);
  player.figure.position.y = Math.abs(Math.sin(player.walkPhase)) * 0.04;
  player.figure.scale.y = player.sneaking ? 0.82 : 1;
}

// input: {x, z} normalised wish direction, sneak boolean.
export function updatePlayer(player, input, dt) {
  if (!player.alive) return;
  player.sneaking = !!input.sneak;
  const speed = player.sneaking ? SNEAK_SPEED : WALK_SPEED;
  const mag = Math.hypot(input.x, input.z);
  player.moving = mag > 0.05;
  if (player.moving) {
    const nx = input.x / Math.max(1, mag);
    const nz = input.z / Math.max(1, mag);
    const next = collideCircle(player.x + nx * speed * dt, player.z + nz * speed * dt, PLAYER_RADIUS);
    player.x = next.x;
    player.z = next.z;
    player.facing = Math.atan2(nx, -nz);
    // Footstep timing: a step every stride; sneaking is silent.
    player.stepTimer -= dt;
    if (player.stepTimer <= 0) {
      player.stepTimer = player.sneaking ? 0.55 : 0.38;
      player.stepped = true;
    }
    player.noise = player.sneaking ? 0.12 : 0.55;
  } else {
    player.noise = 0;
  }
  player.noiseFlash = Math.max(0, player.noiseFlash - dt * 2);
  syncPlayerFigure(player, dt);
}

// Throw a coin toward a floor point. Returns the coin's landing spot or null.
export function throwCoin(player, scene, tx, tz) {
  if (player.coins <= 0 || player.coinInFlight) return null;
  player.coins -= 1;
  player.coinsThrown += 1;
  const dx = tx - player.x;
  const dz = tz - player.z;
  const dist = Math.hypot(dx, dz);
  const maxThrow = 9;
  const t = dist > maxThrow ? maxThrow / dist : 1;
  const landX = player.x + dx * t;
  const landZ = player.z + dz * t;
  const figure = makeCoinFigure();
  figure.position.set(player.x, 0.6, player.z);
  scene.add(figure);
  player.coinInFlight = { figure, fromX: player.x, fromZ: player.z, x: landX, z: landZ, t: 0 };
  player.noiseFlash = 1;
  return { x: landX, z: landZ };
}

// Advance a thrown coin; returns the landing spot the frame it lands.
export function updateCoin(player, scene, dt) {
  const coin = player.coinInFlight;
  if (!coin) return null;
  coin.t += dt * 2.2;
  if (coin.t >= 1) {
    coin.figure.position.set(coin.x, 0.1, coin.z);
    scene.remove(coin.figure);
    player.coinInFlight = null;
    return { x: coin.x, z: coin.z };
  }
  const x = coin.fromX + (coin.x - coin.fromX) * coin.t;
  const z = coin.fromZ + (coin.z - coin.fromZ) * coin.t;
  const y = 0.6 + Math.sin(coin.t * Math.PI) * 1.2;
  coin.figure.position.set(x, y, z);
  return null;
}

// Nearest grabbable loot, or the star, or null.
export function nearestGrabbable(player) {
  let best = null;
  let bestD = GRAB_DIST;
  for (const spot of LOOT_SPOTS) {
    if (player.loot.includes(spot.id)) continue;
    const d = Math.hypot(spot.x - player.x, spot.z - player.z);
    if (d < bestD) { bestD = d; best = { kind: 'loot', spot }; }
  }
  if (!player.hasStar) {
    const d = Math.hypot(STAR_SPOT.x - player.x, STAR_SPOT.z - player.z);
    if (d < bestD + 0.4) best = { kind: 'star', spot: null };
  }
  return best;
}

export function grabLoot(player, target) {
  if (!target) return null;
  if (target.kind === 'star') {
    player.hasStar = true;
    player.score += 1000;
    return { kind: 'star', name: 'The Meridian Star', value: 1000 };
  }
  player.loot.push(target.spot.id);
  player.score += target.spot.value;
  player.coins = Math.min(MAX_COINS, player.coins + 1);
  return { kind: 'loot', name: target.spot.name, value: target.spot.value };
}

export function atExit(player) {
  return Math.hypot(EXIT_SPOT.x - player.x, EXIT_SPOT.z - player.z) < 1.8;
}

export function respawnPlayer(player) {
  player.x = PLAYER_START.x;
  player.z = PLAYER_START.z;
  player.facing = 0;
  player.alive = true;
  player.noise = 0;
  syncPlayerFigure(player, 0);
}
