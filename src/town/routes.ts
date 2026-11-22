import * as THREE from "three";

/** A closed path of straight legs, walked by distance. */
export type Route = { points: THREE.Vector3[]; lengths: number[]; total: number };

export function route(points: [number, number][]): Route {
  const pts = points.map(([x, z]) => new THREE.Vector3(x, 0.02, z));
  const lengths = [0];
  for (let i = 1; i <= pts.length; i++) lengths.push(lengths[i - 1] + pts[i - 1].distanceTo(pts[i % pts.length]));
  return { points: pts, lengths, total: lengths[lengths.length - 1] };
}

export function along(r: Route, distance: number) {
  const d = ((distance % r.total) + r.total) % r.total;
  let i = 0;
  while (i < r.points.length - 1 && r.lengths[i + 1] < d) i++;
  const a = r.points[i];
  const b = r.points[(i + 1) % r.points.length];
  const t = (d - r.lengths[i]) / (r.lengths[i + 1] - r.lengths[i]);
  return { position: a.clone().lerp(b, t), heading: Math.atan2(b.x - a.x, b.z - a.z) };
}

/**
 * A clockwise (seen from above) loop just inside a rectangular block. With an inset of
 * 0.75 it is the right-hand lane of every road around the block; adjacent blocks use the
 * other lane, so block loops tile a grid without two loops sharing a lane.
 */
export function blockLoop(x0: number, z0: number, x1: number, z1: number, inset: number) {
  return route([
    [x0 + inset, z0 + inset],
    [x1 - inset, z0 + inset],
    [x1 - inset, z1 - inset],
    [x0 + inset, z1 - inset],
  ]);
}

/** Distance along a route to the point nearest (x, z). */
export function distanceAt(r: Route, x: number, z: number) {
  let best = 0;
  let bestD = Infinity;
  const p = new THREE.Vector3(x, 0.02, z);
  for (let d = 0; d < r.total; d += 0.1) {
    const dist = along(r, d).position.distanceTo(p);
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best;
}
