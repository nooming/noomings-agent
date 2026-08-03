/**
 * Pure reachability helpers for "unpassable levels" audits (no browser).
 */
'use strict';

const EPS0 = 8.854187817e-12;
const H_EV_S = 4.135667696e-15;

/** Efield template: ay≥0 deflects down (canvas y↑); targets must sit below launch. */
function efieldPredictScreenY(q, E, canvasW, canvasH, opts = {}) {
  const launchFrac = opts.launchYFrac != null ? opts.launchYFrac : 0.38;
  const baseAccel = opts.baseAccel != null ? opts.baseAccel : 0.8;
  const x0 = 70;
  const y0 = canvasH * launchFrac;
  const vx = 200;
  const tx = canvasW * 0.78;
  const t = Math.max(0.05, (tx - x0) / vx);
  const ay = q * E * baseAccel * 0.012;
  return y0 + 0.5 * ay * t * t;
}

function efieldSomeEqHitsZone(zoneY, zoneH, canvasW, canvasH, opts) {
  for (let E = 0; E <= 1000; E += 50) {
    for (let q = 1; q <= 10; q += 1) {
      const y = efieldPredictScreenY(q, E, canvasW, canvasH, opts);
      if (y >= zoneY && y <= zoneY + zoneH) return { q, E, y };
    }
  }
  return null;
}

function efieldExploreReachable(canvasW, canvasH, opts = {}) {
  const launchFrac = opts.launchYFrac != null ? opts.launchYFrac : 0.38;
  const exploreFrac = opts.exploreTargetYFrac != null ? opts.exploreTargetYFrac : 0.62;
  const zoneY = canvasH * exploreFrac;
  const zoneH = Math.max(64, canvasH * 0.14);
  if (zoneY + 8 < canvasH * launchFrac) {
    return { ok: false, reason: 'explore target above launch while ay≥0' };
  }
  const hit = efieldSomeEqHitsZone(zoneY, zoneH, canvasW, canvasH, opts);
  return hit
    ? { ok: true, hit }
    : { ok: false, reason: 'no (E,q) hits explore zone' };
}

function photoelectricEmax(fMaxUnits = 10) {
  return H_EV_S * fMaxUnits * 1e14;
}

function photoelectricChallengePool(materials, opts = {}) {
  const eMax = opts.eMax != null ? opts.eMax : photoelectricEmax(opts.fMaxUnits || 10);
  const eps = opts.eps != null ? opts.eps : 0.08;
  return materials.filter((m) => m.W < eMax - eps);
}

function capacitorC_pF(A, d) {
  if (d <= 0) return 0;
  return EPS0 * A / d * 1e12;
}

function capacitorDiscreteValues() {
  const vals = [];
  for (let A = 0.01; A <= 0.10001; A += 0.01) {
    for (let d = 0.001; d <= 0.01001; d += 0.001) {
      vals.push(capacitorC_pF(A, d));
    }
  }
  return vals;
}

function capacitorBandReachable(lo, hi, discreteVals) {
  const vals = discreteVals || capacitorDiscreteValues();
  return vals.some((c) => c >= lo && c <= hi);
}

/** Mirror game rollChallengeBand + assert; returns miss count after filter. */
function capacitorMonteCarloMissRate(N = 800, seedRng = Math.random) {
  const vals = capacitorDiscreteValues();
  let miss = 0;
  let accepted = 0;
  for (let i = 0; i < N; i++) {
    let ok = false;
    for (let attempt = 0; attempt < 64; attempt++) {
      const mid = 90 + seedRng() * 140;
      const half = 8 + seedRng() * 6;
      const lo = Math.round(mid - half);
      const hi = Math.round(mid + half);
      if (capacitorBandReachable(lo, hi, vals)) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      // fallback band around known C — same as game
      const C0 = Math.round(capacitorC_pF(0.05, 0.004));
      ok = capacitorBandReachable(C0 - 10, C0 + 10, vals);
    }
    if (ok) accepted += 1;
    else miss += 1;
  }
  return { miss, accepted, rate: miss / N, N };
}

function pendulumLandingEnvelope() {
  const G = 980;
  const GROUND_Y = 360;
  const PIVOT_X = 200;
  const PIVOT_Y = 70;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let len = 60; len <= 220; len += 4) {
    for (let deg = 12; deg <= 80; deg += 4) {
      const th = (deg * Math.PI) / 180;
      const fall = GROUND_Y - 6 - PIVOT_Y - len;
      if (fall < 18) continue;
      const v = Math.sqrt(2 * G * len * (1 - Math.cos(th)));
      const t = Math.sqrt((2 * fall) / G);
      const land = PIVOT_X + v * t;
      minX = Math.min(minX, PIVOT_X + 20);
      maxX = Math.max(maxX, land);
    }
  }
  return {
    minX: Math.max(180, Math.floor(minX)),
    maxX: Math.min(460, Math.ceil(maxX - 8)),
  };
}

function projectileClampTargetX(viewW, opts = {}) {
  const PPM = opts.PPM != null ? opts.PPM : 15;
  const cannonBaseX = opts.cannonBaseX != null ? opts.cannonBaseX : 100;
  const targetWidth = opts.targetWidth != null ? opts.targetWidth : 40;
  const marginPx = Math.max(targetWidth, 24) + 8;
  const maxMetersRaw = (viewW - cannonBaseX - marginPx) / PPM;
  const maxMeters = Math.max(5, maxMetersRaw);
  const minMeters = Math.min(15, Math.max(5, maxMeters * 0.45));
  const lo = Math.min(minMeters, maxMeters);
  const hi = Math.max(minMeters, maxMeters);
  const distMeters = lo + 0.5 * Math.max(0.01, hi - lo);
  let targetX = cannonBaseX + distMeters * PPM;
  const maxX = viewW - marginPx;
  const minX = cannonBaseX + 5 * PPM;
  targetX = Math.min(Math.max(targetX, minX), Math.max(minX, maxX));
  return { targetX, maxX, inView: targetX <= viewW - 4 && targetX >= cannonBaseX };
}

module.exports = {
  EPS0,
  H_EV_S,
  efieldPredictScreenY,
  efieldSomeEqHitsZone,
  efieldExploreReachable,
  photoelectricEmax,
  photoelectricChallengePool,
  capacitorC_pF,
  capacitorDiscreteValues,
  capacitorBandReachable,
  capacitorMonteCarloMissRate,
  pendulumLandingEnvelope,
  projectileClampTargetX,
};
