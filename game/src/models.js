// models.js — procedural Three.js figures and props for The Gilded Hour.
// Everything is built from primitives with named materials, so the museum
// reads at a glance from the top-down camera: dark cloak vs navy uniform,
// gold loot vs grey stone, warm lamp light vs cold shadow. No faces are
// modelled anywhere: the camera looks down on hoods, caps and shoulders.
import { createSeededRng } from './rng.js';

const MAT = {};
let glowTexture = null;

function mat(key, color, opts) {
  if (!MAT[key]) {
    MAT[key] = new THREE.MeshStandardMaterial({
      color,
      roughness: opts && opts.rough !== undefined ? opts.rough : 0.85,
      metalness: opts && opts.metal !== undefined ? opts.metal : 0.0,
      emissive: opts && opts.glow ? color : 0x000000,
      emissiveIntensity: opts && opts.glow ? 0.9 : 0,
      transparent: !!(opts && opts.clear),
      opacity: opts && opts.opacity !== undefined ? opts.opacity : 1,
    });
  }
  return MAT[key];
}

export function materialFor(key, color, opts) {
  return mat(key, color, opts);
}

// Soft radial glow sprite texture, painted once on a canvas at runtime.
export function glowSpriteTexture() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

export function makeGlowSprite(color, scale) {
  const m = new THREE.SpriteMaterial({
    map: glowSpriteTexture(),
    color,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const s = new THREE.Sprite(m);
  s.scale.set(scale, scale, 1);
  return s;
}

function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rt, rb, h, material, x, y, z, seg) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function ball(r, material, x, y, z, squash) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), material);
  m.position.set(x, y, z);
  if (squash) m.scale.y = squash;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// --- The player: "Wren", a small hooded thief seen from above. ---
// Hood cone + cloak shoulders + satchel. Dark teal so she reads against
// the warm floor, with a faint gold clasp as the one bright mark.
export function makePlayerFigure() {
  const g = new THREE.Group();
  const cloak = mat('cloak', 0x2a6a66, { rough: 0.9 });
  const cloakDark = mat('cloakDark', 0x1a4442, { rough: 0.95 });
  const gold = mat('goldTrim', 0xc9a227, { rough: 0.35, metal: 0.8 });

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  g.add(shadow);

  const shoulders = ball(0.42, cloak, 0, 0.42, 0, 0.55);
  g.add(shoulders);
  const torso = cyl(0.3, 0.42, 0.55, cloakDark, 0, 0.55, 0, 10);
  g.add(torso);
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.62, 10), cloak);
  hood.position.set(0, 1.05, 0);
  hood.castShadow = true;
  g.add(hood);
  const hoodTip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 8), cloakDark);
  hoodTip.position.set(0, 1.42, -0.08);
  hoodTip.rotation.x = 0.5;
  g.add(hoodTip);
  const clasp = ball(0.07, gold, 0, 0.62, 0.38, 1);
  g.add(clasp);
  // A faint teal aura so Wren reads against the dark floor at a glance.
  const aura = makeGlowSprite(0x2fd6c8, 2.0);
  aura.material.opacity = 0.3;
  aura.position.y = 0.5;
  g.add(aura);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.68, 24),
    new THREE.MeshBasicMaterial({ color: 0x2fd6c8, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);
  const satchel = box(0.22, 0.3, 0.12, mat('leather', 0x5a3a1e, { rough: 0.9 }), 0.32, 0.55, -0.12);
  g.add(satchel);
  g.userData.hood = hood;
  g.userData.shoulders = shoulders;
  return g;
}

