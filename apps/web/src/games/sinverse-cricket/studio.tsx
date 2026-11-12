"use client";

import { useEffect, useRef } from "react";
import * as T from "three";
import { CLIPS, DELIVERY, RIG, makePose, sampleClip, type ClipName } from "./animation";
import { batterStyle, batting } from "./batting";
import { applyPose, buildAthlete, holdBat, type Athlete, type Role } from "./character";
import { MotionPlayer, loadMotion, type MotionLibrary, type OneShot } from "./motion";
import { KitMaterials, RealisticBody, SQUAD, equipmentKit, loadSquad, modelFor, squadPeople, type Detail } from "./realistic";
import { appearanceFor, type Appearance } from "./athlete-look";
import { LIGHTS } from "./stadium";

/**
 * Character studio: a development page that draws the realistic athletes
 * through the game's own renderer code, for close-up review and the before and
 * after evidence. It is not linked from the site and is served only outside
 * production, or with CRICKET_STUDIO=1 (see app/dev/cricket-studio).
 *
 * Playwright drives it through `window.__studio.show(...)`, then screenshots.
 */

export interface StudioPerson {
  /** Squad model index; omit to use the game's own choice for this role/number/team. */
  model?: number;
  role?: Role;
  number?: number;
  team?: number;
  /** Placement in metres and facing (radians, 0 = towards +Z, the camera's default). */
  x?: number;
  z?: number;
  facing?: number;
  /** Overrides parts of the player's own appearance (to show every style). */
  look?: Partial<Appearance>;
}
export type StudioPose =
  | { kind: "clip"; name: ClipName; time: number }
  | { kind: "delivery"; style: "fast" | "medium" | "spin"; time: number }
  | { kind: "bat"; shot: "drive" | "pull" | "defence" | "loft" | "sweep" | "cut"; tick: number }
  | { kind: "motion"; clip: string; time: number; loco?: boolean };
export interface StudioShot {
  people: StudioPerson[];
  detail?: Detail;
  pose?: StudioPose;
  /** Named framing, or an explicit camera. */
  view?: "face-front" | "face-side" | "face-3q" | "body-front" | "body-side" | "body-rear" | "body-3q" | "hands" | "lineup" | "faces";
  camera?: { from: [number, number, number]; at: [number, number, number]; fov?: number };
  /** Frames the first person's whole pose from this compass angle (degrees, 0 = from +Z) and height. */
  fit?: { angle: number; elevation?: number; fov?: number; margin?: number };
  light?: "studio" | "day" | "night";
}

const BAT_INPUTS = {
  drive: { kind: "straight", direction: 0, foot: 0.3, power: 1, face: 0 },
  pull: { kind: "pull", direction: -60, foot: -0.2, power: 1, face: 0 },
  defence: { kind: "defend", direction: 0, foot: 0.3, power: 0.4, face: 0 },
  loft: { kind: "loft", direction: 0, foot: 0.3, power: 1, face: 0 },
  sweep: { kind: "sweep", direction: -50, foot: 0.4, power: 1, face: 0 },
  cut: { kind: "cut", direction: 80, foot: -0.2, power: 1, face: 0 },
} as const;
const SHOT_HEIGHT = { straight: 0.3, pull: 1.1, defend: 0.35, loft: 0.3, sweep: 0.25, cut: 0.7 } as const;

