import * as THREE from "three";
import { createFigure, walkPose } from "../figure";
import { type Route, along } from "./routes";

/*
 * Background pedestrians: grey pictogram figures that walk the pavements around the
 * blocks, with the odd jogger mixed in. They follow closed routes and never stop.
 */

export type Walker = {
  figure: ReturnType<typeof createFigure>;
  route: Route;
  distance: number;
  speed: number;
  cycle: number;
};

export function createCrowd(scene: THREE.Scene, paths: Route[], count: number) {
  const walkers: Walker[] = [];
  for (let i = 0; i < count; i++) {
    const route = paths[i % paths.length];
    const figure = createFigure({ tone: "grey" });
    const jogger = i % 7 === 3;
    figure.root.scale.multiplyScalar(0.86 + ((i * 37) % 23) / 100);
    figure.root.traverse((child) => {
      child.userData.pedestrian = true;
      if ((child as THREE.Mesh).isMesh) (child as THREE.Mesh).castShadow = false;
    });
    scene.add(figure.root);
    walkers.push({
      figure,
      route,
      // Spread walkers who share a route evenly round it.
      distance: (Math.floor(i / paths.length) / Math.max(1, Math.ceil(count / paths.length))) * route.total + i * 3.1,
      speed: jogger ? 3.1 : 1.1 + ((i * 13) % 7) / 14,
      cycle: i,
    });
  }

  function update(dt: number) {
    for (const w of walkers) {
      w.distance += dt * w.speed;
      const p = along(w.route, w.distance);
      w.figure.root.position.set(p.position.x, 0, p.position.z);
      w.figure.root.rotation.y = p.heading;
      w.cycle += dt * 7.5 * w.speed;
      w.figure.apply(walkPose(w.cycle, 0), Math.min(1, dt * 12));
    }
  }

  return { walkers, update };
}
