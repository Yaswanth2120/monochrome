import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/**
 * A pictogram-style figure: floating round head, thick rounded limbs, near-side
 * limbs bright white and far-side limbs grey. It can idle, walk and push a heavy
 * stone. All poses are plain joint angles so they blend smoothly.
 */

export type Pose = {
  pelvisY: number;
  spine: number;
  head: number;
  hipL: number;
  liftL: number;
  hipR: number;
  liftR: number;
  shL: number;
  elL: number;
  zL: number;
  shR: number;
  elR: number;
  zR: number;
};

const THIGH = 0.36;
const SHIN = 0.34;
const ANKLE = 0.095;
const UPPER_ARM = 0.27;
const FOREARM = 0.28;
const SHOULDER_Y = 0.6;
const SHOULDER_X = 0.22;
const STAND = THIGH + SHIN + ANKLE;

export const FIGURE_SCALE = 0.78;
/** One heave against the stone, in seconds, and how many it takes. */
export const PUSH_HEAVE = 1.05;
export const PUSH_HEAVES = 3;
/** Part of each heave (0..1) where the legs drive and the stone actually moves. */
export const PUSH_DRIVE_START = 0.35;
export const PUSH_DRIVE_END = 0.68;
/** Where the hands meet the stone: distance in front of the figure and height, in world units. */
export const PUSH_REACH = 0.45;
const PUSH_HAND_HEIGHT = 0.74;

