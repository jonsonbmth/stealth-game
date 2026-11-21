// guards.js — named patrol guards and their state machine.
// Patrol waypoints are fixed and learnable. States:
//   patrol -> suspicious (meter >= 35: turn, look, "?" ) ->
//   alerted (meter 100: converge on last seen spot, then search, then
//   return to patrol). A guard that reaches the last-seen spot without
//   finding you searches, then walks home. Nobody teleports.
import { makeGuardFigure } from './models.js';
import {
  makeVisionCone, makeFlashlightPool, setConeState,
  playerVisibleFrom, detectionRate, isNearMiss,
  SUSPICIOUS_AT, ALERT_AT, DRAIN_RATE,
} from './vision.js';

export const GUARD_DEFS = [
  {
    name: 'Sgt. Marlowe', rank: 'Vault Sergeant', color: 0x2a3a5e,
    waypoints: [[-8, -14], [8, -14], [8, -8], [-8, -8]], pauseAt: 1.2,
  },
  {
    name: 'Pip', rank: 'Gallery Watch', color: 0x3a2a5e,
    waypoints: [[-14, 2], [14, 2], [14, 8], [-14, 8]], pauseAt: 0.9,
  },
  {
    name: 'Odo', rank: 'Hall Porter', color: 0x5e2a2a,
    waypoints: [[-12, 14], [12, 14]], pauseAt: 1.6,
  },
  {
    name: 'Bram', rank: 'Night Rover', color: 0x2a5e3a,
    waypoints: [[-20, 6], [20, 6], [20, -2], [-20, -2]], pauseAt: 0.6,
  },
];

const PATROL_SPEED = 2.2;
const HUNT_SPEED = 3.6;
const SEARCH_TIME = 5;
const CATCH_DIST = 0.95;

export function createGuards(scene) {
  const guards = GUARD_DEFS.map((def) => {
    const figure = makeGuardFigure(def.color);
    const cone = makeVisionCone();
    const pool = makeFlashlightPool();
    scene.add(figure);
    scene.add(cone);
    scene.add(pool);
    const [sx, sz] = def.waypoints[0];
    const [nx, nz] = def.waypoints[1];
    return {
      def,
      name: def.name,
      rank: def.rank,
      figure,
      cone,
      pool,
      x: sx,
      z: sz,
      facing: Math.atan2(nx - sx, -(nz - sz)),
      waypointIndex: 1,
      pauseLeft: 0,
      state: 'patrol', // patrol | suspicious | alerted | searching | returning
      meter: 0,
      lastSeenX: sx,
      lastSeenZ: sz,
      searchLeft: 0,
      investigateX: null,
      investigateZ: null,
      walkPhase: 0,
      stateLabel: 'PATROL',
    };
  });
  return guards;
}

function moveToward(guard, tx, tz, speed, dt) {
  const dx = tx - guard.x;
  const dz = tz - guard.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.05) return true;
  const step = Math.min(dist, speed * dt);
  guard.x += (dx / dist) * step;
  guard.z += (dz / dist) * step;
  guard.facing = Math.atan2(dx, -dz);
  return dist - step < 0.05;
}

function syncFigure(guard, dt) {
  guard.figure.position.set(guard.x, 0, guard.z);
  guard.figure.rotation.y = Math.PI - guard.facing;
  guard.cone.position.set(guard.x, 0.06, guard.z);
  guard.cone.rotation.y = Math.PI - guard.facing;
  const px = guard.x + Math.sin(guard.facing) * 2.4;
  const pz = guard.z - Math.cos(guard.facing) * 2.4;
  guard.pool.position.set(px, 0.05, pz);
  const moving = guard.state === 'patrol' || guard.state === 'alerted' || guard.state === 'returning';
  if (moving) guard.walkPhase += dt * 9;
  guard.figure.position.y = Math.abs(Math.sin(guard.walkPhase)) * 0.05;
  const coneState = guard.state === 'alerted' ? 'alerted'
    : guard.state === 'suspicious' ? 'suspicious' : 'calm';
  setConeState(guard.cone, coneState);
  guard.stateLabel = guard.state === 'patrol' ? 'PATROL'
    : guard.state === 'suspicious' ? 'SUSPICIOUS ?'
    : guard.state === 'alerted' ? 'HUNTING!'
    : guard.state === 'searching' ? 'SEARCHING'
    : 'RETURNING';
}

