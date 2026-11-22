import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  PUSH_DRIVE_END,
  PUSH_DRIVE_START,
  PUSH_HEAVE,
  PUSH_HEAVES,
  PUSH_REACH,
  cheerPose,
  createFigure,
  idlePose,
  pushPose,
  walkPose,
} from "./figure";
import type { TaskIcon } from "./routine";
import { sfx } from "./sound";

/*
 * The world, in black and white only: a ring of floating islands, one per task, around a dormant
 * core, above an engraved floor, inside an orrery of planets and a skyline that grows with the day.
 *  - committing a task pushes that island's stone home: it turns solid white, a spoke reaches for
 *    the core and the bridge to the next island rises out of the void,
 *  - every finished task raises more of the skyline and wakes more of the core's rings,
 *  - a perfect day (every required task, both vows) turns the core solid white and closes the circle.
 * No glows and no coloured light: progress is shown by things becoming white and solid.
 */

export type WorldTask = { done: boolean; optional: boolean; icon: TaskIcon };
export type VowState = "holding" | "kept" | "slipped";
export type ZoomControls = { zoomBy: (factor: number) => void; reset: () => void };

type Props = {
  current: number;
  tasks: WorldTask[];
  /** The furthest island that can be reached: bridges up to it exist, beyond it is void. */
  unlocked: number;
  vows: VowState[];
  /** Running count from the counter task: each new one launches a paper plane. */
  launches: number;
  launchFrom: number;
  complete: boolean;
  immersive: boolean;
  /** The task dock is hidden, so the view can use the whole screen. */
  dockHidden: boolean;
  onSelect: (index: number) => void;
  onNavigate: (direction: number) => void;
  /** Hands the page a way to drive the zoom from its own buttons. */
  onZoomReady?: (zoom: ZoomControls) => void;
};

const BLACK = 0x030304;
const WHITE = 0xf2f2f2;
const ISLAND = 3.0;
const ISLAND_DEPTH = 1.3;
/** Islands sit slightly ahead of where the figure stands, leaving room to push the stone. */
const AHEAD = 0.4;
const BRIDGE_STONES = 4;
const CORE_RINGS = 5;
const FLOOR_Y = -9;

const STONE = { width: 0.6, height: 0.9, depth: 0.6 };
const STONE_START = PUSH_REACH + STONE.depth / 2 - AHEAD;
const PUSH_DISTANCE = 0.55;
const SLOT_Z = STONE_START + PUSH_DISTANCE;

const smoothstep = (t: number) => THREE.MathUtils.smoothstep(t, 0, 1);
const easeOutBack = (t: number) => {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
/** Deterministic pseudo-random numbers, so the skyline is the same every visit. */
const seeded = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Ring geometry for a given number of islands. */
function makeRing(count: number) {
  const step = (Math.PI * 2) / count;
  const radius = Math.max(11, (count * 8.6) / (Math.PI * 2));
  const segment = radius * step;
  // The walkable part of a segment, between the front edge of one island and the back of the next.
  const front = (ISLAND / 2 + AHEAD) / segment;
  const back = (ISLAND / 2 - AHEAD) / segment;
  const height = (k: number) => Math.sin((k / count) * Math.PI * 4) * 0.9 + Math.sin((k / count) * Math.PI * 2) * 0.5;
  const heightAt = (w: number) => {
    const k = Math.floor(w);
    return THREE.MathUtils.lerp(height(k), height(k + 1), smoothstep(w - k));
  };
  const point = (w: number, out = new THREE.Vector3()) => {
    const angle = w * step;
    return out.set(radius * Math.sin(angle), heightAt(w), radius * Math.cos(angle));
  };
  const heading = (w: number) => {
    const angle = w * step;
    return Math.atan2(Math.cos(angle), -Math.sin(angle));
  };
  const tangent = (w: number) => {
    const angle = w * step;
    return new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
  };
  const hop = (w: number) => {
    const f = w - Math.floor(w);
    if (f <= front || f >= 1 - back) return 0;
    const g = (f - front) / (1 - front - back);
    return Math.abs(Math.sin(Math.PI * g * (BRIDGE_STONES + 1)));
  };
  const stoneAt = (segmentIndex: number, j: number) =>
    segmentIndex + front + ((1 - front - back) * (j + 1)) / (BRIDGE_STONES + 1);
  return { count, step, radius, point, heading, tangent, hop, stoneAt };
}

/** Rounded rectangle outline in Shape space (shape y is world -z once laid flat). */
function roundedRect(cx: number, cz: number, across: number, along: number, r: number) {
  const points: THREE.Vector2[] = [];
  const hx = across / 2 - r;
  const hz = along / 2 - r;
  const corners: [number, number, number][] = [
    [hx, hz, 0],
    [-hx, hz, Math.PI / 2],
    [-hx, -hz, Math.PI],
    [hx, -hz, Math.PI * 1.5],
  ];
  for (const [x, z, start] of corners) {
    for (let i = 0; i <= 4; i++) {
      const a = start + (i / 4) * (Math.PI / 2);
      points.push(new THREE.Vector2(cx + x + Math.cos(a) * r, -(cz + z + Math.sin(a) * r)));
    }
  }
  return points;
}

/** Wraps an angle difference into -PI..PI so turns always take the short way round. */
function turnToward(current: number, target: number, amount: number) {
  return current + Math.atan2(Math.sin(target - current), Math.cos(target - current)) * amount;
}

function circlePoints(radius: number, segments = 200, y = 0) {
  return Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return new THREE.Vector3(Math.sin(a) * radius, y, Math.cos(a) * radius);
  });
}

