// rng.js — seeded pseudo-random numbers for The Gilded Hour.
// Every random choice in the game comes from here, so two runs with the
// same seed lay out the same museum. No Math.random() in game logic.
export function createSeededRng(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  // mulberry32: small, fast, deterministic across engines.
  return function nextRandom() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickFrom(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function rangeFrom(rng, low, high) {
  return low + rng() * (high - low);
}

export function shuffleCopy(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
