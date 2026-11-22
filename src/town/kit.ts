import * as THREE from "three";

/*
 * Shared building blocks for the lock-screen town: materials, boxes with line-art edges,
 * text signs, trees, lamps, benches and vehicles. Everything is black, white and grey.
 */

export type Kit = ReturnType<typeof createKit>;

export function createKit(lowDetail: boolean) {
  const textures: THREE.Texture[] = [];
  const m = {
    base: new THREE.MeshStandardMaterial({ color: 0x0f0f11, roughness: 1 }),
    lawn: new THREE.MeshStandardMaterial({ color: 0x161619, roughness: 1 }),
    road: new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 1 }),
    sidewalk: new THREE.MeshStandardMaterial({ color: 0x242428, roughness: 1 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x232327, roughness: 0.95 }),
    building: new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.9 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }),
    grey: new THREE.MeshStandardMaterial({ color: 0x8c8c92, roughness: 0.7 }),
    black: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.8 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }),
    edge: new THREE.LineBasicMaterial({ color: 0x77777e }),
    edgeBright: new THREE.LineBasicMaterial({ color: 0xd8d8dc }),
    edgeFaint: new THREE.LineBasicMaterial({ color: 0x3c3c43 }),
  };

  function box(
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D,
    lines: THREE.LineBasicMaterial | null = m.edge,
    shadow = true,
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    if (lines) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), lines));
    parent.add(mesh);
    return mesh;
  }
  function cylinder(r: number, h: number, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, segments = 20, lines: THREE.LineBasicMaterial | null = m.edge) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), material);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (lines) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), lines));
    parent.add(mesh);
    return mesh;
  }

  /** A canvas texture with centred lines of text. */
  function textTexture(
    lines: { text: string; size: number; weight?: number; mono?: boolean; color?: string }[],
    width: number,
    height: number,
    { background = "#050506", border = "#f2f2f2" }: { background?: string; border?: string | null } = {},
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      if (border) {
        ctx.strokeStyle = border;
        ctx.lineWidth = Math.max(3, height * 0.04);
        ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, width - ctx.lineWidth, height - ctx.lineWidth);
      }
      const total = lines.reduce((sum, l) => sum + l.size * 1.25, 0);
      let y = (height - total) / 2;
      for (const line of lines) {
        ctx.fillStyle = line.color ?? "#f2f2f2";
        ctx.font = `${line.weight ?? 700} ${line.size}px ${line.mono ? "'IBM Plex Mono', monospace" : "Manrope, 'DM Sans', sans-serif"}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(line.text, width / 2, y);
        y += line.size * 1.25;
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    textures.push(texture);
    return texture;
  }

  /** A flat sign facing +z in its parent's space. */
  function sign(lines: Parameters<typeof textTexture>[0], w: number, h: number, parent: THREE.Object3D, x: number, y: number, z: number, rotY = 0, options?: Parameters<typeof textTexture>[3]) {
    const texture = textTexture(lines, Math.round(w * 128), Math.round(h * 128), options);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    parent.add(mesh);
    return mesh;
  }

  function tree(parent: THREE.Object3D, x: number, z: number, scale = 1) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);
    cylinder(0.14, 0.9, m.grey, 0, 0, 0, group, 8, lowDetail ? null : m.edge);
    [1.0, 0.8, 0.55].forEach((r, i) => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 0.9, 8), m.white);
      cone.position.set(0, 1.1 + i * 0.55, 0);
      cone.castShadow = true;
      if (!lowDetail) cone.add(new THREE.LineSegments(new THREE.EdgesGeometry(cone.geometry, 30), m.edge));
      group.add(cone);
    });
    parent.add(group);
    return group;
  }
  function roundTree(parent: THREE.Object3D, x: number, z: number, scale = 1) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);
    cylinder(0.12, 1.1, m.grey, 0, 0, 0, group, 8, null);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 0), m.white);
    crown.position.y = 1.75;
    crown.castShadow = true;
    if (!lowDetail) crown.add(new THREE.LineSegments(new THREE.EdgesGeometry(crown.geometry), m.edge));
    group.add(crown);
    parent.add(group);
    return group;
  }
  function lamp(parent: THREE.Object3D, x: number, z: number) {
    cylinder(0.05, 2.6, m.grey, x, 0, z, parent, 6, null).castShadow = false;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), m.glow);
    bulb.position.set(x, 2.7, z);
    parent.add(bulb);
  }
  function bench(parent: THREE.Object3D, x: number, z: number, rotY = 0) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    box(1.6, 0.1, 0.45, m.white, 0, 0.42, 0, group);
    box(1.6, 0.4, 0.08, m.white, 0, 0.52, -0.2, group);
    [-0.65, 0.65].forEach((dx) => box(0.08, 0.42, 0.4, m.grey, dx, 0, 0, group, null));
    parent.add(group);
    return group;
  }

  type VehicleKind = "car" | "police" | "ambulance" | "bus" | "schoolbus" | "firetruck";
  /** A vehicle facing +z. */
  function vehicle(kind: VehicleKind, parent: THREE.Object3D, x = 0, z = 0, rotY = 0) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    const big = kind === "bus" || kind === "schoolbus" || kind === "firetruck";
    const length = big ? 4.2 : kind === "ambulance" ? 2.6 : 2.1;
    const width = big ? 1.25 : 1.0;
    const bodyMaterial = kind === "police" || kind === "schoolbus" ? m.black : kind === "car" ? m.grey : m.white;
    const lines = bodyMaterial === m.black ? m.edgeBright : m.edge;
    if (big) {
      box(width, 1.45, length, bodyMaterial, 0, 0.25, 0, group, lines);
      for (let w = -1.5; w <= 1.5; w += 0.6) {
        box(0.02, 0.4, 0.45, bodyMaterial === m.black ? m.white : m.black, width / 2 + 0.01, 0.95, w, group, null, false);
        box(0.02, 0.4, 0.45, bodyMaterial === m.black ? m.white : m.black, -width / 2 - 0.01, 0.95, w, group, null, false);
      }
      if (kind === "firetruck") box(0.5, 0.15, length * 0.8, m.grey, 0, 1.7, -0.2, group);
    } else {
      box(width, 0.5, length, bodyMaterial, 0, 0.2, 0, group, lines);
      box(width * 0.86, 0.42, length * (kind === "ambulance" ? 0.7 : 0.5), kind === "ambulance" ? m.white : m.black, 0, 0.7, kind === "ambulance" ? -0.25 : -0.1, group, lines);
    }
    [-1, 1].forEach((side) =>
      [-1, 1].forEach((end) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12), m.black);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * (width / 2), 0.22, end * length * 0.32);
        group.add(wheel);
      }),
    );
    let beacon: THREE.Mesh[] = [];
    if (kind === "police" || kind === "ambulance" || kind === "firetruck") {
      const top = kind === "police" ? 1.14 : kind === "ambulance" ? 1.16 : 1.72;
      beacon = [-0.22, 0.22].map((dx) => {
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.18), m.glow);
        light.position.set(dx, top, kind === "firetruck" ? length * 0.42 : -0.1);
        group.add(light);
        return light;
      });
    }
    if (kind === "ambulance") {
      const cross = new THREE.Group();
      box(0.5, 0.14, 0.02, m.black, 0, 0, 0, cross, null, false);
      box(0.14, 0.5, 0.02, m.black, 0, -0.18, 0, cross, null, false);
      cross.position.set(width / 2 + 0.02, 0.62, 0.3);
      cross.rotation.y = Math.PI / 2;
      group.add(cross);
    }
    parent.add(group);
    return { group, beacon };
  }

  function dispose() {
    textures.forEach((t) => t.dispose());
  }

  return { m, box, cylinder, textTexture, sign, tree, roundTree, lamp, bench, vehicle, dispose, lowDetail };
}