export default function World(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef(props);
  const [unavailable, setUnavailable] = useState(false);
  useLayoutEffect(() => {
    state.current = props;
  });

  useEffect(() => {
    if (!host.current) return;
    const container: HTMLDivElement = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      // No WebGL on this device: fall back to the plain view. This only runs once, on mount.
      // oxlint-disable-next-line react/set-state-in-effect
      setUnavailable(true);
      return;
    }
    let disposed = false;
    let frame = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setClearColor(BLACK);
    renderer.domElement.setAttribute(
      "aria-label",
      "A black and white world: a ring of floating islands, one per task of your day, around a dormant core. Drag to look around, scroll or pinch to zoom, arrow keys to walk.",
    );
    container.appendChild(renderer.domElement);

    const initial = state.current;
    const ring = makeRing(initial.tasks.length);
    const N = ring.count;
    const LAST = N - 1;
    const CORE = new THREE.Vector3(0, 4.5, 0);
    const islandCenter = (k: number) => ring.point(k).addScaledVector(ring.tangent(k), AHEAD);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BLACK);
    const fog = new THREE.Fog(BLACK, 60, 190);
    scene.fog = fog;
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 700);
    const controls = new OrbitControls(camera, renderer.domElement);
    const startPoint = ring.point(initial.current);
    controls.target.set(startPoint.x, startPoint.y + 0.9, startPoint.z);
    camera.position.copy(controls.target).add(new THREE.Vector3(0, 20, 40));
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minPolarAngle = 0.3;
    controls.maxPolarAngle = 1.35;
    controls.rotateSpeed = 0.45;
    // One finger swipes to walk; two fingers orbit and pinch.
    controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
    // While the user is looking around, the camera stops steering itself for a moment.
    let userLookUntil = 0;
    controls.addEventListener("start", () => (userLookUntil = Infinity));
    controls.addEventListener("end", () => (userLookUntil = performance.now() + 3500));
    controls.update();

    // ---------- Plain shading light only: no coloured light, no glows ----------
    const ambient = new THREE.HemisphereLight(0xffffff, 0x101010, 0.55);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
    keyLight.position.set(-20, 40, 25);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    const reach = ring.radius + 8;
    Object.assign(keyLight.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, far: 130 });
    keyLight.shadow.camera.updateProjectionMatrix();
    keyLight.shadow.normalBias = 0.05;
    keyLight.shadow.bias = -0.0004;
    keyLight.target.position.set(0, 0, 0);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.9);
    rimLight.position.set(14, 10, -34);
    scene.add(ambient, keyLight, keyLight.target, rimLight);

    // Materials: black stone, white solids, grey and white lines.
    const stone = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.92 });
    const solidWhite = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.6 });
    const dimWhite = new THREE.MeshStandardMaterial({ color: 0x8c8c90, roughness: 0.7 });
    const pictogram = new THREE.MeshStandardMaterial({
      color: WHITE,
      roughness: 0.5,
      emissive: 0xffffff,
      emissiveIntensity: 0.08,
    });
    const edge = new THREE.LineBasicMaterial({ color: 0x5c5c62 });
    const faint = (opacity: number, color = 0xffffff) =>
      new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const dashed = (opacity: number, dash = 0.6, gap = 0.5) =>
      new THREE.LineDashedMaterial({
        color: 0xffffff,
        transparent: true,
        opacity,
        dashSize: dash,
        gapSize: gap,
        depthWrite: false,
      });
    const white = new THREE.Color(WHITE);
    const edgeGrey = new THREE.Color(0x5c5c62);

    function mesh(
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      parent: THREE.Object3D,
      x = 0,
      y = 0,
      z = 0,
    ) {
      const item = new THREE.Mesh(geometry, material);
      item.position.set(x, y, z);
      item.castShadow = true;
      item.receiveShadow = true;
      parent.add(item);
      return item;
    }
    function outline(target: THREE.Mesh, material: THREE.LineBasicMaterial, threshold = 25) {
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(target.geometry, threshold), material);
      target.add(lines);
      return lines;
    }
    function loop(
      points: THREE.Vector3[],
      material: THREE.LineBasicMaterial | THREE.LineDashedMaterial,
      parent: THREE.Object3D = scene,
    ) {
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material);
      line.computeLineDistances();
      parent.add(line);
      return line;
    }

    // ---------- Sky: black, with stars ----------
    function starLayer(count: number, size: number) {
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 0.95);
        const r = 260 + Math.random() * 40;
        positions.set(
          [r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi) - 20, r * Math.sin(phi) * Math.sin(theta)],
          i * 3,
        );
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const points = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: 0xffffff,
          size,
          sizeAttenuation: false,
          transparent: true,
          opacity: 0.8,
          fog: false,
          depthWrite: false,
        }),
      );
      scene.add(points);
      return points.material as THREE.PointsMaterial;
    }
    const starsA = starLayer(1500, 1.2);
    const starsB = starLayer(320, 2);

    // Dust drifting up through the ring.
    const DUST = 420;
    const dustPositions = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * (ring.radius + 12);
      dustPositions.set([Math.sin(a) * r, FLOOR_Y + Math.random() * 22, Math.cos(a) * r], i * 3);
    }
    const dustGeometry = new THREE.BufferGeometry();
    const dustAttribute = new THREE.BufferAttribute(dustPositions, 3);
    dustGeometry.setAttribute("position", dustAttribute);
    scene.add(
      new THREE.Points(
        dustGeometry,
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.35, depthWrite: false }),
      ),
    );

    // ---------- The floor: an engraved astrolabe far below ----------
    const floorRadius = ring.radius + 70;
    const floorDisc = new THREE.Mesh(
      new THREE.CircleGeometry(floorRadius, 96),
      new THREE.MeshStandardMaterial({ color: 0x060607, roughness: 1 }),
    );
    floorDisc.rotation.x = -Math.PI / 2;
    floorDisc.position.y = FLOOR_Y - 0.02;
    floorDisc.receiveShadow = true;
    scene.add(floorDisc);
    const floor = new THREE.Group();
    floor.position.y = FLOOR_Y;
    scene.add(floor);
    const floorLines = faint(0.16);
    const floorStrong = faint(0.3);
    for (let r = 4; r < floorRadius - 10; r += r < ring.radius + 14 ? 3 : 7)
      loop(circlePoints(r, 160), r % 2 ? floorLines : floorStrong, floor);
    const spokes: THREE.Vector3[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const inner = i % 4 === 0 ? 4 : ring.radius - 4;
      spokes.push(
        new THREE.Vector3(Math.sin(a) * inner, 0, Math.cos(a) * inner),
        new THREE.Vector3(Math.sin(a) * (ring.radius + 14), 0, Math.cos(a) * (ring.radius + 14)),
      );
    }
    floor.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(spokes), floorLines));
    // Two engraved dials that turn slowly in opposite directions, like the rete of an astrolabe.
    function dial(radius: number, ticks: number, long: number) {
      const group = new THREE.Group();
      const points: THREE.Vector3[] = [];
      for (let i = 0; i < ticks; i++) {
        const a = (i / ticks) * Math.PI * 2;
        const length = i % long === 0 ? 1.6 : 0.6;
        points.push(
          new THREE.Vector3(Math.sin(a) * radius, 0, Math.cos(a) * radius),
          new THREE.Vector3(Math.sin(a) * (radius + length), 0, Math.cos(a) * (radius + length)),
        );
      }
      group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), floorStrong));
      loop(circlePoints(radius, 200), floorStrong, group);
      floor.add(group);
      return group;
    }
    const outerDial = dial(ring.radius + 16, 120, 10);
    const innerDial = dial(8.5, 72, 6);
    // Stepped plinth under the core, with an axis line rising to it.
    [7, 5.2, 3.6].forEach((radius, i) => {
      const tier = mesh(
        new THREE.CylinderGeometry(radius, radius, 0.7, 64),
        stone,
        scene,
        0,
        FLOOR_Y + 0.35 + i * 0.7,
        0,
      );
      outline(tier, edge, 30);
    });
    const axis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, FLOOR_Y + 2.1, 0),
        CORE.clone().setY(CORE.y - 1.7),
      ]),
      dashed(0.5, 0.3, 0.3),
    );
    axis.computeLineDistances();
    scene.add(axis);

    // ---------- The orrery: planets on tilted, dashed orbits ----------
    const planetWire = faint(0.85);
    type Planet = {
      pivot: THREE.Group;
      body: THREE.Object3D;
      radius: number;
      speed: number;
      phase: number;
      spin: number;
      moons: { body: THREE.Object3D; radius: number; speed: number }[];
    };
    function planet(options: {
      orbit: number;
      size: number;
      tilt: [number, number];
      speed: number;
      phase: number;
      style: "solid" | "wire" | "dim";
      ringed?: boolean;
      moons?: number;
    }): Planet {
      const pivot = new THREE.Group();
      pivot.position.copy(CORE);
      pivot.rotation.set(options.tilt[0], 0, options.tilt[1]);
      scene.add(pivot);
      loop(circlePoints(options.orbit, 220), dashed(0.32, 0.8, 0.7), pivot);
      const body = new THREE.Group();
      if (options.style === "wire") {
        const shell = new THREE.IcosahedronGeometry(options.size, 1);
        mesh(shell, new THREE.MeshStandardMaterial({ color: BLACK, roughness: 1 }), body).scale.setScalar(0.98);
        body.add(new THREE.LineSegments(new THREE.EdgesGeometry(shell, 1), planetWire));
      } else {
        mesh(new THREE.SphereGeometry(options.size, 36, 24), options.style === "solid" ? solidWhite : dimWhite, body);
      }
      if (options.ringed) {
        const band = new THREE.Group();
        band.rotation.set(Math.PI / 2 - 0.4, 0.2, 0);
        loop(circlePoints(options.size * 1.6, 120), faint(0.7), band);
        loop(circlePoints(options.size * 1.9, 120), faint(0.45), band);
        loop(circlePoints(options.size * 2.15, 120), faint(0.25), band);
        body.add(band);
      }
      const moons = Array.from({ length: options.moons ?? 0 }, (_, i) => {
        const moon = mesh(new THREE.SphereGeometry(options.size * 0.22, 16, 12), solidWhite, body);
        const radius = options.size * (2.4 + i * 0.9);
        loop(circlePoints(radius, 80), faint(0.18), body);
        return { body: moon, radius, speed: 0.8 - i * 0.25 };
      });
      pivot.add(body);
      return {
        pivot,
        body,
        radius: options.orbit,
        speed: options.speed,
        phase: options.phase,
        spin: 0.3 / options.size,
        moons,
      };
    }
    const planets = [
      planet({ orbit: 7.5, size: 0.45, tilt: [0.08, -0.05], speed: 0.2, phase: 0, style: "solid" }),
      planet({ orbit: 13.5, size: 0.6, tilt: [0.22, 0.12], speed: 0.11, phase: 2, style: "wire", moons: 1 }),
      planet({
        orbit: ring.radius + 22,
        size: 2.4,
        tilt: [0.12, -0.18],
        speed: 0.022,
        phase: 2.2,
        style: "solid",
        ringed: true,
        moons: 2,
      }),
      planet({
        orbit: ring.radius + 36,
        size: 1.4,
        tilt: [-0.2, 0.1],
        speed: 0.015,
        phase: 4.4,
        style: "wire",
        moons: 1,
      }),
      planet({ orbit: ring.radius + 48, size: 0.9, tilt: [0.32, 0.25], speed: 0.01, phase: 0.8, style: "dim" }),
    ];
    // Small satellites circling the core on crossing orbits.
    const satellites = [0, 1, 2].map((i) => {
      const pivot = new THREE.Group();
      pivot.position.copy(CORE);
      pivot.rotation.set(1.1 + i * 0.7, i * 1.9, 0.4);
      scene.add(pivot);
      loop(circlePoints(3.6 + i * 0.35, 90), faint(0.25), pivot);
      const body = mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), solidWhite, pivot);
      return { body, radius: 3.6 + i * 0.35, speed: 0.9 - i * 0.2 };
    });

    // Asteroid belt.
    const beltRadius = ring.radius + 11;
    const BELT = 1500;
    const beltPositions = new Float32Array(BELT * 3);
    for (let i = 0; i < BELT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = beltRadius + Math.random() * 5 + Math.sin(a * 7) * 0.8;
      beltPositions.set([Math.sin(a) * r, -2.5 + (Math.random() - 0.5) * 2, Math.cos(a) * r], i * 3);
    }
    const beltGeometry = new THREE.BufferGeometry();
    beltGeometry.setAttribute("position", new THREE.BufferAttribute(beltPositions, 3));
    const belt = new THREE.Points(
      beltGeometry,
      new THREE.PointsMaterial({ color: 0xbdbdbd, size: 0.1, transparent: true, opacity: 0.7 }),
    );
    scene.add(belt);
    const boulders = Array.from({ length: 18 }, (_, i) => {
      const size = 0.3 + (i % 4) * 0.22;
      const rock = mesh(new THREE.DodecahedronGeometry(size, 0), stone, belt);
      const a = i * 0.35 + Math.sin(i) * 0.2;
      const r = beltRadius + 0.5 + (i % 3) * 1.6;
      rock.position.set(Math.sin(a) * r, -2.5 + Math.sin(i * 3.1) * 0.8, Math.cos(a) * r);
      outline(rock, edge, 1);
      return rock;
    });

    // Shooting stars.
    const comets = Array.from({ length: 2 }, () => {
      const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: false });
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        material,
      );
      line.frustumCulled = false;
      scene.add(line);
      return {
        line,
        material,
        from: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        age: 2,
        next: 2 + Math.random() * 5,
      };
    });

    // ---------- The skyline: towers that rise as the day gets done ----------
    const TOWERS = 64;
    const towerLines = faint(0.55);
    const towers = Array.from({ length: TOWERS }, (_, i) => {
      const a = (i / TOWERS) * Math.PI * 2 + seeded(i) * 0.05;
      const r = ring.radius + 30 + seeded(i + 40) * 14 + (i % 3) * 3;
      const width = 1.4 + seeded(i + 80) * 2.4;
      const depth = 1.4 + seeded(i + 120) * 2.4;
      const full = 5 + Math.pow(seeded(i + 160), 1.6) * 26;
      const group = new THREE.Group();
      group.position.set(Math.sin(a) * r, FLOOR_Y, Math.cos(a) * r);
      group.rotation.y = a + seeded(i + 200) * 0.6;
      // A unit-high box scaled to the tower's current height, with floor lines engraved on its faces.
      const body = mesh(new THREE.BoxGeometry(width, 1, depth).translate(0, 0.5, 0), stone, group);
      body.castShadow = false;
      outline(body, towerLines);
      const bands: THREE.Vector3[] = [];
      const floors = Math.round(full / 1.4);
      for (let f = 1; f < floors; f++) {
        const y = f / floors;
        const hx = width / 2 + 0.01;
        const hz = depth / 2 + 0.01;
        bands.push(
          new THREE.Vector3(-hx, y, hz),
          new THREE.Vector3(hx, y, hz),
          new THREE.Vector3(hx, y, hz),
          new THREE.Vector3(hx, y, -hz),
          new THREE.Vector3(hx, y, -hz),
          new THREE.Vector3(-hx, y, -hz),
          new THREE.Vector3(-hx, y, -hz),
          new THREE.Vector3(-hx, y, hz),
        );
      }
      body.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(bands), faint(0.22)));
      // Some towers carry a slowly turning antenna ring on top.
      const antenna = i % 5 === 0 ? new THREE.Group() : null;
      if (antenna) {
        loop(circlePoints(Math.max(width, depth) * 0.7, 60), faint(0.5), antenna);
        group.add(antenna);
      }
      scene.add(group);
      // Towers are raised in a scattered order, so the city fills in all around as the day goes.
      return { body, antenna, full, rest: 0.8 + seeded(i + 240) * 1.2, order: seeded(i + 280), height: 0 };
    });

    // ---------- The core: a dormant engine that wakes ring by ring ----------
    const coreMaterial = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.35, metalness: 0.1 });
    const core = new THREE.Group();
    core.position.copy(CORE);
    const coreBody = mesh(new THREE.SphereGeometry(1.6, 48, 32), coreMaterial, core);
    outline(coreBody, faint(0.12), 1);
    scene.add(core);
    const coreRings = Array.from({ length: CORE_RINGS }, (_, i) => {
      const material = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.5 });
      const pivot = new THREE.Group();
      pivot.rotation.set(0.5 + i * 0.62, i * 1.26, 0.3 * i);
      const ringMesh = mesh(new THREE.TorusGeometry(2.2 + i * 0.28, 0.04, 8, 140), material, pivot);
      core.add(pivot);
      return { ring: ringMesh, material, glow: 0, spin: 0 };
    });
    const shockMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const shockwave = new THREE.Mesh(new THREE.RingGeometry(0.99, 1, 200), shockMaterial);
    shockwave.rotation.x = -Math.PI / 2;
    shockwave.position.set(0, 1, 0);
    scene.add(shockwave);
    const pathRingMaterial = faint(0.12);
    loop(circlePoints(ring.radius, 240, -0.5), pathRingMaterial);

    // The vows: guardian moons circling the core. Holding is grey, kept is white, a slip goes dark.
    const vowMoons = initial.vows.map((_, i) => {
      const material = new THREE.MeshStandardMaterial({ color: 0x8c8c90, roughness: 0.4 });
      const moon = mesh(new THREE.SphereGeometry(0.32, 24, 18), material, scene);
      moon.castShadow = false;
      return { moon, material, tilt: 0.5 + i * 0.9, offset: i * Math.PI };
    });
    const vowColors = {
      holding: new THREE.Color(0x8c8c90),
      kept: new THREE.Color(WHITE),
      slipped: new THREE.Color(0x1f1f22),
    };

    // ---------- Islands, one per task ----------
    const islands: THREE.Mesh[] = [];
    const islandGeometry = new THREE.ExtrudeGeometry(new THREE.Shape(roundedRect(0, 0, ISLAND, ISLAND, 0.16)), {
      depth: ISLAND_DEPTH,
      bevelEnabled: false,
      curveSegments: 4,
    });
    islandGeometry.rotateX(-Math.PI / 2);
    islandGeometry.translate(0, -ISLAND_DEPTH, 0);
    // Each island hangs over the void on an inverted rock root.
    const rootGeometry = new THREE.ConeGeometry(ISLAND * 0.62, 2.8, 4, 1);
    rootGeometry.rotateY(Math.PI / 4);
    rootGeometry.rotateX(Math.PI);
    const slotOutline = roundedRect(0, SLOT_Z, STONE.width + 0.12, STONE.depth + 0.12, 0.06);
    const stoneGeometry = new THREE.BoxGeometry(STONE.width, STONE.height, STONE.depth);
    const pulseGeometry = new THREE.SphereGeometry(0.07, 10, 8);

    function buildToken(icon: TaskIcon, token: THREE.Group) {
      const pieces: THREE.Mesh[] = [];
      const add = (geometry: THREE.BufferGeometry, x = 0, y = 0, z = 0) => {
        const piece = mesh(geometry, dimWhite, token, x, y, z);
        pieces.push(piece);
        return piece;
      };
      switch (icon) {
        case "brush":
          add(new THREE.BoxGeometry(0.5, 0.06, 0.07), -0.05, 0, 0);
          add(new THREE.BoxGeometry(0.13, 0.12, 0.09), 0.24, 0.07, 0);
          break;
        case "pan":
          add(new THREE.CylinderGeometry(0.22, 0.19, 0.07, 24));
          add(new THREE.BoxGeometry(0.32, 0.04, 0.05), 0.36, 0, 0);
          break;
        case "book":
          add(new RoundedBoxGeometry(0.5, 0.12, 0.38, 2, 0.025)).rotation.z = -0.16;
          mesh(new THREE.BoxGeometry(0.44, 0.045, 0.35), stone, token, 0, 0.01, 0.018);
          break;
        case "drop":
          add(new THREE.SphereGeometry(0.17, 20, 20)).scale.y = 1.2;
          add(new THREE.ConeGeometry(0.14, 0.25, 20), 0, 0.22, 0);
          break;
        case "egg":
          add(new THREE.SphereGeometry(0.18, 20, 16)).scale.set(0.85, 1.2, 0.85);
          break;
        case "case":
          add(new RoundedBoxGeometry(0.5, 0.34, 0.14, 2, 0.03));
          add(new THREE.TorusGeometry(0.09, 0.022, 8, 20, Math.PI), 0, 0.17, 0);
          break;
        case "plane": {
          const plane = new THREE.ConeGeometry(0.2, 0.55, 3);
          plane.rotateX(Math.PI / 2);
          plane.scale(1, 0.3, 1);
          add(plane);
          break;
        }
        case "cube":
          add(new THREE.BoxGeometry(0.3, 0.3, 0.3)).rotation.set(0.6, 0.6, 0);
          break;
        case "plate":
          add(new THREE.CylinderGeometry(0.3, 0.26, 0.04, 28));
          break;
        case "bowl":
          add(new THREE.SphereGeometry(0.22, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2));
          add(new THREE.TorusGeometry(0.22, 0.02, 8, 30)).rotation.x = Math.PI / 2;
          break;
        case "chip":
          add(new THREE.BoxGeometry(0.34, 0.06, 0.34));
          for (const s of [-1, 1])
            for (const o of [-0.1, 0, 0.1]) add(new THREE.BoxGeometry(0.08, 0.02, 0.03), s * 0.21, 0, o);
          break;
        default:
          add(new THREE.TorusGeometry(0.25, 0.085, 12, 35, Math.PI * 1.5)).rotation.z = 0.6;
      }
      return pieces;
    }

    type Site = {
      stone: THREE.Mesh;
      stoneEdge: THREE.LineBasicMaterial;
      islandEdge: THREE.LineBasicMaterial;
      slotLine: THREE.LineBasicMaterial;
      slotPlate: THREE.Mesh;
      token: THREE.Group;
      tokenMeshes: THREE.Mesh[];
      anchor: THREE.Vector3;
      thread: THREE.Line;
      threadMaterial: THREE.LineBasicMaterial;
      pulse: THREE.Mesh;
      optional: boolean;
    };
    const blackStone = stone;
    const slotDark = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 1 });
    const sites: Site[] = initial.tasks.map((task, index) => {
      const center = islandCenter(index);
      const island = mesh(islandGeometry, stone, scene, center.x, center.y, center.z);
      island.rotation.y = ring.heading(index);
      island.userData.index = index;
      islands.push(island);
      const islandEdge = edge.clone();
      outline(island, islandEdge);
      outline(mesh(rootGeometry, stone, island, 0, -ISLAND_DEPTH - 1.4, 0), islandEdge);

      const slotGeometry = new THREE.ShapeGeometry(new THREE.Shape(slotOutline));
      slotGeometry.rotateX(-Math.PI / 2);
      const slotPlate = mesh(slotGeometry, slotDark, island, 0, 0.006, 0);
      const slotLine = new THREE.LineBasicMaterial({ color: 0x48484e });
      island.add(
        new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(slotOutline.map((p) => new THREE.Vector3(p.x, 0.012, -p.y))),
          slotLine,
        ),
      );
      const block = mesh(stoneGeometry, blackStone, island);
      const stoneEdge = new THREE.LineBasicMaterial({ color: task.optional ? 0xb4b4b8 : 0x8a8a90 });
      outline(block, stoneEdge);

      island.updateMatrixWorld(true);
      const anchor = island.localToWorld(new THREE.Vector3(0, STONE.height + 0.05, SLOT_Z));
      const threadMaterial = faint(0);
      const thread = new THREE.Line(new THREE.BufferGeometry().setFromPoints([anchor, anchor]), threadMaterial);
      thread.frustumCulled = false;
      scene.add(thread);
      const pulse = new THREE.Mesh(pulseGeometry, solidWhite);
      pulse.visible = false;
      scene.add(pulse);

      const token = new THREE.Group();
      token.position.copy(island.localToWorld(new THREE.Vector3(0, 2.0, SLOT_Z)));
      const tokenMeshes = buildToken(task.icon, token);
      scene.add(token);
      return {
        stone: block,
        stoneEdge,
        islandEdge,
        slotLine,
        slotPlate,
        token,
        tokenMeshes,
        anchor,
        thread,
        threadMaterial,
        pulse,
        optional: task.optional,
      };
    });

    // ---------- Bridges: built stone by stone, only once they are earned ----------
    const bridgeGeometry = new THREE.BoxGeometry(0.62, 0.2, 0.62);
    const bridges = Array.from({ length: N }, (_, segment) => {
      const material = new THREE.LineBasicMaterial({ color: 0x5c5c62 });
      const stones = Array.from({ length: BRIDGE_STONES }, (_, j) => {
        const w = ring.stoneAt(segment, j);
        const target = ring.point(w).add(new THREE.Vector3(0, -0.1, 0));
        const piece = mesh(bridgeGeometry, stone, scene, target.x, target.y, target.z);
        outline(piece, material);
        piece.visible = false;
        return { mesh: piece, target, heading: ring.heading(w), landed: false };
      });
      return { stones, material, built: 0 };
    });

    const selectionRing = mesh(new THREE.TorusGeometry(0.55, 0.012, 6, 70), pictogram, scene);
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.castShadow = false;

    // ---------- Figure ----------
    const figure = createFigure();
    scene.add(figure.root);
    const avatar = figure.root;

    // ---------- Noise: a buzzing notification over every required task still open ----------
    const noiseMaterial = new THREE.MeshStandardMaterial({
      color: 0xe6e6e6,
      roughness: 0.4,
      emissive: 0xffffff,
      emissiveIntensity: 0.2,
    });
    const inkMaterial = new THREE.MeshBasicMaterial({ color: 0x2a2a2c });
    const cardGeometry = new RoundedBoxGeometry(0.62, 0.22, 0.03, 2, 0.05);
    const dotGeometry = new THREE.CircleGeometry(0.045, 16);
    const longBar = new THREE.PlaneGeometry(0.3, 0.032);
    const shortBar = new THREE.PlaneGeometry(0.19, 0.032);
    const cards = initial.tasks.flatMap((task, quest) => {
      if (task.optional) return [];
      const group = new THREE.Group();
      const card = new THREE.Mesh(cardGeometry, noiseMaterial);
      card.castShadow = true;
      group.add(card);
      const dot = new THREE.Mesh(dotGeometry, inkMaterial);
      dot.position.set(-0.21, 0, 0.017);
      const line1 = new THREE.Mesh(longBar, inkMaterial);
      line1.position.set(0.05, 0.035, 0.017);
      const line2 = new THREE.Mesh(shortBar, inkMaterial);
      line2.position.set(-0.005, -0.035, 0.017);
      group.add(dot, line1, line2);
      const angle = quest * 2.4;
      const base = islandCenter(quest).add(
        new THREE.Vector3(Math.cos(angle) * 1.9, 2.2 + (quest % 3) * 0.3, Math.sin(angle) * 1.9),
      );
      group.position.copy(base);
      scene.add(group);
      const scale = task.done ? 0 : 1;
      group.scale.setScalar(scale);
      group.visible = scale > 0;
      return [{ group, base, quest, seed: quest * 1.37, scale }];
    });

    // ---------- Particles ----------
    const sparkGeometry = new THREE.SphereGeometry(0.045, 6, 6);
    const sparks = Array.from({ length: 40 }, (_, i) => {
      const item = mesh(sparkGeometry, i % 3 === 0 ? dimWhite : solidWhite, scene);
      item.visible = false;
      item.castShadow = false;
      return { item, velocity: new THREE.Vector3(), life: 0 };
    });
    const gritGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const gritMaterial = new THREE.MeshStandardMaterial({ color: 0x8a8a8e, roughness: 1 });
    const grit = Array.from({ length: 64 }, () => {
      const item = mesh(gritGeometry, gritMaterial, scene);
      item.visible = false;
      return { item, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, floor: 0 };
    });
    // Paper planes: one per logged application, launched from the counter's island into the void.
    const planeGeometry = new THREE.ConeGeometry(0.13, 0.42, 3);
    planeGeometry.rotateX(Math.PI / 2);
    planeGeometry.scale(1, 0.3, 1);
    const planes = Array.from({ length: 12 }, () => {
      const item = mesh(planeGeometry, solidWhite, scene);
      item.visible = false;
      return { item, velocity: new THREE.Vector3(), life: 0 };
    });
    function burst(at: THREE.Vector3, count = 26, power = 1) {
      if (reduceMotion) return;
      let used = 0;
      sparks.forEach((p, i) => {
        if (p.life > 0 || used >= count) return;
        used++;
        p.item.position.copy(at);
        p.item.visible = true;
        p.item.scale.setScalar(1);
        p.velocity.set(
          Math.cos(i * 2.4) * (1.2 + (i % 3) * 0.6) * power,
          (3.5 + (i % 4)) * power,
          Math.sin(i * 2.4) * (1.2 + (i % 3) * 0.6) * power,
        );
        p.life = 1.3;
      });
    }
    function kickGrit(from: THREE.Vector3, count: number, flight: number, spread = 0.7) {
      if (reduceMotion) return;
      let thrown = 0;
      for (const p of grit) {
        if (p.life > 0 || thrown >= count) continue;
        thrown++;
        const landing = from
          .clone()
          .add(new THREE.Vector3((Math.random() - 0.5) * spread, 0, (Math.random() - 0.5) * spread));
        p.item.position.copy(from);
        p.item.visible = true;
        p.item.scale.setScalar(0.6 + Math.random() * 0.8);
        p.velocity
          .copy(landing)
          .sub(from)
          .divideScalar(flight)
          .add(new THREE.Vector3(0, 4.5 * flight, 0));
        p.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
        p.floor = landing.y;
        p.life = flight + 0.6;
      }
    }
    function launchPlane(index: number) {
      if (reduceMotion || !sites[index]) return;
      const plane = planes.find((p) => p.life <= 0);
      if (!plane) return;
      const outward = new THREE.Vector3(Math.sin(index * ring.step), 0, Math.cos(index * ring.step));
      plane.item.position.copy(sites[index].anchor).add(new THREE.Vector3(0, 1, 0));
      plane.item.visible = true;
      plane.velocity
        .copy(outward)
        .multiplyScalar(3.5 + Math.random())
        .addScaledVector(ring.tangent(index), (Math.random() - 0.5) * 3)
        .add(new THREE.Vector3(0, 1.6 + Math.random(), 0));
      plane.life = 5;
      sfx.whoosh();
    }

    // ---------- Progress state ----------
    const progress: number[] = initial.tasks.map((t) => (t.done ? 1 : 0));
    const threads: number[] = initial.tasks.map((t) => (t.done ? 1 : 0));
    const earnedBridge = (segment: number, s: Props) => (segment < LAST ? segment + 1 <= s.unlocked : s.complete);
    bridges.forEach((bridge, segment) => {
      bridge.built = earnedBridge(segment, initial) ? 1 : 0;
      // Stones already in place on load are silent; only newly raised ones make a sound.
      bridge.stones.forEach((piece) => (piece.landed = bridge.built === 1));
    });
    const initialShare = initial.tasks.filter((t) => t.done).length / N;
    towers.forEach((tower) => {
      tower.height = tower.order < initialShare ? tower.full : tower.rest;
    });
    let knownDone = initial.tasks.map((t) => t.done);
    let knownLaunches = initial.launches;
    let push: { island: number; time: number } | null = null;
    let pushOffset = 0;
    let cheer = 1;
    let walk = initial.current;
    let walkCycle = 0;
    let shake = 0;
    let ignition = initial.complete ? 1 : 0;
    let wasIgnited = initial.complete;
    let shockAge = Infinity;
    let showcaseUntil = 0;
    let lastTime = performance.now();
    // Zoom: null means the camera picks its own distance; a number is the user's chosen distance.
    let userDistance: number | null = null;
    let cameraDistance = 40;
    let viewBlend = initial.immersive ? 0 : 1;
    let lastImmersive = initial.immersive;
    const minDistance = 3.5;
    const maxDistance = ring.radius * 5;
    function zoomBy(factor: number) {
      userDistance = THREE.MathUtils.clamp((userDistance ?? cameraDistance) * factor, minDistance, maxDistance);
    }
    state.current.onZoomReady?.({ zoomBy, reset: () => (userDistance = null) });
    avatar.rotation.y = walk * ring.step + 0.4;
    const viewShift = { y: 0 };
    const shakeOffset = new THREE.Vector3();
    const temp = new THREE.Vector3();
    const temp2 = new THREE.Vector3();
    const stoneWorld = (i: number) =>
      islands[i].localToWorld(new THREE.Vector3(0, 0, STONE_START + PUSH_DISTANCE * progress[i]));

    // ---------- Input ----------
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const activeTouches = new Set<number>();
    const touchPoints = new Map<number, { x: number; y: number }>();
    let pinchSpan = 0;
    let gesture = { x: 0, y: 0, time: 0, multiTouch: false };
    const span = () => {
      const [a, b] = [...touchPoints.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const pointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !touchPoints.has(event.pointerId)) return;
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPoints.size !== 2) return;
      // Pinch: fingers apart zooms in, together zooms out.
      const next = span();
      if (pinchSpan > 0 && next > 0) zoomBy(pinchSpan / next);
      pinchSpan = next;
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
        pinchSpan = span();
        activeTouches.add(event.pointerId);
        if (activeTouches.size > 1) {
          gesture.multiTouch = true;
          return;
        }
      }
      gesture = { x: event.clientX, y: event.clientY, time: performance.now(), multiTouch: false };
    };
    const pointerUp = (event: PointerEvent) => {
      const wasMulti = gesture.multiTouch;
      if (event.pointerType === "touch") {
        touchPoints.delete(event.pointerId);
        pinchSpan = 0;
        activeTouches.delete(event.pointerId);
        if (wasMulti) {
          if (activeTouches.size === 0) gesture.multiTouch = false;
          return;
        }
      }
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (
        event.pointerType === "touch" &&
        Math.abs(dx) > 45 &&
        Math.abs(dx) > Math.abs(dy) * 1.4 &&
        performance.now() - gesture.time < 600
      ) {
        // Swipe left walks forward, like turning a page.
        state.current.onNavigate(dx < 0 ? 1 : -1);
        return;
      }
      if (Math.hypot(dx, dy) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(islands, false)[0];
      if (hit) state.current.onSelect(hit.object.userData.index);
    };
    const pointerCancel = (event: PointerEvent) => {
      activeTouches.delete(event.pointerId);
      touchPoints.delete(event.pointerId);
      pinchSpan = 0;
    };
    // Scroll wheel and trackpad pinch (which arrives as ctrl+wheel) zoom the camera.
    const onWheel = (event: WheelEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      const delta = THREE.MathUtils.clamp(event.deltaY, -120, 120);
      zoomBy(Math.exp(delta * (event.ctrlKey ? 0.012 : 0.0016)));
    };
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]') || event.metaKey || event.ctrlKey) return;
      if (event.key === "+" || event.key === "=") zoomBy(0.8);
      else if (event.key === "-" || event.key === "_") zoomBy(1.25);
      else if (event.key === "0") userDistance = null;
    };
    window.addEventListener("keydown", onKey);
    const canvas = renderer.domElement;
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerCancel);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    function resize() {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.fov = width < 761 ? 44 : 36;
      camera.updateProjectionMatrix();
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    function animate(time: number) {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;
      const seconds = time / 1000;
      const s = state.current;
      const width = container.clientWidth;
      const height = container.clientHeight;
      const compact = width < 761;
      const damp = (from: number, to: number, rate: number) =>
        reduceMotion ? to : THREE.MathUtils.damp(from, to, rate, dt);

      // A newly finished task: push its stone if the figure is there, otherwise it slides home alone.
      s.tasks.forEach((task, i) => {
        if (task.done && !knownDone[i] && !reduceMotion && !push && Math.abs(walk - i) < 0.35)
          push = { island: i, time: 0 };
      });
      knownDone = s.tasks.map((t) => t.done);
      if (s.launches > knownLaunches) {
        for (let n = knownLaunches; n < s.launches; n++) launchPlane(s.launchFrom);
        if (Math.abs(walk - s.launchFrom) < 0.35 && !push) cheer = 0;
      }
      knownLaunches = s.launches;
      const settled = (i: number) => !!s.tasks[i]?.done && !(push && push.island === i);

      // Walking: a steady pace along the ring, hopping stone to stone across the bridges.
      const goal = push ? push.island : s.current;
      const distance = goal - walk;
      const moving = !reduceMotion && Math.abs(distance) > 0.001;
      if (reduceMotion) walk = goal;
      else if (moving) {
        const speed = (0.4 + Math.max(0, Math.abs(distance) - 1) * 0.5) * dt;
        walk += Math.sign(distance) * Math.min(Math.abs(distance), speed);
      }
      const hop = moving ? ring.hop(walk) : 0;

      let pushing = false;
      if (push && !moving) {
        pushing = true;
        const site = push.island;
        const impacts = (t: number) => Math.min(PUSH_HEAVES, Math.floor(t / PUSH_HEAVE + 1 - PUSH_DRIVE_END));
        const before = push.time;
        push.time += dt;
        const heave = Math.floor(push.time / PUSH_HEAVE);
        const u = (push.time % PUSH_HEAVE) / PUSH_HEAVE;
        const drive = smoothstep((u - PUSH_DRIVE_START) / (PUSH_DRIVE_END - PUSH_DRIVE_START));
        progress[site] = Math.min(1, (heave + drive) / PUSH_HEAVES);
        pushOffset = THREE.MathUtils.damp(pushOffset, PUSH_DISTANCE * progress[site], 14, dt);
        if (impacts(push.time) > impacts(before)) {
          // Each heave ends with a shudder and grit scraped from the stone's base.
          shake = 0.05;
          kickGrit(stoneWorld(site), 7, 0.3);
          sfx.heave();
        }
        figure.apply(figure.bracePalms(pushPose(u, seconds)), 1 - Math.exp(-dt * 20));
        if (push.time >= PUSH_HEAVES * PUSH_HEAVE) {
          progress[site] = 1;
          shake = 0.08;
          const top = stoneWorld(site).setY(islandCenter(site).y + STONE.height + 0.1);
          burst(top, sites[site].optional ? 40 : 26, sites[site].optional ? 1.3 : 1);
          push = null;
          cheer = 0;
          sfx.lock();
        }
      } else if (moving) {
        walkCycle += dt * 11;
        pushOffset = THREE.MathUtils.damp(pushOffset, 0, 5, dt);
        figure.apply(walkPose(walkCycle, hop), 1 - Math.exp(-dt * 16));
      } else if (cheer < 1) {
        cheer = Math.min(1, cheer + dt / 0.9);
        figure.apply(cheerPose(cheer), 1 - Math.exp(-dt * 18));
      } else {
        figure.apply(idlePose(seconds), 1 - Math.exp(-dt * 8));
      }

      const station = Math.round(walk);
      ring.point(walk, avatar.position);
      avatar.position.y += hop * 0.5;
      if (pushOffset > 0.001) avatar.position.addScaledVector(ring.tangent(station), pushOffset);
      const outwardHeading = walk * ring.step;
      let facing = outwardHeading + 0.4;
      if (moving) facing = ring.heading(walk) + (distance < 0 ? Math.PI : 0);
      else if (pushing) facing = ring.heading(station);
      avatar.rotation.y = turnToward(avatar.rotation.y, facing, Math.min(1, dt * (moving ? 12 : 5)));

      // Islands: a finished task's stone sits home, solid white, and sends a spoke to the core.
      sites.forEach((site, i) => {
        const task = s.tasks[i];
        if (!(push && push.island === i)) progress[i] = damp(progress[i], task?.done ? 1 : 0, 3);
        site.stone.position.set(0, STONE.height / 2, STONE_START + PUSH_DISTANCE * progress[i]);
        const home = task?.done && progress[i] > 0.97;
        site.stone.material = home ? solidWhite : blackStone;
        site.stoneEdge.color.set(home ? 0x1a1a1c : site.optional ? 0xb4b4b8 : 0x8a8a90);
        site.slotPlate.material = home ? dimWhite : slotDark;
        site.slotLine.color.set(home ? WHITE : 0x48484e);
        site.islandEdge.color.copy(edgeGrey).lerp(white, home ? (site.optional ? 1 : 0.75) : 0);

        const threadTarget = settled(i) && progress[i] > 0.98 ? 1 : 0;
        threads[i] = damp(threads[i], threadTarget, threadTarget ? 1.6 : 4);
        const threadEnd = temp.copy(site.anchor).lerp(CORE, threads[i]);
        const positions = site.thread.geometry.attributes.position as THREE.BufferAttribute;
        positions.setXYZ(1, threadEnd.x, threadEnd.y, threadEnd.z);
        positions.needsUpdate = true;
        site.threadMaterial.opacity = threads[i] * (site.optional ? 0.6 : 0.35);
        site.pulse.visible = threads[i] > 0.98 && !reduceMotion;
        if (site.pulse.visible) site.pulse.position.copy(site.anchor).lerp(CORE, (seconds * 0.35 + i * 0.13) % 1);

        const tokenMaterial = task?.done ? solidWhite : dimWhite;
        site.tokenMeshes.forEach((piece) => (piece.material = tokenMaterial));
        if (!reduceMotion) {
          site.token.position.y = site.anchor.y + 1.1 + Math.sin(seconds * 1.8 + i) * 0.1 + (home ? 0.3 : 0);
          site.token.rotation.y = seconds * 0.35 + i;
        }
      });

      // Bridges: a finished task raises the way to the next island; a perfect day closes the circle.
      bridges.forEach((bridge, segment) => {
        const earned = earnedBridge(segment, s) && !(push && push.island === segment) && !(segment === LAST && push);
        bridge.built = reduceMotion
          ? earned
            ? 1
            : 0
          : THREE.MathUtils.clamp(bridge.built + (earned ? dt / 1.3 : -dt / 0.6), 0, 1);
        bridge.stones.forEach((piece, j) => {
          const t = THREE.MathUtils.clamp((bridge.built - (j / BRIDGE_STONES) * 0.6) / 0.4, 0, 1);
          if (t >= 1 && !piece.landed) {
            piece.landed = true;
            if (earned) sfx.stone(j);
          } else if (t < 1) piece.landed = false;
          piece.mesh.visible = t > 0;
          if (!piece.mesh.visible) return;
          const e = easeOutBack(t);
          piece.mesh.position.copy(piece.target).add(temp.set(0, -3.5 * (1 - e), 0));
          piece.mesh.rotation.set((1 - e) * 1.5, piece.heading + (1 - e) * 2, 0);
        });
        bridge.material.color.copy(edgeGrey).lerp(white, bridge.built * 0.7);
      });

      // The core wakes ring by ring as the day fills in; a perfect day turns it solid white.
      const awake = threads.filter((t) => t > 0.98).length;
      const share = awake / N;
      coreRings.forEach((r, i) => {
        r.glow = damp(r.glow, share >= (i + 1) / CORE_RINGS - 0.001 ? 1 : 0, 2);
        r.material.color.setHex(0x2c2c30).lerp(white, r.glow);
        r.spin += dt * (r.glow * (0.6 + i * 0.15) + ignition * 1.2);
        if (!reduceMotion) r.ring.rotation.z = r.spin * (i % 2 ? -1 : 1);
      });
      const ignite = s.complete && !push;
      if (ignite && !wasIgnited && !reduceMotion) {
        shockAge = 0;
        showcaseUntil = time + 7000;
        burst(CORE, 40, 1.6);
        shake = 0.12;
        sfx.ignite();
      }
      wasIgnited = ignite;
      ignition = damp(ignition, ignite ? 1 : 0, 0.8);
      coreMaterial.color.setHex(0x0b0b0c).lerp(white, ignition);
      pathRingMaterial.opacity = 0.12 + ignition * 0.5;
      starsA.opacity = 0.6 + Math.sin(seconds * 1.1) * 0.2;
      starsB.opacity = 0.7 - Math.sin(seconds * 1.7) * 0.2;
      if (shockAge < 3.5) {
        shockAge += dt;
        const k = shockAge / 3.5;
        shockwave.scale.setScalar(2 + k * (ring.radius * 3));
        shockMaterial.opacity = (1 - k) * 0.8;
      } else shockMaterial.opacity = 0;

      // The skyline: each finished task raises its share of towers, in a scattered order.
      const doneShare = s.tasks.filter((t) => t.done).length / N;
      towers.forEach((tower, i) => {
        const target = tower.order < doneShare || ignition > 0.5 ? tower.full : tower.rest;
        tower.height = reduceMotion ? target : THREE.MathUtils.damp(tower.height, target, 0.9 + (i % 4) * 0.15, dt);
        tower.body.scale.y = Math.max(0.01, tower.height);
        if (tower.antenna) {
          tower.antenna.position.y = tower.height + 0.6 + Math.sin(seconds * 0.8 + i) * 0.15;
          if (!reduceMotion) tower.antenna.rotation.y = seconds * 0.4 + i;
        }
      });

      vowMoons.forEach((v, i) => {
        const vow = s.vows[i] ?? "holding";
        v.material.color.lerp(vowColors[vow], 1 - Math.exp(-dt * 3));
        const a = seconds * (vow === "slipped" ? 0.08 : 0.32) + v.offset;
        const r = vow === "slipped" ? 5.2 : 4.3;
        v.moon.position.set(
          CORE.x + Math.sin(a) * r,
          CORE.y + Math.sin(a) * Math.sin(v.tilt) * r * 0.6 - (vow === "slipped" ? 1.5 : 0),
          CORE.z + Math.cos(a) * r,
        );
      });

      const point = ring.point(s.current);
      selectionRing.position.set(point.x, point.y + 0.03, point.z);
      selectionRing.scale.setScalar(reduceMotion ? 1 : 1 + Math.sin(seconds * 3) * 0.05);

      // Noise: buzzes and twitches for attention until its task is done.
      cards.forEach((c) => {
        const quiet = settled(c.quest);
        c.scale = damp(c.scale, quiet ? 0 : 1, quiet ? 7 : 3);
        c.group.visible = c.scale > 0.01;
        if (!c.group.visible) return;
        c.group.scale.setScalar(c.scale);
        const t = seconds + c.seed;
        const twitch = !reduceMotion && Math.sin(t * 0.7) > 0.9 ? Math.sin(t * 70) * 0.05 : 0;
        if (!reduceMotion)
          c.group.position.set(
            c.base.x + Math.sin(t * 0.9) * 0.3 + twitch,
            c.base.y + Math.sin(t * 1.3) * 0.2,
            c.base.z + Math.cos(t * 0.7) * 0.3,
          );
        c.group.lookAt(camera.position);
        c.group.rotateZ(Math.sin(t * 1.7) * 0.12 + twitch * 2 + (1 - c.scale) * 3);
      });

      // Particles.
      sparks.forEach((p) => {
        if (p.life <= 0) return;
        p.life -= dt;
        p.velocity.y -= dt * 6;
        p.item.position.addScaledVector(p.velocity, dt);
        p.item.scale.setScalar(Math.max(0, p.life));
        if (p.life <= 0) p.item.visible = false;
      });
      grit.forEach((p) => {
        if (p.life <= 0) return;
        p.life -= dt;
        if (p.item.position.y > p.floor || p.velocity.y > 0) {
          p.velocity.y -= dt * 9;
          p.item.position.addScaledVector(p.velocity, dt);
          p.item.rotation.x += p.spin.x * dt;
          p.item.rotation.y += p.spin.y * dt;
        } else {
          p.item.position.y = p.floor;
          p.item.scale.multiplyScalar(1 - dt * 3);
        }
        if (p.life <= 0) p.item.visible = false;
      });
      planes.forEach((p) => {
        if (p.life <= 0) return;
        p.life -= dt;
        p.velocity.y += dt * 0.25;
        p.item.position.addScaledVector(p.velocity, dt);
        p.item.lookAt(temp.copy(p.item.position).add(p.velocity));
        p.item.rotateZ(Math.sin(seconds * 3 + p.life) * 0.3);
        p.item.scale.setScalar(Math.min(1, p.life));
        if (p.life <= 0) p.item.visible = false;
      });

      // The orrery, the floor dials and everything else keep turning.
      if (!reduceMotion) {
        planets.forEach((p) => {
          const a = seconds * p.speed + p.phase;
          p.body.position.set(Math.sin(a) * p.radius, 0, Math.cos(a) * p.radius);
          p.body.rotation.y = seconds * p.spin;
          p.moons.forEach((m, i) => {
            const b = seconds * m.speed + i * 2;
            m.body.position.set(Math.sin(b) * m.radius, Math.sin(b) * m.radius * 0.15, Math.cos(b) * m.radius);
          });
        });
        satellites.forEach((sat, i) => {
          const a = seconds * sat.speed + i * 2.1;
          sat.body.position.set(Math.sin(a) * sat.radius, 0, Math.cos(a) * sat.radius);
          sat.body.rotation.set(a, a * 0.7, 0);
        });
        outerDial.rotation.y = seconds * 0.01;
        innerDial.rotation.y = -seconds * 0.03;
        belt.rotation.y = seconds * 0.01;
        boulders.forEach((rock, i) => {
          rock.rotation.x += dt * (0.2 + (i % 3) * 0.1);
          rock.rotation.y += dt * 0.15;
        });
        core.rotation.y = seconds * 0.08;
        for (let i = 0; i < DUST; i++) {
          let y = dustPositions[i * 3 + 1] + dt * (0.08 + (i % 5) * 0.03);
          if (y > 13) y = FLOOR_Y;
          dustPositions[i * 3 + 1] = y;
        }
        dustAttribute.needsUpdate = true;
        comets.forEach((c) => {
          c.next -= dt;
          if (c.next <= 0 && c.age >= 1.4) {
            const a = Math.random() * Math.PI * 2;
            c.from.set(Math.sin(a) * 120, 60 + Math.random() * 30, Math.cos(a) * 120);
            c.velocity.set(
              -Math.sin(a) * 70 + (Math.random() - 0.5) * 40,
              -20,
              -Math.cos(a) * 70 + (Math.random() - 0.5) * 40,
            );
            c.age = 0;
            c.next = 4 + Math.random() * 7;
          }
          if (c.age < 1.4) {
            c.age += dt;
            const head = temp.copy(c.from).addScaledVector(c.velocity, c.age);
            const positions = c.line.geometry.attributes.position as THREE.BufferAttribute;
            positions.setXYZ(0, head.x, head.y, head.z);
            head.addScaledVector(c.velocity, -0.12);
            positions.setXYZ(1, head.x, head.y, head.z);
            positions.needsUpdate = true;
            c.material.opacity = Math.sin((c.age / 1.4) * Math.PI) * 0.85;
          } else c.material.opacity = 0;
        });
      }

      // Camera. Left alone, the intro shows the whole ring and stepping in follows the figure from
      // outside the ring. Zooming (wheel, pinch, +/-) takes over the distance, and the view blends
      // smoothly from following the figure up close to framing the whole system far out.
      if (s.immersive !== lastImmersive) {
        lastImmersive = s.immersive;
        userDistance = null;
      }
      const overview = ring.radius * 3.1 * (compact ? 1.35 : 1);
      const ceremony = time < showcaseUntil;
      const autoWide = ceremony || (!s.immersive && !moving && !pushing);
      const zoomed = !ceremony && userDistance !== null;
      const desiredDistance = zoomed ? userDistance! : autoWide ? overview : compact ? 14 : 12;
      const wide = zoomed ? smoothstep((desiredDistance - 14) / (overview - 14)) : autoWide ? 1 : 0;
      viewBlend = damp(viewBlend, wide, 2.5);
      const follow = temp2.copy(avatar.position).setY(avatar.position.y + 0.9);
      const focus = temp.set(CORE.x, CORE.y - 3, CORE.z).lerp(follow, 1 - viewBlend);
      const delta = focus.sub(controls.target).multiplyScalar(1 - Math.exp(-dt * (2.6 - viewBlend)));
      controls.target.add(delta);
      camera.position.add(delta);
      const offset = camera.position.clone().sub(controls.target);
      const length = Math.max(
        minDistance,
        THREE.MathUtils.damp(offset.length(), desiredDistance, zoomed ? 7 : autoWide ? 1.4 : 2.2, dt),
      );
      cameraDistance = length;
      if (performance.now() > userLookUntil) {
        const outward = new THREE.Vector3(Math.sin(outwardHeading), 0, Math.cos(outwardHeading));
        const along = new THREE.Vector3(Math.cos(outwardHeading), 0, -Math.sin(outwardHeading));
        const close = outward
          .clone()
          .multiplyScalar(0.84)
          .addScaledVector(along, -0.3)
          .add(new THREE.Vector3(0, 0.5, 0))
          .normalize();
        const far = outward
          .multiplyScalar(0.62)
          .add(new THREE.Vector3(0, 0.78, 0))
          .normalize();
        offset.normalize().lerp(close.lerp(far, viewBlend).normalize(), 1 - Math.exp(-dt * 1.4));
      }
      camera.position.copy(controls.target).add(offset.setLength(length));
      controls.update();
      fog.near = 70 + length * 0.5;
      fog.far = 220 + length;

      // Lift the view clear of the dock while it is showing; the intro overview stays centred.
      const dockLift = s.dockHidden ? 0 : compact ? -height * 0.04 : height * 0.12;
      const wideLift = s.dockHidden || !s.immersive || compact ? -height * 0.03 : height * 0.14;
      viewShift.y = THREE.MathUtils.damp(viewShift.y, THREE.MathUtils.lerp(dockLift, wideLift, viewBlend), 3, dt);
      camera.setViewOffset(width, height, 0, viewShift.y, width, height);
      camera.updateProjectionMatrix();

      shake = Math.max(0, shake - dt * 0.4);
      shakeOffset.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      camera.position.add(shakeOffset);
      renderer.render(scene, camera);
      camera.position.sub(shakeOffset);
    }
    frame = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerCancel);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      controls.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>([
        stone,
        solidWhite,
        dimWhite,
        pictogram,
        edge,
        slotDark,
        gritMaterial,
        noiseMaterial,
        inkMaterial,
      ]);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
          geometries.add(obj.geometry);
          (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => materials.add(m));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return (
    <div className="world-host" ref={host}>
      {unavailable && (
        <div className="world-unavailable">
          <p>Your browser couldn’t start the 3D world.</p>
          <span>Try a browser with WebGL enabled. Your tasks below still work.</span>
        </div>
      )}
    </div>
  );
}