export function CricketStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(30, 1, 0.02, 200);
    const lights = new T.Group();
    scene.add(lights);
    const floor = new T.Mesh(new T.CircleGeometry(30, 48).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: "#7e8c78", roughness: 0.95 }));
    floor.receiveShadow = true;
    scene.add(floor);
    const kits = new KitMaterials();
    const equipment = equipmentKit();
    const squads = new Map<Detail, Awaited<ReturnType<typeof loadSquad>>>();
    let motion: MotionLibrary | null = null;
    let cast: { a: Athlete; body: RealisticBody }[] = [];

    const setLight = (mode: NonNullable<StudioShot["light"]>) => {
      lights.clear();
      if (mode === "studio") {
        // Neutral three-point studio: soft key, cool fill, rim from behind.
        scene.background = new T.Color("#9aa1a8");
        renderer.toneMappingExposure = 1;
        lights.add(new T.HemisphereLight("#f2f4f7", "#5d6066", 0.9));
        const key = new T.DirectionalLight("#fff4e8", 2.2);
        key.position.set(2.5, 4, 4);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -1, near: 0.5, far: 20 });
        key.shadow.bias = -0.0002;
        key.shadow.normalBias = 0.02;
        const fill = new T.DirectionalLight("#dfe8ff", 0.7);
        fill.position.set(-4, 2, 2);
        const rim = new T.DirectionalLight("#ffffff", 1.4);
        rim.position.set(-1, 3, -4);
        lights.add(key, fill, rim);
      } else {
        const l = LIGHTS[mode];
        scene.background = new T.Color(l.fog);
        renderer.toneMappingExposure = l.exposure;
        lights.add(new T.HemisphereLight(l.hemiSky, l.hemiGround, l.hemi));
        const sun = new T.DirectionalLight(l.key, l.keyI);
        sun.position.set(...(l.keyPos.map((v) => v / 10) as [number, number, number]));
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -1, near: 0.5, far: 30 });
        sun.shadow.bias = -0.0002;
        sun.shadow.normalBias = 0.02;
        lights.add(sun);
      }
    };

    const clear = () => {
      for (const c of cast) scene.remove(c.a.root);
      cast = [];
    };

    const poseOne = (a: Athlete, body: RealisticBody, pose: StudioPose | undefined, seed: number) => {
      const p = makePose();
      let frame = null;
      if (!pose && motion) pose = { kind: "motion", clip: "Idle_Loop", time: 0.5, loco: true };
      if (!pose) sampleClip(CLIPS.idle, 0.4, p), applyPose(a, p);
      else if (pose.kind === "clip") sampleClip(CLIPS[pose.name], pose.time, p), applyPose(a, p);
      else if (pose.kind === "delivery") sampleClip(DELIVERY[pose.style], pose.time, p), applyPose(a, p);
      else if (pose.kind === "bat") {
        const plan = BAT_INPUTS[pose.shot];
        sampleClip(CLIPS.stance, 0, p);
        const f = batting(
          { tick: pose.tick, plan, shotTick: 92, contactTick: 100, contact: "clean", impact: [0.04 + plan.foot * 0.45, SHOT_HEIGHT[plan.kind], plan.kind === "cut" ? 0.72 : 0.5], look: [6, 0.6, 0.3], style: batterStyle(seed) },
          p,
        );
        holdBat(a, p, f.bat);
      } else {
        sampleClip(CLIPS.idle, 0, p);
        applyPose(a, p);
        if (motion) {
          const player = new MotionPlayer(motion, RIG.thigh + RIG.shin, seed);
          frame = player.pose(pose.loco ? [{ clip: pose.clip, time: pose.time, weight: 1 }] : null, pose.loco ? null : { clip: pose.clip as OneShot, time: pose.time, weight: 1 });
          frame.lower = 1;
          frame.upper = 1;
        }
      }
      a.root.updateMatrixWorld(true);
      body.sync(frame);
    };

    const frameView = (shot: StudioShot) => {
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      camera.aspect = w / h;
      if (shot.fit) {
        const box = new T.Box3();
        cast[0]!.body.root.traverse((o) => {
          if ((o as T.Bone).isBone) box.expandByPoint(o.getWorldPosition(new T.Vector3()));
        });
        box.expandByScalar(0.18);
        const centre = box.getCenter(new T.Vector3()),
          radius = box.getSize(new T.Vector3()).length() / 2,
          fov = shot.fit.fov ?? 30,
          a = (shot.fit.angle * Math.PI) / 180,
          e = ((shot.fit.elevation ?? 8) * Math.PI) / 180,
          dist = (radius * (shot.fit.margin ?? 1.05)) / Math.sin(((fov / 2) * Math.PI) / 180) / Math.min(1, w / h);
        camera.fov = fov;
        camera.position.set(centre.x + Math.sin(a) * Math.cos(e) * dist, centre.y + Math.sin(e) * dist, centre.z + Math.cos(a) * Math.cos(e) * dist);
        camera.lookAt(centre);
        camera.updateProjectionMatrix();
        return;
      }
      if (shot.camera) {
        camera.fov = shot.camera.fov ?? 30;
        camera.position.set(...shot.camera.from);
        camera.lookAt(...shot.camera.at);
        camera.updateProjectionMatrix();
        return;
      }
      const first = cast[0]!;
      const head = first.body.bone("Head").getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 0.09, 0));
      const hips = first.body.bone("Hips").getWorldPosition(new T.Vector3());
      const facing = first.a.root.rotation.y,
        dir = (angle: number) => new T.Vector3(Math.sin(facing + angle), 0, Math.cos(facing + angle));
      const view = shot.view ?? "body-front";
      let from: T.Vector3, at: T.Vector3, fov = 30;
      if (view.startsWith("face")) {
        const angle = view === "face-front" ? 0 : view === "face-side" ? Math.PI / 2 : Math.PI / 4.5;
        // The Head joint is at the top of the neck, behind the face: aim a little forward of it.
        at = head.clone().add(new T.Vector3(0, -0.06, 0)).addScaledVector(dir(0), 0.05);
        from = at.clone().addScaledVector(dir(angle), 0.95);
        fov = 22;
      } else if (view === "hands") {
        at = first.body.bone("RightHand").getWorldPosition(new T.Vector3()).lerp(first.body.bone("LeftHand").getWorldPosition(new T.Vector3()), 0.5);
        from = at.clone().addScaledVector(dir(0.5), 1.1).add(new T.Vector3(0, 0.15, 0));
        fov = 28;
      } else if (view === "lineup" || view === "faces") {
        const xs = cast.map((c) => c.a.root.position.x),
          mid = (Math.min(...xs) + Math.max(...xs)) / 2,
          span = Math.max(...xs) - Math.min(...xs) + 1.2;
        at = new T.Vector3(mid, view === "faces" ? head.y - 0.05 : hips.y, 0);
        from = at.clone().add(new T.Vector3(0, 0, (view === "faces" ? span * 0.62 : span * 1.05) / Math.max(0.6, w / h)));
        fov = 30;
      } else {
        const angle = view === "body-front" ? 0 : view === "body-side" ? Math.PI / 2 : view === "body-rear" ? Math.PI : Math.PI / 4;
        at = hips.clone().add(new T.Vector3(0, 0.05, 0));
        from = at.clone().addScaledVector(dir(angle), 4.4).add(new T.Vector3(0, 0.2, 0));
      }
      camera.fov = fov;
      camera.position.copy(from);
      camera.lookAt(at);
      camera.updateProjectionMatrix();
    };

    const show = async (shot: StudioShot) => {
      const detail = shot.detail ?? "hi";
      if (!squads.has(detail)) squads.set(detail, await loadSquad(detail));
      if (!motion) motion = await loadMotion();
      const squad = squads.get(detail)!;
      clear();
      setLight(shot.light ?? "studio");
      for (const [k, person] of shot.people.entries()) {
        const role = person.role ?? "field",
          number = person.number ?? k + 1,
          team = person.team ?? 0;
        const a = buildAthlete(role, number, team, 2);
        const model = person.model ?? modelFor(role, number, team);
        const identity = `${role}:${number}:${team}`,
          appearance = { ...appearanceFor(identity, model % SQUAD.length), ...person.look };
        const body = new RealisticBody(squad[model % squad.length]!, a, kits, role === "umpire" ? -1 : team, { appearance, detail, antialias: true });
        equipment.dress(body, role, team, a.bones.bat, true);
        body.setShadows(true);
        for (const m of body.meshes) m.receiveShadow = true;
        a.root.position.set(person.x ?? 0, 0, person.z ?? 0);
        a.root.rotation.y = person.facing ?? 0;
        scene.add(a.root);
        cast.push({ a, body });
        poseOne(a, body, shot.pose, number * 7 + team);
      }
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      frameView(shot);
      renderer.render(scene, camera);
      const info = renderer.info.render;
      // Joint positions of the first person in their own frame (metres, facing +Z), for posture checks.
      const joints: Record<string, number[]> = {};
      if (cast[0])
        for (const name of ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "HeadTop_End", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"]) {
          try {
            const v = cast[0].a.root.worldToLocal(cast[0].body.bone(name).getWorldPosition(new T.Vector3()));
            joints[name] = [v.x, v.y, v.z].map((n) => Math.round(n * 1000) / 1000);
          } catch {
            /* a bone this model lacks */
          }
        }
      return { joints, looks: cast.map((c) => c.body.appearance), triangles: info.triangles, calls: info.calls, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, models: SQUAD.length };
    };

    (window as unknown as { __studio: unknown }).__studio = { ready: true, show, squad: SQUAD, people: squadPeople };
    canvas.dataset.ready = "true";
    return () => {
      clear();
      renderer.dispose();
    };
  }, []);
  return <canvas ref={canvasRef} data-testid="cricket-studio" style={{ display: "block", width: "100vw", height: "100vh", background: "#9aa1a8" }} />;
}
