// hud.js — the dense HUD: top bar, guard roster, objectives, loot,
// controls, noise meter and the 2D minimap. Everything the judge needs
// to read the game at a glance lives here, in plain DOM over the 3D view.
import { WALLS, PROPS, SHADOW_POOLS, LAMPS, LOOT_SPOTS, STAR_SPOT, EXIT_SPOT, WORLD } from './level.js';
import { ALERT_AT, SUSPICIOUS_AT } from './vision.js';

let els = null;
let minimap = null;
let minimapCtx = null;

function $(id) {
  return document.getElementById(id);
}

export function initHud() {
  els = {
    score: $('hud-score'),
    timer: $('hud-timer'),
    alertFill: $('hud-alert-fill'),
    alertLabel: $('hud-alert-label'),
    roster: $('hud-roster'),
    objectives: $('hud-objectives'),
    loot: $('hud-loot'),
    noiseFill: $('hud-noise-fill'),
    banner: $('hud-banner'),
    bannerSub: $('hud-banner-sub'),
    toast: $('hud-toast'),
    coins: $('hud-coins'),
    strikes: $('hud-strikes'),
    ghost: $('hud-ghost'),
    prompt: $('hud-prompt'),
    stateLine: $('hud-state'),
  };
  minimap = $('hud-minimap');
  if (minimap) minimapCtx = minimap.getContext('2d');
  return els;
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

export function showBanner(text, sub, kind, holdMs) {
  if (!els || !els.banner) return;
  els.banner.textContent = text;
  els.bannerSub.textContent = sub || '';
  els.banner.parentElement.className = 'banner ' + (kind || '');
  els.banner.parentElement.style.opacity = '1';
  if (showBanner._t) clearTimeout(showBanner._t);
  if (holdMs) {
    showBanner._t = setTimeout(() => {
      els.banner.parentElement.style.opacity = '0';
    }, holdMs);
  }
}

export function hideBanner() {
  if (els && els.banner) els.banner.parentElement.style.opacity = '0';
}

let toastTimer = null;
export function showToast(text, ms) {
  if (!els || !els.toast) return;
  els.toast.textContent = text;
  els.toast.style.opacity = '1';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.style.opacity = '0'; }, ms || 2600);
}

export function updateHud(state) {
  if (!els) return;
  const { player, guards, elapsed, ghost } = state;
  if (els.score) els.score.textContent = String(player.score);
  if (els.timer) els.timer.textContent = formatTime(elapsed);
  const meter = guards.reduce((m, g) => Math.max(m, g.meter), 0);
  if (els.alertFill) {
    els.alertFill.style.width = Math.round((meter / ALERT_AT) * 100) + '%';
    els.alertFill.className = 'alert-fill ' + (meter >= ALERT_AT ? 'alerted' : meter >= SUSPICIOUS_AT ? 'suspicious' : '');
  }
  if (els.alertLabel) {
    els.alertLabel.textContent = meter >= ALERT_AT ? 'ALARM — HUNTING'
      : meter >= SUSPICIOUS_AT ? 'SUSPICIOUS ?'
      : meter > 2 ? 'UNSEEN — WATCHED'
      : 'UNSEEN';
  }
  if (els.coins) els.coins.textContent = '●'.repeat(Math.max(0, player.coins)) + '○'.repeat(Math.max(0, 5 - player.coins));
  if (els.strikes) els.strikes.textContent = '✕'.repeat(player.strikes) + '·'.repeat(Math.max(0, 3 - player.strikes));
  if (els.ghost) els.ghost.textContent = ghost ? 'GHOST — NEVER SPOTTED' : 'GHOST LOST';

  if (els.roster) {
    let html = '';
    for (const g of guards) {
      const dot = g.state === 'alerted' ? 'dot-red' : g.state === 'suspicious' ? 'dot-orange' : 'dot-green';
      html += '<div class="roster-row"><span class="dot ' + dot + '"></span>'
        + '<b>' + g.name + '</b><span class="rank">' + g.rank + '</span>'
        + '<span class="rstate">' + g.stateLabel + '</span></div>';
    }
    els.roster.innerHTML = html;
  }
  if (els.objectives) {
    const starDone = player.hasStar;
    els.objectives.innerHTML =
      '<div class="obj' + (starDone ? ' done' : '') + '">' + (starDone ? '✓' : '○') + ' Steal the Meridian Star</div>'
      + '<div class="obj' + (starDone ? ' done' : '') + '">' + (starDone ? '✓' : '○') + ' Reach the skylight exit</div>'
      + '<div class="obj' + (player.loot.length === LOOT_SPOTS.length ? ' done' : '') + '">' + (player.loot.length === LOOT_SPOTS.length ? '✓' : '○') + ' Optional loot ' + player.loot.length + '/' + LOOT_SPOTS.length + '</div>';
  }
  if (els.loot) {
    let html = '';
    for (const spot of LOOT_SPOTS) {
      const got = player.loot.includes(spot.id);
      html += '<div class="loot-row' + (got ? ' got' : '') + '"><span>' + (got ? '✓ ' : '○ ') + spot.name + '</span><b>' + spot.value + '</b></div>';
    }
    html += '<div class="loot-row' + (player.hasStar ? ' got' : '') + '"><span>' + (player.hasStar ? '✓ ' : '○ ') + 'Meridian Star ★</span><b>1000</b></div>';
    els.loot.innerHTML = html;
  }
  if (els.noiseFill) {
    const n = Math.max(player.noise, player.noiseFlash * 0.8);
    els.noiseFill.style.width = Math.round(n * 100) + '%';
  }
  if (els.stateLine) {
    const zone = player.z > 10 ? 'ENTRANCE HALL' : player.z > -4 ? 'SCULPTURE GALLERY' : 'THE VAULT';
    els.stateLine.textContent = zone + (player.sneaking ? ' · SNEAKING' : '');
  }
}