// --- A guard: navy uniform, peaked cap with gold band, lantern in hand. ---
// The cap brim and the pale face-disc under it are what make a guard
// readable as a person from the top-down camera, never a box.
export function makeGuardFigure(uniformColor) {
  const g = new THREE.Group();
  const uniform = mat('guard' + uniformColor.toString(16), uniformColor, { rough: 0.85 });
  const dark = mat('guardDark', 0x141c2e, { rough: 0.9 });
  const skin = mat('guardSkin', 0xd9a986, { rough: 0.7 });
  const gold = mat('goldTrim', 0xc9a227, { rough: 0.35, metal: 0.8 });
  const lampGlow = mat('lampGlow', 0xffd27a, { rough: 0.4, glow: true });

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.6, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  g.add(shadow);

  const shoulders = ball(0.46, uniform, 0, 0.5, 0, 0.55);
  g.add(shoulders);
  const torso = cyl(0.34, 0.48, 0.7, uniform, 0, 0.6, 0, 10);
  g.add(torso);
  const belt = cyl(0.4, 0.4, 0.1, dark, 0, 0.55, 0, 10);
  g.add(belt);
  const buckle = box(0.12, 0.06, 0.04, gold, 0, 0.55, 0.4);
  g.add(buckle);
  const face = ball(0.26, skin, 0, 1.08, 0, 0.8);
  g.add(face);
  const capTop = cyl(0.3, 0.32, 0.14, dark, 0, 1.32, 0, 12);
  g.add(capTop);
  const capBand = cyl(0.33, 0.33, 0.06, gold, 0, 1.24, 0, 12);
  g.add(capBand);
  const brim = box(0.34, 0.03, 0.22, dark, 0, 1.26, 0.3);
  g.add(brim);
  // Lantern held out to the side, the warm dot that betrays a patrol.
  const arm = cyl(0.07, 0.07, 0.5, uniform, 0.42, 0.7, 0.18, 8);
  arm.rotation.z = -0.9;
  g.add(arm);
  const lamp = ball(0.11, lampGlow, 0.62, 0.62, 0.32, 1);
  g.add(lamp);
  const lampHalo = makeGlowSprite(0xffc46a, 1.1);
  lampHalo.position.set(0.62, 0.62, 0.32);
  g.add(lampHalo);
  g.userData.lampHalo = lampHalo;
  g.userData.face = face;
  return g;
}

// --- Props. Each one is cover the player can read at a glance. ---

export function makePlinth() {
  const g = new THREE.Group();
  const stone = mat('marble', 0xb8b2a4, { rough: 0.6 });
  const stoneDark = mat('marbleDark', 0x8a8478, { rough: 0.7 });
  g.add(box(1.5, 0.25, 1.5, stoneDark, 0, 0.12, 0));
  g.add(box(1.1, 1.0, 1.1, stone, 0, 0.75, 0));
  g.add(box(1.35, 0.18, 1.35, stoneDark, 0, 1.32, 0));
  return g;
}

export function makeStatue(rng) {
  const g = new THREE.Group();
  const bronze = mat('bronze', 0x8c6a2f, { rough: 0.45, metal: 0.7 });
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.42, 0.13, 48, 8), bronze);
  knot.position.y = 0.55;
  knot.castShadow = true;
  g.add(knot);
  g.add(cyl(0.3, 0.42, 0.18, bronze, 0, 0.09, 0, 10));
  return g;
}

export function makeCrate(size) {
  const g = new THREE.Group();
  const wood = mat('crateWood', 0x6b4a26, { rough: 0.9 });
  const woodDark = mat('crateDark', 0x4a3018, { rough: 0.95 });
  const s = size || 1.4;
  g.add(box(s, s * 0.8, s, wood, 0, s * 0.4, 0));
  g.add(box(s + 0.06, 0.1, s + 0.06, woodDark, 0, s * 0.78, 0));
  g.add(box(s + 0.06, 0.1, s + 0.06, woodDark, 0, 0.08, 0));
  return g;
}

export function makePillar() {
  const g = new THREE.Group();
  const stone = mat('marble', 0xb8b2a4, { rough: 0.6 });
  const stoneDark = mat('marbleDark', 0x8a8478, { rough: 0.7 });
  g.add(box(1.3, 0.3, 1.3, stoneDark, 0, 0.15, 0));
  g.add(cyl(0.5, 0.55, 3.4, stone, 0, 2.0, 0, 12));
  g.add(box(1.2, 0.3, 1.2, stoneDark, 0, 3.85, 0));
  return g;
}

export function makePlant(rng) {
  const g = new THREE.Group();
  const pot = mat('pot', 0x7a3b2e, { rough: 0.85 });
  const leaf = mat('leaf', 0x2e6b34, { rough: 0.9 });
  const leafLight = mat('leafLight', 0x3f8a44, { rough: 0.9 });
  g.add(cyl(0.42, 0.32, 0.55, pot, 0, 0.28, 0, 10));
  const n = 5;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.5;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.5 + rng() * 0.5, 7), i % 2 ? leaf : leafLight);
    cone.position.set(Math.cos(a) * 0.18, 1.15, Math.sin(a) * 0.18);
    cone.rotation.z = Math.cos(a) * 0.35;
    cone.rotation.x = -Math.sin(a) * 0.35;
    cone.castShadow = true;
    g.add(cone);
  }
  return g;
}

