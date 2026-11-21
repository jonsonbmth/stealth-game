// level.js — the Meridian Gallery: one deep level, three zones.
// Entrance Hall (z 10..18) -> Sculpture Gallery (z -4..10) -> the Vault
// (z -18..-4). Walls are axis-aligned boxes; the same list drives
// collision, line-of-sight and the minimap, so what you see is what the
// guards can and cannot see through.
import { createSeededRng } from './rng.js';
import {
  makePlinth, makeStatue, makeCrate, makePillar, makePlant,
  makeVelvetRope, makeDisplayCase, makeMeridianStar, makeLootFigure,
  makeGlowSprite, makeDustMotes,
} from './models.js';

export const WORLD = { minX: -24, maxX: 24, minZ: -18, maxZ: 18 };
export const SEED = 20261121;

// Wall rectangles: {x, z, w, d} centred. Doors are gaps left between them.
export const WALLS = [
  // Outer shell (4 sides, built as thick bars).
  { x: 0, z: -18.6, w: 49.2, d: 1.2 },
  { x: 0, z: 18.6, w: 49.2, d: 1.2 },
  { x: -24.6, z: 0, w: 1.2, d: 37.2 },
  { x: 24.6, z: 0, w: 1.2, d: 37.2 },
  // Cross wall Entrance Hall | Sculpture Gallery (z = 10), door at x -2..2.
  { x: -13.5, z: 10, w: 21, d: 1 },
  { x: 13.5, z: 10, w: 21, d: 1 },
  // Cross wall Sculpture Gallery | Vault (z = -4), doors at x -2..2 and x 16..20.
  { x: -13.5, z: -4, w: 21, d: 1 },
  { x: 7, z: -4, w: 12, d: 1 },
  { x: 22, z: -4, w: 4, d: 1 },
];

// Cover props that block movement and sight: {kind, x, z, rot, size}.
export const PROPS = [
  { kind: 'pillar', x: -10, z: 14 },
  { kind: 'pillar', x: 10, z: 14 },
  { kind: 'pillar', x: -10, z: -14 },
  { kind: 'pillar', x: 10, z: -14 },
  { kind: 'pillar', x: -18, z: 3 },
  { kind: 'pillar', x: 18, z: 3 },
  { kind: 'crate', x: -16, z: 16, size: 1.6 },
  { kind: 'crate', x: -14.4, z: 16, size: 1.1 },
  { kind: 'crate', x: 16, z: 16, size: 1.6 },
  { kind: 'crate', x: 14.4, z: 17, size: 1.0 },
  { kind: 'crate', x: -20, z: -10, size: 1.5 },
  { kind: 'crate', x: 20, z: -12, size: 1.5 },
  { kind: 'crate', x: 6, z: -12, size: 1.3 },
  { kind: 'plinth', x: -6, z: 5 },
  { kind: 'plinth', x: 6, z: 5 },
  { kind: 'plinth', x: -6, z: -10 },
  { kind: 'plinth', x: 6, z: -10 },
  { kind: 'plant', x: -22, z: 12 },
  { kind: 'plant', x: 22, z: 12 },
  { kind: 'plant', x: -22, z: -16 },
  { kind: 'plant', x: 22, z: -16 },
  { kind: 'plant', x: -4, z: 0 },
  { kind: 'plant', x: 4, z: 0 },
  { kind: 'rope', x: -12, z: 8, rot: 0 },
  { kind: 'rope', x: 12, z: 8, rot: 0 },
  { kind: 'case', x: -16, z: 5 },
  { kind: 'case', x: 16, z: 5 },
];

// Dark shadow pools: standing inside one hides you (detection x0.2).
export const SHADOW_POOLS = [
  { x: -18, z: 14, r: 2.4 },
  { x: 18, z: 14, r: 2.4 },
  { x: -16, z: -1, r: 2.6 },
  { x: 16, z: -1, r: 2.6 },
  { x: 0, z: -12, r: 2.2 },
  { x: -8, z: 7, r: 2.2 },
  { x: 8, z: 7, r: 2.2 },
  { x: 2.5, z: -6.5, r: 2.0 },
];

