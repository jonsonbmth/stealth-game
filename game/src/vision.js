// vision.js — vision cones, line-of-sight and the 3-state detection meter.
// CALM -> SUSPICIOUS -> ALERTED. The meter fills only while a guard can
// actually see you (inside the cone, line of sight clear, and lit), and it
// drains the moment you break sight or reach shadow — the player always
// has a chance to recover.
import { lineOfSightBlocked, pointInShadow, pointInLampLight } from './level.js';

export const CONE_RANGE = 7.5;
export const CONE_HALF_ANGLE = 0.55; // ~31 degrees each side
export const SUSPICIOUS_AT = 35;
export const ALERT_AT = 100;
export const FILL_RATE = 55; // meter points per second, fully lit and walking
export const DRAIN_RATE = 30;

export const CONE_COLORS = {
  calm: 0xf2c230, // warm yellow
  suspicious: 0xff8c1a, // orange
  alerted: 0xff2a1e, // red
};

function coneShapeGeometry() {
  const shape = new THREE.Shape();
  const steps = 24;
  shape.moveTo(0, 0);
  for (let i = 0; i <= steps; i += 1) {
    const a = -CONE_HALF_ANGLE + (2 * CONE_HALF_ANGLE * i) / steps;
    shape.lineTo(Math.sin(a) * CONE_RANGE, -Math.cos(a) * CONE_RANGE);
  }
  shape.lineTo(0, 0);
  const geo = new THREE.ShapeGeometry(shape, 8);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

let coneGeo = null;

// A translucent sector mesh lying on the floor, pointing where the guard
// faces. One mesh per guard; colour follows the guard's state.
export function makeVisionCone() {
  if (!coneGeo) coneGeo = coneShapeGeometry();
  const mesh = new THREE.Mesh(
    coneGeo,
    new THREE.MeshBasicMaterial({
      color: CONE_COLORS.calm, transparent: true, opacity: 0.3,
      depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  mesh.position.y = 0.06;
  mesh.renderOrder = 2;
  return mesh;
}

export function setConeState(coneMesh, state) {
  const color = CONE_COLORS[state] || CONE_COLORS.calm;
  coneMesh.material.color.setHex(color);
  coneMesh.material.opacity = state === 'alerted' ? 0.42 : state === 'suspicious' ? 0.36 : 0.28;
}

// The flashlight pool at the guard's feet: a warm disc that travels with
// the cone and shows where the guard is looking right now.
export function makeFlashlightPool() {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 20),
    new THREE.MeshBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0.22,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.05;
  mesh.renderOrder = 1;
  return mesh;
}

// Is the player inside this guard's cone, with a clear line of sight?
export function playerVisibleFrom(guardX, guardZ, facing, playerX, playerZ) {
  const dx = playerX - guardX;
  const dz = playerZ - guardZ;
  const dist = Math.hypot(dx, dz);
  if (dist > CONE_RANGE) return { seen: false, dist };
  if (dist < 0.6) return { seen: true, dist }; // too close to miss
  const angleTo = Math.atan2(dx, -dz);
  let diff = angleTo - facing;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) > CONE_HALF_ANGLE) return { seen: false, dist };
  if (lineOfSightBlocked(guardX, guardZ, playerX, playerZ)) return { seen: false, dist };
  return { seen: true, dist };
}

// How fast the alert meter fills for this sighting. Shadow hides you,
// lamp light exposes you, sneaking buys time.
export function detectionRate(playerX, playerZ, sneaking, moving) {
  let rate = FILL_RATE;
  if (pointInShadow(playerX, playerZ)) rate *= 0.2;
  if (pointInLampLight(playerX, playerZ)) rate *= 1.6;
  if (sneaking) rate *= 0.45;
  if (!moving) rate *= 0.6;
  return rate;
}

// A "CLOSE!" near miss: inside a cone but only just — close enough that
// the meter is ticking, far enough that the guard has not turned yet.
export function isNearMiss(guardX, guardZ, facing, playerX, playerZ) {
  const dx = playerX - guardX;
  const dz = playerZ - guardZ;
  const dist = Math.hypot(dx, dz);
  if (dist > CONE_RANGE || dist < 0.6) return false;
  const angleTo = Math.atan2(dx, -dz);
  let diff = angleTo - facing;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const edge = Math.abs(Math.abs(diff) - CONE_HALF_ANGLE);
  return edge < 0.12 && !lineOfSightBlocked(guardX, guardZ, playerX, playerZ);
}