const clamp = THREE.MathUtils.clamp;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** "white" is the hero; "grey" is a dimmer figure for background characters. */
export function createFigure({ tone = "white" }: { tone?: "white" | "grey" } = {}) {
  const grey = tone === "grey";
  const white = new THREE.MeshStandardMaterial({
    color: grey ? 0x9c9ca2 : 0xffffff,
    roughness: 0.45,
    emissive: 0xffffff,
    emissiveIntensity: grey ? 0.02 : 0.14,
  });
  const ghost = new THREE.MeshStandardMaterial({
    color: grey ? 0x55555b : 0x8f8f8f,
    roughness: 0.6,
    emissive: 0x2a2a2a,
    emissiveIntensity: grey ? 0.1 : 0.3,
  });

  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const root = new THREE.Group();
  root.scale.setScalar(FIGURE_SCALE);
  const pelvis = new THREE.Group();
  pelvis.position.y = STAND;
  root.add(pelvis);
  const spine = new THREE.Group();
  pelvis.add(spine);
  add(new THREE.CapsuleGeometry(0.13, 0.42, 6, 18), white, spine, 0, 0.36);
  const head = new THREE.Group();
  head.position.y = 0.7;
  spine.add(head);
  add(new THREE.SphereGeometry(0.19, 28, 20), white, head, 0, 0.26);

  // x < 0 is the side that faces the camera while pushing, so it gets the bright limbs.
  function limb(
    parent: THREE.Object3D,
    x: number,
    y: number,
    upperLength: number,
    lowerLength: number,
    radius: number,
    material: THREE.Material,
    kind: "leg" | "arm",
  ) {
    const upper = new THREE.Group();
    upper.position.set(x, y, 0);
    parent.add(upper);
    add(new THREE.CapsuleGeometry(radius, upperLength, 4, 12), material, upper, 0, -upperLength / 2);
    const lower = new THREE.Group();
    lower.position.y = -upperLength;
    upper.add(lower);
    add(new THREE.CapsuleGeometry(radius * 0.92, lowerLength, 4, 12), material, lower, 0, -lowerLength / 2);
    const end =
      kind === "leg"
        ? add(new RoundedBoxGeometry(0.17, 0.09, 0.28, 2, 0.04), material, lower, 0, -lowerLength - 0.05, 0.06)
        : add(new THREE.SphereGeometry(0.072, 14, 12), material, lower, 0, -lowerLength - 0.02);
    return { upper, lower, end };
  }
  const legL = limb(pelvis, -0.1, 0, THIGH, SHIN, 0.085, white, "leg");
  const legR = limb(pelvis, 0.1, 0, THIGH, SHIN, 0.085, ghost, "leg");
  const armL = limb(spine, -SHOULDER_X, SHOULDER_Y, UPPER_ARM, FOREARM - 0.02, 0.068, white, "arm");
  const armR = limb(spine, SHOULDER_X, SHOULDER_Y, UPPER_ARM, FOREARM - 0.02, 0.068, ghost, "arm");

  const pose = idlePose(0);

  function plantKnee(pelvisY: number, hip: number, lift: number) {
    const reach = (pelvisY - ANKLE - THIGH * Math.cos(hip)) / SHIN;
    return Math.max(0.02, Math.acos(clamp(reach, -1, 1)) - hip) + lift;
  }

  function apply(target: Pose, blend: number) {
    for (const key of Object.keys(target) as (keyof Pose)[]) {
      pose[key] += (target[key] - pose[key]) * blend;
    }
    pelvis.position.y = pose.pelvisY;
    spine.rotation.x = pose.spine;
    head.rotation.x = pose.head;
    const legs: [typeof legL, number, number][] = [
      [legL, pose.hipL, pose.liftL],
      [legR, pose.hipR, pose.liftR],
    ];
    for (const [leg, hip, lift] of legs) {
      const knee = plantKnee(pose.pelvisY, hip, lift);
      leg.upper.rotation.x = hip;
      leg.lower.rotation.x = knee;
      leg.end.rotation.x = -(hip + knee);
    }
    armL.upper.rotation.set(pose.shL, 0, pose.zL);
    armL.lower.rotation.x = pose.elL;
    armR.upper.rotation.set(pose.shR, 0, pose.zR);
    armR.lower.rotation.x = pose.elR;
  }

  /** Two-bone reach toward a point in spine space. */
  function reach(shoulderX: number, target: THREE.Vector3) {
    const dx = target.x - shoulderX;
    const dy = target.y - SHOULDER_Y;
    const dz = target.z;
    const distance = clamp(Math.hypot(dx, dy, dz), 0.08, UPPER_ARM + FOREARM - 0.002);
    const toward = Math.atan2(-dz, -dy);
    const shoulderBend = Math.acos(
      clamp((UPPER_ARM ** 2 + distance ** 2 - FOREARM ** 2) / (2 * UPPER_ARM * distance), -1, 1),
    );
    const elbow =
      Math.PI - Math.acos(clamp((UPPER_ARM ** 2 + FOREARM ** 2 - distance ** 2) / (2 * UPPER_ARM * FOREARM), -1, 1));
    return {
      sh: toward + shoulderBend,
      el: -elbow,
      z: Math.asin(clamp(dx / distance, -1, 1)) * 0.9,
    };
  }

  /** Fills the arm angles of a pose so both palms press flat on the stone's face. */
  function bracePalms(target: Pose) {
    const relY = PUSH_HAND_HEIGHT / FIGURE_SCALE - target.pelvisY;
    const relZ = PUSH_REACH / FIGURE_SCALE;
    const cos = Math.cos(target.spine);
    const sin = Math.sin(target.spine);
    const y = relY * cos + relZ * sin;
    const z = -relY * sin + relZ * cos;
    const left = reach(-SHOULDER_X, new THREE.Vector3(-0.16, y, z));
    const right = reach(SHOULDER_X, new THREE.Vector3(0.16, y, z));
    target.shL = left.sh;
    target.elL = left.el;
    target.zL = left.z;
    target.shR = right.sh;
    target.elR = right.el;
    target.zR = right.z;
    return target;
  }

  return { root, apply, bracePalms };
}

export function idlePose(time: number): Pose {
  const breath = Math.sin(time * 1.6);
  return {
    pelvisY: STAND - 0.01 + breath * 0.004,
    spine: 0.04 + breath * 0.015,
    head: -0.02,
    hipL: -0.06,
    liftL: 0,
    hipR: 0.06,
    liftR: 0,
    shL: 0.04,
    elL: -0.16,
    zL: -0.12,
    shR: -0.04,
    elR: -0.16,
    zR: 0.12,
  };
}