// Warm lamp pools: standing in one makes you easier to spot (detection x1.6).
export const LAMPS = [
  { x: -12, z: 16, r: 5.5 },
  { x: 12, z: 16, r: 5.5 },
  { x: 0, z: 4, r: 6.5 },
  { x: -18, z: -10, r: 5 },
  { x: 18, z: -10, r: 5 },
  { x: 0, z: -14, r: 6 },
];

export const LOOT_SPOTS = [
  { id: 'fox', name: 'Jade Fox', value: 300, x: -16, z: 5, kind: 'fox' },
  { id: 'crown', name: 'Sunken Crown', value: 400, x: 16, z: 5, kind: 'crown' },
  { id: 'violin', name: 'Ember Violin', value: 250, x: -16, z: 14, kind: 'violin' },
];

export const STAR_SPOT = { x: 0, z: -15 };
export const EXIT_SPOT = { x: 0, z: 16.5 };
export const PLAYER_START = { x: 0, z: 16.8 };

// Circle radius of each prop kind, for collision + sight blocking.
export function propRadius(kind) {
  if (kind === 'pillar') return 0.75;
  if (kind === 'crate') return 1.0;
  if (kind === 'plinth') return 1.0;
  if (kind === 'plant') return 0.55;
  if (kind === 'case') return 1.0;
  return 0.5;
}

export function pointInShadow(x, z) {
  for (const p of SHADOW_POOLS) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz < p.r * p.r) return true;
  }
  return false;
}

export function pointInLampLight(x, z) {
  for (const l of LAMPS) {
    const dx = x - l.x;
    const dz = z - l.z;
    if (dx * dx + dz * dz < l.r * l.r) return true;
  }
  return false;
}

// 2D segment vs wall-rectangle test, used by line-of-sight.
function segmentHitsRect(x1, z1, x2, z2, r) {
  const minX = r.x - r.w / 2;
  const maxX = r.x + r.w / 2;
  const minZ = r.z - r.d / 2;
  const maxZ = r.z + r.d / 2;
  let tmin = 0;
  let tmax = 1;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const axes = [
    [x1, dx, minX, maxX],
    [z1, dz, minZ, maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
    } else {
      let ta = (lo - o) / d;
      let tb = (hi - o) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > tmin) tmin = ta;
      if (tb < tmax) tmax = tb;
      if (tmin > tmax) return false;
    }
  }
  return true;
}

export function lineOfSightBlocked(x1, z1, x2, z2) {
  for (const w of WALLS) {
    if (segmentHitsRect(x1, z1, x2, z2, w)) return true;
  }
  // Tall props (pillars, crates, plinths, cases) also block sight.
  for (const p of PROPS) {
    if (p.kind === 'plant' || p.kind === 'rope') continue;
    const r = propRadius(p.kind);
    const cx = p.x;
    const cz = p.z;
    // Distance from segment to prop centre.
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len2 = dx * dx + dz * dz;
    let t = len2 === 0 ? 0 : ((cx - x1) * dx + (cz - z1) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + t * dx - cx;
    const pz = z1 + t * dz - cz;
    if (px * px + pz * pz < r * r * 0.7) return true;
  }
  return false;
}

function marbleFloorTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2438';
  ctx.fillRect(0, 0, 512, 384);
  const rng = createSeededRng(SEED);
  for (let ty = 0; ty < 6; ty += 1) {
    for (let tx = 0; tx < 8; tx += 1) {
      const warm = (tx + ty) % 2 === 0;
      const base = warm ? 62 + rng() * 14 : 46 + rng() * 10;
      ctx.fillStyle = `rgb(${base + 14},${base + 4},${base + 26})`;
      ctx.fillRect(tx * 64 + 1, ty * 64 + 1, 62, 62);
      ctx.fillStyle = 'rgba(255,220,150,0.05)';
      ctx.fillRect(tx * 64 + 1, ty * 64 + 1, 62, 6);
    }
  }
  // A faded gold inlay running down the gallery spine.
  ctx.fillStyle = 'rgba(201,162,39,0.35)';
  ctx.fillRect(252, 0, 8, 384);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 4.5);
  return tex;
}