// One tick for every guard. Returns events the main loop turns into
// sound, banners and strikes: { spotted, nearMiss, caught, guard }.
export function updateGuards(guards, player, dt, events) {
  let anyAlerted = false;
  let nearMiss = false;
  for (const guard of guards) {
    const vis = playerVisibleFrom(guard.x, guard.z, guard.facing, player.x, player.z);
    if (vis.seen && player.alive) {
      const rate = detectionRate(player.x, player.z, player.sneaking, player.moving);
      guard.meter = Math.min(ALERT_AT, guard.meter + rate * dt);
      guard.lastSeenX = player.x;
      guard.lastSeenZ = player.z;
      if (guard.meter >= SUSPICIOUS_AT && guard.state === 'patrol') {
        guard.state = 'suspicious';
        guard.pauseLeft = 0;
        guard.facing = Math.atan2(player.x - guard.x, -(player.z - guard.z));
      }
      if (guard.meter >= ALERT_AT && guard.state !== 'alerted') {
        guard.state = 'alerted';
        events.push({ type: 'spotted', guard });
      }
    } else {
      guard.meter = Math.max(0, guard.meter - DRAIN_RATE * dt);
      if (guard.state === 'suspicious' && guard.meter < SUSPICIOUS_AT * 0.5) {
        guard.state = 'patrol';
      }
    }
    if (guard.state === 'alerted') anyAlerted = true;
    if (!vis.seen && isNearMiss(guard.x, guard.z, guard.facing, player.x, player.z)) {
      nearMiss = true;
    }

    if (guard.state === 'patrol') {
      if (guard.investigateX !== null) {
        // The investigate block below steers the guard to the coin.
      } else if (guard.pauseLeft > 0) {
        guard.pauseLeft -= dt;
      } else {
        const [wx, wz] = guard.def.waypoints[guard.waypointIndex];
        if (moveToward(guard, wx, wz, PATROL_SPEED, dt)) {
          guard.waypointIndex = (guard.waypointIndex + 1) % guard.def.waypoints.length;
          guard.pauseLeft = guard.def.pauseAt;
        }
      }
    } else if (guard.state === 'suspicious') {
      // Stand and stare at the last seen spot for a beat, then resume.
      guard.pauseLeft += dt;
      if (guard.pauseLeft > 1.4) {
        guard.pauseLeft = 0;
        guard.state = 'patrol';
      }
    } else if (guard.state === 'alerted') {
      const arrived = moveToward(guard, guard.lastSeenX, guard.lastSeenZ, HUNT_SPEED, dt);
      if (arrived) {
        guard.state = 'searching';
        guard.searchLeft = SEARCH_TIME;
      }
      const d = Math.hypot(player.x - guard.x, player.z - guard.z);
      if (player.alive && d < CATCH_DIST) {
        events.push({ type: 'caught', guard });
      }
    } else if (guard.state === 'searching') {
      guard.searchLeft -= dt;
      // Sweep: look around while searching.
      guard.facing += dt * 1.4;
      if (guard.searchLeft <= 0) {
        guard.state = 'returning';
      }
    } else if (guard.state === 'returning') {
      // Walk back to the nearest waypoint, then resume the patrol.
      let best = 0;
      let bestD = Infinity;
      guard.def.waypoints.forEach(([wx, wz], i) => {
        const d = Math.hypot(wx - guard.x, wz - guard.z);
        if (d < bestD) { bestD = d; best = i; }
      });
      const [wx, wz] = guard.def.waypoints[best];
      if (moveToward(guard, wx, wz, PATROL_SPEED, dt)) {
        guard.waypointIndex = (best + 1) % guard.def.waypoints.length;
        guard.state = 'patrol';
        guard.meter = 0;
      }
    }

    // A thrown coin pulls the nearest guard off patrol to investigate.
    if (guard.investigateX !== null && guard.state === 'patrol') {
      const arrived = moveToward(guard, guard.investigateX, guard.investigateZ, PATROL_SPEED * 1.3, dt);
      if (arrived) {
        guard.investigateX = null;
        guard.investigateZ = null;
        guard.pauseLeft = 1.5;
      }
    }
    syncFigure(guard, dt);
  }
  if (nearMiss) events.push({ type: 'nearMiss' });
  return anyAlerted;
}

export function distractNearestGuard(guards, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const guard of guards) {
    if (guard.state === 'alerted') continue;
    const d = Math.hypot(guard.x - x, guard.z - z);
    if (d < bestD) { bestD = d; best = guard; }
  }
  if (best && bestD < 14) {
    best.investigateX = x;
    best.investigateZ = z;
    best.state = 'patrol';
    return best;
  }
  return null;
}

export function resetGuards(guards) {
  for (const guard of guards) {
    const [sx, sz] = guard.def.waypoints[0];
    const [nx, nz] = guard.def.waypoints[1];
    guard.x = sx;
    guard.z = sz;
    guard.facing = Math.atan2(nx - sx, -(nz - sz));
    guard.waypointIndex = 1;
    guard.pauseLeft = 0;
    guard.state = 'patrol';
    guard.meter = 0;
    guard.investigateX = null;
    guard.investigateZ = null;
    guard.searchLeft = 0;
    syncFigure(guard, 0);
  }
}

export function highestMeter(guards) {
  let m = 0;
  for (const g of guards) if (g.meter > m) m = g.meter;
  return m;
}