export function makeVelvetRope() {
  const g = new THREE.Group();
  const brass = mat('brass', 0xb08d3e, { rough: 0.35, metal: 0.8 });
  const velvet = mat('velvet', 0x6e1423, { rough: 0.95 });
  g.add(cyl(0.05, 0.05, 1.0, brass, -0.9, 0.5, 0, 8));
  g.add(cyl(0.05, 0.05, 1.0, brass, 0.9, 0.5, 0, 8));
  g.add(ball(0.09, brass, -0.9, 1.05, 0, 1));
  g.add(ball(0.09, brass, 0.9, 1.05, 0, 1));
  const rope = cyl(0.05, 0.05, 1.8, velvet, 0, 0.82, 0, 8);
  rope.rotation.z = Math.PI / 2;
  g.add(rope);
  return g;
}

export function makeDisplayCase() {
  const g = new THREE.Group();
  const stoneDark = mat('marbleDark', 0x8a8478, { rough: 0.7 });
  const glass = mat('glass', 0x9fc4d4, { rough: 0.15, metal: 0.1, clear: true, opacity: 0.28 });
  g.add(box(1.4, 0.9, 1.4, stoneDark, 0, 0.45, 0));
  const dome = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 1.2), glass);
  dome.position.y = 1.25;
  dome.castShadow = false;
  g.add(dome);
  return g;
}

// The Meridian Star: a faceted gold octahedron on a cushion, glowing.
export function makeMeridianStar() {
  const g = new THREE.Group();
  const gold = mat('starGold', 0xffd94a, { rough: 0.2, metal: 0.9, glow: true });
  const cushion = mat('cushion', 0x6e1423, { rough: 0.95 });
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), gold);
  star.position.y = 1.15;
  star.castShadow = true;
  g.add(star);
  const cushionMesh = cyl(0.5, 0.6, 0.22, cushion, 0, 0.72, 0, 12);
  g.add(cushionMesh);
  const halo = makeGlowSprite(0xffd94a, 3.2);
  halo.position.y = 1.15;
  g.add(halo);
  const light = new THREE.PointLight(0xffd94a, 12, 9, 1.8);
  light.position.y = 1.6;
  g.add(light);
  g.userData.star = star;
  g.userData.halo = halo;
  return g;
}

export function makeLootFigure(kind) {
  const g = new THREE.Group();
  if (kind === 'fox') {
    const jade = mat('jade', 0x2fae7d, { rough: 0.3, metal: 0.2 });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 4), jade);
    body.position.y = 0.4;
    body.rotation.y = Math.PI / 4;
    body.castShadow = true;
    g.add(body);
    const head = ball(0.2, jade, 0, 0.85, 0.1, 1);
    g.add(head);
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.25, 4), jade);
    earL.position.set(-0.12, 1.05, 0.1);
    g.add(earL);
    const earR = earL.clone();
    earR.position.x = 0.12;
    g.add(earR);
  } else if (kind === 'crown') {
    const gold = mat('starGold', 0xffd94a, { rough: 0.2, metal: 0.9, glow: true });
    g.add(cyl(0.34, 0.4, 0.22, gold, 0, 0.35, 0, 8));
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 4), gold);
      spike.position.set(Math.cos(a) * 0.34, 0.6, Math.sin(a) * 0.34);
      g.add(spike);
    }
  } else {
    // Ember Violin: warm wood body + neck, resting upright.
    const wood = mat('violinWood', 0x8a4a1e, { rough: 0.5 });
    const ember = mat('ember', 0xff7a2a, { rough: 0.4, glow: true });
    const body = ball(0.32, wood, 0, 0.4, 0, 0.6);
    body.scale.z = 0.45;
    g.add(body);
    const neck = cyl(0.05, 0.05, 0.7, wood, 0, 0.95, 0.05, 8);
    neck.rotation.x = -0.25;
    g.add(neck);
    const glow = makeGlowSprite(0xff7a2a, 1.4);
    glow.position.y = 0.5;
    g.add(glow);
    void ember;
  }
  const halo = makeGlowSprite(0xffe9a8, 1.6);
  halo.position.y = 0.6;
  g.add(halo);
  return g;
}

export function makeCoinFigure() {
  const g = new THREE.Group();
  const gold = mat('starGold', 0xffd94a, { rough: 0.2, metal: 0.9, glow: true });
  const coin = cyl(0.16, 0.16, 0.04, gold, 0, 0.1, 0, 12);
  g.add(coin);
  return g;
}

// Dust motes drifting in the skylight beam: tiny points, seeded positions.
export function makeDustMotes(seed, count) {
  const rng = createSeededRng(seed);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (rng() - 0.5) * 6;
    positions[i * 3 + 1] = rng() * 5;
    positions[i * 3 + 2] = 14 + (rng() - 0.5) * 6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffe9a8, size: 0.08, transparent: true, opacity: 0.7, depthWrite: false,
  }));
  return points;
}