// Build the whole static museum into the scene. Returns handles the
// game loop needs: loot meshes, the star group, the exit beam.
export function buildLevel(scene) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 38),
    new THREE.MeshStandardMaterial({ map: marbleFloorTexture(), roughness: 0.85, metalness: 0.05 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a3f55, roughness: 0.8 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.4, metalness: 0.6 });
  for (const w of WALLS) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w.w, 3.2, w.d), wallMat);
    m.position.set(w.x, 1.6, w.z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w.w, 0.12, w.d + 0.08), trimMat);
    trim.position.set(w.x, 3.2, w.z);
    scene.add(trim);
  }

  // Zone name plates painted on the floor as glowing strips.
  for (const [z, label] of [[14, 'ENTRANCE HALL'], [3, 'SCULPTURE GALLERY'], [-11, 'THE VAULT']]) {
    void label;
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xc9a227, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.02, z);
    scene.add(strip);
  }

  // Shadow pools: cold dark discs you can read as safe at a glance.
  for (const p of SHADOW_POOLS) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(p.r, 28),
      new THREE.MeshBasicMaterial({ color: 0x0a1428, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(p.x, 0.03, p.z);
    scene.add(disc);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(p.r - 0.12, p.r, 28),
      new THREE.MeshBasicMaterial({ color: 0x4a7ab8, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, 0.035, p.z);
    scene.add(ring);
  }

  // Lamp pools: warm light on the floor + a real point light above.
  for (const l of LAMPS) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(l.r, 28),
      new THREE.MeshBasicMaterial({ color: 0xffb45e, transparent: true, opacity: 0.1, depthWrite: false }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(l.x, 0.03, l.z);
    scene.add(disc);
    const pt = new THREE.PointLight(0xffb45e, 22, l.r + 4, 1.7);
    pt.position.set(l.x, 4.2, l.z);
    scene.add(pt);
    const glow = makeGlowSprite(0xffb45e, 4);
    glow.position.set(l.x, 3.6, l.z);
    scene.add(glow);
  }

  // Props.
  const rng = createSeededRng(SEED);
  for (const p of PROPS) {
    let mesh = null;
    if (p.kind === 'pillar') mesh = makePillar();
    else if (p.kind === 'crate') mesh = makeCrate(p.size);
    else if (p.kind === 'plinth') {
      mesh = makePlinth();
      const statue = makeStatue(rng);
      statue.position.y = 1.41;
      mesh.add(statue);
    } else if (p.kind === 'plant') mesh = makePlant(rng);
    else if (p.kind === 'rope') mesh = makeVelvetRope();
    else if (p.kind === 'case') mesh = makeDisplayCase();
    if (!mesh) continue;
    mesh.position.set(p.x, 0, p.z);
    if (p.rot) mesh.rotation.y = p.rot;
    scene.add(mesh);
  }

  // Loot figures on their cases / plinths.
  const lootMeshes = {};
  for (const spot of LOOT_SPOTS) {
    const fig = makeLootFigure(spot.kind);
    fig.position.set(spot.x, 1.62, spot.z);
    scene.add(fig);
    lootMeshes[spot.id] = fig;
  }

  // The Meridian Star on its plinth in the vault.
  const starPlinth = makePlinth();
  starPlinth.position.set(STAR_SPOT.x, 0, STAR_SPOT.z);
  scene.add(starPlinth);
  const star = makeMeridianStar();
  star.position.set(STAR_SPOT.x, 1.41, STAR_SPOT.z);
  scene.add(star);

  // The skylight exit: a column of cold moonlight in the Entrance Hall.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 2.2, 7, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xbfd8ff, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  beam.position.set(EXIT_SPOT.x, 3.5, EXIT_SPOT.z);
  scene.add(beam);
  const exitRing = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 2.1, 32),
    new THREE.MeshBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
  );
  exitRing.rotation.x = -Math.PI / 2;
  exitRing.position.set(EXIT_SPOT.x, 0.04, EXIT_SPOT.z);
  scene.add(exitRing);
  const exitGlow = makeGlowSprite(0xbfd8ff, 6);
  exitGlow.position.set(EXIT_SPOT.x, 1.2, EXIT_SPOT.z);
  scene.add(exitGlow);
  const exitLight = new THREE.PointLight(0xbfd8ff, 16, 10, 1.6);
  exitLight.position.set(EXIT_SPOT.x, 4.5, EXIT_SPOT.z);
  scene.add(exitLight);

  scene.add(makeDustMotes(SEED, 90));

  return { lootMeshes, star, beam, exitRing };
}