/** A short "yes!": both arms thrown up in a V, a small bounce. t runs 0..1. */
export function cheerPose(t: number): Pose {
  const lift = Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5);
  const bounce = Math.abs(Math.sin(t * Math.PI * 3)) * 0.05 * (1 - t);
  return {
    pelvisY: STAND - 0.01 - bounce,
    spine: -0.06 * lift,
    head: -0.25 * lift,
    hipL: -0.06,
    liftL: 0,
    hipR: 0.06,
    liftR: 0,
    shL: -2.75 * lift,
    elL: -0.15,
    zL: -0.4 * lift,
    shR: -2.75 * lift,
    elR: -0.15,
    zR: 0.4 * lift,
  };
}

/** phase advances with each step; air is 0 on the ground and 1 at the top of a hop. */
export function walkPose(phase: number, air: number): Pose {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const hip = 0.55 * (1 - air * 0.6);
  return {
    pelvisY: STAND - 0.05 + Math.abs(s) * 0.025,
    spine: 0.14 + air * 0.1,
    head: -0.08,
    // In the air the legs split into a leap (front reaching, back trailing) instead of
    // folding both shins back, which read as kneeling.
    hipL: -s * hip * (1 - air) - air * 0.75,
    liftL: 0.85 * Math.max(0, c) * (1 - air) + air * 0.55,
    hipR: s * hip * (1 - air) + air * 0.45,
    liftR: 0.85 * Math.max(0, -c) * (1 - air) + air * 0.35,
    shL: s * 0.55 - air * 0.5,
    elL: -0.35 - Math.max(0, -s) * 0.35,
    zL: -0.1 - air * 0.5,
    shR: -s * 0.55 - air * 0.5,
    elR: -0.35 - Math.max(0, s) * 0.35,
    zR: 0.1 + air * 0.5,
  };
}

type PushKey = Pick<Pose, "pelvisY" | "spine" | "head" | "hipL" | "liftL" | "hipR" | "liftR"> & {
  u: number;
};
// Front leg (L) bent, back leg (R) driving. Legs plant themselves via plantKnee.
const gather: Omit<PushKey, "u"> = {
  pelvisY: 0.66,
  spine: 0.62,
  head: 0.05,
  hipL: -0.55,
  liftL: 0,
  hipR: 0.45,
  liftR: 0,
};
const PUSH_KEYS: PushKey[] = [
  { u: 0, ...gather },
  // Sink and set: hips drop, head tucks.
  { u: PUSH_DRIVE_START, pelvisY: 0.62, spine: 0.7, head: 0.15, hipL: -0.6, liftL: 0, hipR: 0.55, liftR: 0 },
  // Drive: back leg straightens and the whole body lines up behind the stone.
  { u: PUSH_DRIVE_END, pelvisY: 0.6, spine: 0.8, head: 0.32, hipL: -0.3, liftL: 0, hipR: 0.8, liftR: 0 },
  // Recover: bring the back foot forward for the next heave.
  { u: 0.84, pelvisY: 0.66, spine: 0.68, head: 0.15, hipL: -0.45, liftL: 0, hipR: 0.15, liftR: 0.7 },
  { u: 1, ...gather },
];

/** u runs 0..1 through one heave; strain adds a small tremble while driving. */
export function pushPose(u: number, time: number): Pose {
  let i = 0;
  while (i < PUSH_KEYS.length - 2 && u > PUSH_KEYS[i + 1].u) i++;
  const a = PUSH_KEYS[i];
  const b = PUSH_KEYS[i + 1];
  const t = smooth(clamp((u - a.u) / (b.u - a.u), 0, 1));
  const mix = (key: keyof Omit<PushKey, "u">) => a[key] + (b[key] - a[key]) * t;
  const strain = u > PUSH_DRIVE_START - 0.1 && u < PUSH_DRIVE_END ? Math.sin(time * 70) * 0.012 : 0;
  return {
    pelvisY: mix("pelvisY"),
    spine: mix("spine") + strain,
    head: mix("head") + strain,
    hipL: mix("hipL"),
    liftL: mix("liftL"),
    hipR: mix("hipR"),
    liftR: mix("liftR"),
    shL: 0,
    elL: 0,
    zL: 0,
    shR: 0,
    elR: 0,
    zR: 0,
  };
}