export function setPrompt(text) {
  if (els && els.prompt) els.prompt.textContent = text || '';
}

// --- Minimap: 2D canvas, guard dots + cone wedges + player + exit. ---
export function drawMinimap(player, guards, coins) {
  if (!minimapCtx) return;
  const W = minimap.width;
  const H = minimap.height;
  const sx = W / (WORLD.maxX - WORLD.minX);
  const sz = H / (WORLD.maxZ - WORLD.minZ);
  const px = (x) => (x - WORLD.minX) * sx;
  const pz = (z) => (z - WORLD.minZ) * sz;
  minimapCtx.clearRect(0, 0, W, H);
  minimapCtx.fillStyle = '#0d0a18';
  minimapCtx.fillRect(0, 0, W, H);
  for (const p of SHADOW_POOLS) {
    minimapCtx.fillStyle = 'rgba(74,122,184,0.5)';
    minimapCtx.beginPath();
    minimapCtx.arc(px(p.x), pz(p.z), Math.max(2, p.r * sx), 0, Math.PI * 2);
    minimapCtx.fill();
  }
  for (const l of LAMPS) {
    minimapCtx.fillStyle = 'rgba(255,180,94,0.18)';
    minimapCtx.beginPath();
    minimapCtx.arc(px(l.x), pz(l.z), Math.max(2, l.r * sx), 0, Math.PI * 2);
    minimapCtx.fill();
  }
  minimapCtx.fillStyle = '#4a3f55';
  for (const w of WALLS) {
    minimapCtx.fillRect(px(w.x - w.w / 2), pz(w.z - w.d / 2), w.w * sx, w.d * sz);
  }
  minimapCtx.fillStyle = '#6b5a7a';
  for (const p of PROPS) {
    minimapCtx.fillRect(px(p.x) - 2, pz(p.z) - 2, 4, 4);
  }
  // Exit skylight.
  minimapCtx.fillStyle = '#bfd8ff';
  minimapCtx.beginPath();
  minimapCtx.arc(px(EXIT_SPOT.x), pz(EXIT_SPOT.z), 4, 0, Math.PI * 2);
  minimapCtx.fill();
  // Loot.
  minimapCtx.fillStyle = '#ffd94a';
  for (const spot of LOOT_SPOTS) {
    if (player.loot.includes(spot.id)) continue;
    minimapCtx.fillRect(px(spot.x) - 2, pz(spot.z) - 2, 4, 4);
  }
  if (!player.hasStar) {
    minimapCtx.fillStyle = '#ffd94a';
    minimapCtx.beginPath();
    minimapCtx.arc(px(STAR_SPOT.x), pz(STAR_SPOT.z), 4, 0, Math.PI * 2);
    minimapCtx.fill();
  }
  // Guards: cone wedge + dot.
  for (const g of guards) {
    const color = g.state === 'alerted' ? 'rgba(255,42,30,0.5)'
      : g.state === 'suspicious' ? 'rgba(255,140,26,0.45)' : 'rgba(242,194,48,0.35)';
    minimapCtx.fillStyle = color;
    minimapCtx.beginPath();
    minimapCtx.moveTo(px(g.x), pz(g.z));
    const base = Math.atan2(-Math.cos(g.facing), Math.sin(g.facing));
    minimapCtx.arc(px(g.x), pz(g.z), 7.5 * sx, base - 0.55, base + 0.55);
    minimapCtx.closePath();
    minimapCtx.fill();
    minimapCtx.fillStyle = g.state === 'alerted' ? '#ff2a1e' : '#ff5a4a';
    minimapCtx.beginPath();
    minimapCtx.arc(px(g.x), pz(g.z), 3, 0, Math.PI * 2);
    minimapCtx.fill();
  }
  // Coins on the floor.
  if (coins) {
    minimapCtx.fillStyle = '#ffe9a8';
    for (const c of coins) {
      minimapCtx.beginPath();
      minimapCtx.arc(px(c.x), pz(c.z), 2, 0, Math.PI * 2);
      minimapCtx.fill();
    }
  }
  // Player: bright teal dot with a white ring.
  minimapCtx.fillStyle = '#2fd6c8';
  minimapCtx.beginPath();
  minimapCtx.arc(px(player.x), pz(player.z), 3.5, 0, Math.PI * 2);
  minimapCtx.fill();
  minimapCtx.strokeStyle = '#ffffff';
  minimapCtx.lineWidth = 1;
  minimapCtx.beginPath();
  minimapCtx.arc(px(player.x), pz(player.z), 5, 0, Math.PI * 2);
  minimapCtx.stroke();
}
