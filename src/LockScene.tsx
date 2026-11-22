import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildHouse, type House } from "./town/house";
import { createKit } from "./town/kit";
import { RESIDENTS, Resident, drawBoard } from "./town/residents";
import { HOUSE_SLOTS, buildTown, type BuildingInfo } from "./town/town";

/*
 * The lock screen's playground: a black and white neighbourhood. Six houses on one street,
 * everyone with the same 13 daily tasks. Rocky (yours) does them all; Ferris procrastinates,
 * Gollum scrolls, Lebowski sleeps, Flash starts everything and finishes nothing, Nina redoes the
 * first task forever. A checklist floats over every house. Around them: school, library, office,
 * café, hospital, police, fire station, grocery, gym and a park, with traffic on the roads.
 *
 * You control Rocky (click/tap to send him, WASD to walk, Space to jump, tap him to wave), can
 * click any house or building to fly there, and have a full 3D camera.
 */

export type SceneSignals = { pulse: number; error: number; success: boolean };
type Caption = { tag: string; text: string; user: boolean };

export default function LockScene({ signals, lowDetail = false }: { signals: SceneSignals; lowDetail?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const signalsRef = useRef(signals);
  signalsRef.current = signals;
  const [caption, setCaption] = useState<Caption>({ tag: "ROCKY · DISCIPLINED", text: "Waking up", user: false });
  const [following, setFollowing] = useState(false);
  const [away, setAway] = useState(false);
  const cameraRef = useRef<{ zoom: (amount: number) => void; orbit: (angle: number) => void; toggleFollow: () => boolean; reset: () => void } | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const container: HTMLDivElement = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      return;
    }
    let disposed = false;
    let frame = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowDetail ? 1.5 : 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x030304);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const fog = new THREE.Fog(0x030304, 60, 220);
    scene.fog = fog;
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 600);
    const HOME_TARGET = new THREE.Vector3(0, 1.2, 0.6);
    const HOME_OFFSET = new THREE.Vector3(12, 13.5, 19);
    camera.position.copy(HOME_TARGET).add(HOME_OFFSET);

    // ---------- Camera: orbit, zoom, pan, follow, fly-to ----------
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(HOME_TARGET);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.screenSpacePanning = false;
    controls.zoomSpeed = 0.9;
    controls.minDistance = 3.5;
    controls.maxDistance = 290;
    controls.minPolarAngle = 0.08;
    controls.maxPolarAngle = 1.5;
    controls.rotateSpeed = 0.55;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    const cam = {
      follow: false,
      zoom: 0,
      orbit: 0,
      fly: null as { target: THREE.Vector3; distance: number } | null,
    };
    controls.addEventListener("start", () => (cam.fly = null));

    scene.add(new THREE.HemisphereLight(0xffffff, 0x111111, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(-30, 50, 30);
    key.castShadow = true;
    key.shadow.mapSize.set(lowDetail ? 1024 : 2048, lowDetail ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 160 });
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.normalBias = 0.05;
    key.target.position.set(0, 0, 10);
    scene.add(key, key.target);

    // ---------- The town, the houses and the residents ----------
    const kit = createKit(lowDetail);
    const town = buildTown(kit, scene);
    const houses: House[] = RESIDENTS.map((def, index) => {
      const slot = HOUSE_SLOTS[index];
      const house = buildHouse(kit, { index, tell: def.tell, title: def.title, level: def.level, name: def.name, ...slot });
      scene.add(house.group);
      house.group.updateMatrixWorld(true);
      return house;
    });
    const residents = RESIDENTS.map((def, index) => new Resident(def, index, houses[index].group, scene));
    const rocky = residents[0];
    const rockyHouse = houses[0];

    // A checklist board floating over every house.
    const boards = residents.map((resident, index) => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 560;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
      sprite.scale.set(2.3, 4.0, 1);
      // Behind the house, above the back wall, so it never hides the rooms.
      sprite.position.copy(houses[index].group.localToWorld(new THREE.Vector3(-1.5, 3.6, -5.4)));
      sprite.userData.house = index;
      scene.add(sprite);
      return { canvas, texture, sprite, resident };
    });
    const refreshBoards = () => {
      for (const board of boards) {
        if (!board.resident.checklistDirty) continue;
        board.resident.checklistDirty = false;
        drawBoard(board.canvas, board.resident);
        board.texture.needsUpdate = true;
      }
    };
    refreshBoards();
    // Redraw once the web fonts arrive, so the boards use the right typeface.
    void document.fonts?.ready.then(() => residents.forEach((r) => (r.checklistDirty = true)));

    // Stars around the diorama.
    const starPositions = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const a = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 1.6 - 0.6);
      const r = 260 + Math.random() * 40;
      starPositions.set([Math.sin(phi) * Math.cos(a) * r, Math.cos(phi) * r, Math.sin(phi) * Math.sin(a) * r], i * 3);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 }));
    scene.add(stars);

    // Paper planes from Rocky's mailbox, z's over anyone asleep, Gollum's glowing phone.
    const planeGeometry = new THREE.ConeGeometry(0.1, 0.34, 3);
    planeGeometry.rotateX(Math.PI / 2);
    planeGeometry.scale(1, 0.3, 1);
    const planes = Array.from({ length: 5 }, () => {
      const mesh = new THREE.Mesh(planeGeometry, kit.m.white);
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, velocity: new THREE.Vector3(), life: 0 };
    });
    const zCanvas = document.createElement("canvas");
    zCanvas.width = zCanvas.height = 64;
    const zCtx = zCanvas.getContext("2d");
    if (zCtx) {
      zCtx.fillStyle = "#f2f2f2";
      zCtx.font = "bold 48px Manrope, sans-serif";
      zCtx.textAlign = "center";
      zCtx.textBaseline = "middle";
      zCtx.fillText("z", 32, 34);
    }
    const zTexture = new THREE.CanvasTexture(zCanvas);
    const zs = Array.from({ length: 10 }, () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTexture, transparent: true, depthWrite: false }));
      sprite.visible = false;
      scene.add(sprite);
      return { sprite, life: 0 };
    });
    const zTimers = residents.map(() => 0);
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.22, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    phone.visible = false;
    scene.add(phone);
    const pings = Array.from({ length: 3 }, (_, i) => {
      const card = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshBasicMaterial({ color: 0xe6e6e6, side: THREE.DoubleSide }));
      card.visible = false;
      card.userData.offset = i * 2.1;
      scene.add(card);
      return card;
    });
    const gollum = residents.find((r) => r.def.tell === "gollum");

    // ---------- Who you're watching, and what the caption says ----------
    let watching: number | null = 0;
    let watchingBuilding: BuildingInfo | null = null;
    let lastCaption = "";
    const setText = (c: Caption) => {
      const k = `${c.tag}|${c.text}|${c.user}`;
      if (k === lastCaption) return;
      lastCaption = k;
      setCaption(c);
    };
    const flyTo = (target: THREE.Vector3, distance: number) => (cam.fly = { target: target.clone(), distance });
    const visitHouse = (index: number) => {
      watching = index;
      watchingBuilding = null;
      setAway(index !== 0);
      flyTo(houses[index].group.localToWorld(new THREE.Vector3(0, 0.6, 1.4)), 26);
    };
    const visitBuilding = (info: BuildingInfo) => {
      watching = null;
      watchingBuilding = info;
      setAway(true);
      flyTo(info.center, Math.max(24, info.size * 2.2));
    };
    const goHome = () => {
      cam.follow = false;
      setFollowing(false);
      visitHouse(0);
      cam.fly = { target: HOME_TARGET.clone(), distance: HOME_OFFSET.length() };
    };

    cameraRef.current = {
      zoom: (amount) => (cam.zoom += amount),
      orbit: (angle) => (cam.orbit += angle),
      toggleFollow: () => {
        cam.follow = !cam.follow;
        if (cam.follow) {
          cam.fly = null;
          if (watching === null) visitHouse(0);
        }
        setFollowing(cam.follow);
        return cam.follow;
      },
      reset: goHome,
    };

    // ---------- Playing with Rocky ----------
    let userUntil = 0;
    const takeControl = () => {
      rocky.scripted = false;
      userUntil = performance.now() + 7000;
      if (watching !== 0) visitHouse(0);
    };
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downAt = { x: 0, y: 0 };
    const clickables: THREE.Object3D[] = [
      ...houses.map((h) => h.group),
      ...town.buildings.map((b) => b.mesh),
      ...residents.map((r) => r.root),
      ...boards.map((b) => b.sprite),
    ];
    const onDown = (e: PointerEvent) => (downAt = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return; // a drag to look around
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(clickables, true)[0];
      if (!hit) return;
      const data = hit.object.userData;
      if (data.resident === 0) {
        takeControl();
        rocky.setEmote("wave", 1.8);
        return;
      }
      if (typeof data.resident === "number") return visitHouse(data.resident);
      if (data.building) return visitBuilding(data.building as BuildingInfo);
      if (data.house === 0 && watching === 0) {
        takeControl();
        if (data.station) rocky.goToStation(data.station);
        else rocky.goToPoint(hit.point.clone().setY(0));
        return;
      }
      if (typeof data.house === "number") visitHouse(data.house);
    };
    const canvas = renderer.domElement;
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);

    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      // Camera keys: + / - zoom, Q / E orbit, F follow, R or H back home.
      if (k === "+" || k === "=") return void (cam.zoom -= 0.35);
      if (k === "-" || k === "_") return void (cam.zoom += 0.35);
      if (k === "q") return void (cam.orbit -= 0.35);
      if (k === "e") return void (cam.orbit += 0.35);
      if (k === "f" && !e.repeat) return void cameraRef.current?.toggleFollow();
      if ((k === "r" || k === "h") && !e.repeat) return goHome();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        keys.add(k);
        takeControl();
        if (k.startsWith("arrow")) e.preventDefault();
      } else if (k === " " && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        takeControl();
        rocky.jump();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    function resize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.fov = w / h < 0.9 ? 42 : 32;
      camera.updateProjectionMatrix();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let seenPulse = signalsRef.current.pulse;
    let seenError = signalsRef.current.error;
    let cheered = false;
    let planeTimer = 0;
    let last = performance.now();
    const animate = (now: number) => {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const s = signalsRef.current;

      // Rocky reacts to the passcode.
      if (s.pulse !== seenPulse) {
        seenPulse = s.pulse;
        rocky.jump(2.6);
      }
      if (s.error !== seenError) {
        seenError = s.error;
        rocky.setEmote("shrug", 1.6);
        rocky.caption = "Wrong code. He shrugs.";
      }
      if (s.success && !cheered) {
        cheered = true;
        rocky.setEmote("cheer", 3);
        rocky.caption = "Welcome back.";
      }

      // Steering Rocky, relative to the camera.
      let steering = false;
      if (keys.size) {
        userUntil = now + 7000;
        const forward = new THREE.Vector3().subVectors(controls.target, camera.position).setY(0).normalize();
        const right = new THREE.Vector3(-forward.z, 0, forward.x);
        const dir = new THREE.Vector3();
        if (keys.has("w") || keys.has("arrowup")) dir.add(forward);
        if (keys.has("s") || keys.has("arrowdown")) dir.sub(forward);
        if (keys.has("d") || keys.has("arrowright")) dir.add(right);
        if (keys.has("a") || keys.has("arrowleft")) dir.sub(right);
        if (dir.lengthSq() > 0) {
          rocky.steer(dir.normalize(), dt);
          steering = true;
        }
      }
      if (!rocky.scripted && now > userUntil && !rocky.goal && !rocky.emote) rocky.scripted = true;

      residents.forEach((r) => r.update(dt, t, r === rocky && steering));
      refreshBoards();
      town.update(reduceMotion ? 0 : dt, t, rocky.activity?.station === "bus");

      // Rocky's mailbox flag and paper planes.
      const mailing = rocky.activity?.pose === "mail";
      rockyHouse.flag.rotation.z = mailing ? -0.9 : 0;
      planeTimer -= dt;
      if (mailing && planeTimer <= 0 && !reduceMotion) {
        planeTimer = 1.4;
        const plane = planes.find((p) => p.life <= 0);
        if (plane) {
          plane.mesh.position.copy(rockyHouse.group.localToWorld(new THREE.Vector3(4.7, 1.5, 3.75)));
          plane.velocity.set((Math.random() - 0.5) * 1.5, 2.2, 2.6 + Math.random());
          plane.life = 3.2;
          plane.mesh.visible = true;
        }
      }
      planes.forEach((p) => {
        if (p.life <= 0) return;
        p.life -= dt;
        p.velocity.y -= dt * 0.4;
        p.mesh.position.addScaledVector(p.velocity, dt);
        p.mesh.lookAt(p.mesh.position.clone().add(p.velocity));
        if (p.life <= 0) p.mesh.visible = false;
      });
      // Lamps off and z's floating up over anyone asleep.
      residents.forEach((r, i) => {
        houses[i].lampShade.material = r.isLying ? kit.m.grey : kit.m.white;
        zTimers[i] -= dt;
        if (r.isLying && zTimers[i] <= 0 && !reduceMotion) {
          zTimers[i] = 1.2;
          const z = zs.find((item) => item.life <= 0);
          if (z) {
            z.life = 2.6;
            z.sprite.visible = true;
            z.sprite.position.copy(houses[i].group.localToWorld(new THREE.Vector3(-5.3, 1.1, -3.25)));
          }
        }
      });
      zs.forEach((z, i) => {
        if (z.life <= 0) return;
        z.life -= dt;
        z.sprite.position.y += dt * 0.45;
        z.sprite.position.x += Math.sin(t * 2 + i) * dt * 0.2;
        z.sprite.material.opacity = Math.min(1, z.life);
        z.sprite.scale.setScalar(0.3 + (2.6 - z.life) * 0.12);
        if (z.life <= 0) z.sprite.visible = false;
      });
      // Gollum's phone glows in his hands, with notifications buzzing round his head.
      const scrolling = !!gollum && (gollum.pose === "phone" || gollum.pose === "sitphone");
      phone.visible = scrolling;
      pings.forEach((card) => (card.visible = scrolling));
      if (gollum && scrolling) {
        const sitting = gollum.pose === "sitphone";
        phone.position.copy(gollum.root.localToWorld(new THREE.Vector3(0, sitting ? 1.15 : 1.5, 0.42)));
        phone.quaternion.copy(gollum.root.quaternion);
        phone.rotateX(-0.6);
        const head = gollum.root.localToWorld(new THREE.Vector3(0, sitting ? 1.6 : 1.95, 0));
        pings.forEach((card) => {
          const a = t * 1.3 + card.userData.offset;
          card.position.set(head.x + Math.cos(a) * 0.9, head.y + 0.4 + Math.sin(t * 3 + card.userData.offset) * 0.12, head.z + Math.sin(a) * 0.9);
          card.lookAt(camera.position);
        });
      }

      // Caption: whoever (or whatever) you're watching.
      if (watchingBuilding) setText({ tag: watchingBuilding.name, text: watchingBuilding.blurb, user: false });
      else if (watching !== null) {
        const r = residents[watching];
        const playing = r === rocky && !rocky.scripted;
        let text = r.caption || "…";
        if (playing) {
          text = steering
            ? "You’re in control"
            : rocky.emote?.kind === "wave"
              ? "Waving at you"
              : rocky.activity
                ? rocky.activity.step?.caption ?? "Doing what you asked"
                : rocky.goal
                  ? "Walking where you sent him"
                  : "Waiting for you";
        } else if (r.moving && r.goal?.step) {
          text = `On the way: ${r.goal.step.caption.replace(/^[^A-Za-z“*]+/, "").toLowerCase()}`;
        }
        setText({ tag: playing ? "YOU’RE PLAYING" : `${r.def.name.toUpperCase()} · ${r.def.title} · ${r.score}/13`, text, user: playing });
      }

      // Camera: fly somewhere, follow whoever you're watching, or stay where you put it.
      if (cam.fly) {
        const k = 1 - Math.exp(-dt * 3);
        const offset = camera.position.clone().sub(controls.target);
        controls.target.add(cam.fly.target.clone().sub(controls.target).multiplyScalar(k));
        offset.setLength(THREE.MathUtils.lerp(offset.length(), cam.fly.distance, k));
        camera.position.copy(controls.target).add(offset);
        if (controls.target.distanceTo(cam.fly.target) < 0.05 && Math.abs(offset.length() - cam.fly.distance) < 0.2) cam.fly = null;
      } else if (cam.follow && watching !== null) {
        const aim = residents[watching].root.position.clone().add(new THREE.Vector3(0, 0.9, 0));
        const delta = aim.sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 4));
        controls.target.add(delta);
        camera.position.add(delta);
      }
      if (Math.abs(cam.zoom) > 0.0005 || Math.abs(cam.orbit) > 0.0005) {
        const offset = camera.position.clone().sub(controls.target);
        const zoomStep = cam.zoom * Math.min(1, dt * 8);
        const orbitStep = cam.orbit * Math.min(1, dt * 8);
        cam.zoom -= zoomStep;
        cam.orbit -= orbitStep;
        offset.setLength(THREE.MathUtils.clamp(offset.length() * Math.exp(zoomStep), controls.minDistance, controls.maxDistance));
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbitStep);
        camera.position.copy(controls.target).add(offset);
      }
      controls.update();
      const distance = camera.position.distanceTo(controls.target);
      fog.near = 40 + distance * 0.8;
      fog.far = 160 + distance * 1.6;
      stars.rotation.y = t * 0.004;
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      controls.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
          geometries.add(obj.geometry);
          (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((mat) => materials.add(mat));
        }
        if (obj instanceof THREE.Sprite) materials.add(obj.material);
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((mat) => {
        (mat as THREE.MeshBasicMaterial).map?.dispose();
        mat.dispose();
      });
      kit.dispose();
      zTexture.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [lowDetail]);

  return (
    <div className="home-scene" ref={host}>
      <div className={`home-caption ${caption.user ? "user" : ""}`} aria-live="polite">
        <span>{caption.tag}</span>
        {caption.text}
      </div>
      {away && (
        <button className="home-back" onClick={() => cameraRef.current?.reset()}>
          ← Back to Rocky
        </button>
      )}
      <div className="home-camera" role="group" aria-label="Camera">
        <button aria-label="Zoom in (+)" title="Zoom in (+)" onClick={() => cameraRef.current?.zoom(-0.45)}>
          +
        </button>
        <button aria-label="Zoom out (−)" title="Zoom out (−)" onClick={() => cameraRef.current?.zoom(0.45)}>
          −
        </button>
        <button aria-label="Rotate left (Q)" title="Rotate left (Q)" onClick={() => cameraRef.current?.orbit(-0.6)}>
          ⟲
        </button>
        <button aria-label="Rotate right (E)" title="Rotate right (E)" onClick={() => cameraRef.current?.orbit(0.6)}>
          ⟳
        </button>
        <button aria-label="Follow (F)" title="Follow (F)" aria-pressed={following} className={following ? "on" : ""} onClick={() => cameraRef.current?.toggleFollow()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
        <button aria-label="Back to Rocky's house (R)" title="Back to Rocky's house (R)" onClick={() => cameraRef.current?.reset()}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 11 12 4l9 7M5 10v10h14V10" />
          </svg>
        </button>
      </div>
    </div>
  );
}
