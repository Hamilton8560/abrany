"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, Html } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import gsap from "gsap";
import { api } from "@/lib/client";

type RegionId = "prefrontal" | "temporal" | "hippocampus" | "cerebellum" | "association";
type MindNode = {
  id: string;
  label: string;
  type: "lesson" | "guide" | "chapter";
  cluster: string;
  clusterId: string;
  kind?: string;
  snippet: string;
  region: RegionId;
  xp: number;
  mastery: number;
  heat: number;
};
type MindLink = { source: string; target: string; cross: boolean };
type Region = { id: RegionId; name: string; stat: string; detail: string; xp: number; level: number; progress: number };
type ClusterStat = { clusterId: string; cluster: string; xp: number; level: number; progress: number };
type Stats = {
  mindLevel: number;
  mindProgress: number;
  totalXp: number;
  streakDays: number;
  regions: Region[];
  clusters: ClusterStat[];
};
type Graph = { nodes: MindNode[]; links: MindLink[]; stats: Stats };

const ACCENT = new THREE.Color("#ff4326");
const STALE = new THREE.Color("#3a4353");
const TINTS = ["#e7c9a6", "#a8c8d6", "#a9d2b4", "#c9b6e0", "#e0b6a2", "#b6c4e0"].map((c) => new THREE.Color(c));
const BG = "#0b0f16";
const R = 24; // brain scale

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619;
  return ((h >>> 0) % 100000) / 100000;
}
function hashInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/* ── anatomy: region anchors inside the brain (x: width, y: height, z: front+) ── */
const REGION_ANCHORS: Record<RegionId, { anchors: [number, number, number][]; scatter: number }> = {
  prefrontal: { anchors: [[0, 0.28 * R, 0.62 * R]], scatter: 0.24 * R },
  temporal: { anchors: [[-0.56 * R, -0.16 * R, 0.10 * R], [0.56 * R, -0.16 * R, 0.10 * R]], scatter: 0.22 * R },
  hippocampus: { anchors: [[-0.26 * R, -0.10 * R, -0.06 * R], [0.26 * R, -0.10 * R, -0.06 * R]], scatter: 0.15 * R },
  cerebellum: { anchors: [[0, -0.42 * R, -0.62 * R]], scatter: 0.20 * R },
  association: { anchors: [[0, 0.40 * R, -0.30 * R]], scatter: 0.24 * R },
};
const REGION_NAME: Record<RegionId, string> = {
  prefrontal: "Prefrontal cortex",
  temporal: "Temporal lobe",
  hippocampus: "Hippocampus",
  cerebellum: "Cerebellum",
  association: "Association cortex",
};

type Placed = MindNode & { pos: THREE.Vector3; color: THREE.Color; r: number };

/** Place each node inside its anatomical region (deterministic per node id). */
function layout(graph: Graph): { placed: Placed[]; byId: Map<string, Placed> } {
  const placed = graph.nodes.map((n) => {
    const def = REGION_ANCHORS[n.region] ?? REGION_ANCHORS.association;
    const anchor = def.anchors[def.anchors.length > 1 ? (hashInt(n.clusterId + n.id) & 1) : 0];
    const h1 = hash(n.id), h2 = hash(n.id + "y"), h3 = hash(n.id + "z");
    // scatter within the region, gently flattened so nodes hug the region's mass
    const pos = new THREE.Vector3(
      anchor[0] + (h1 - 0.5) * 2 * def.scatter,
      anchor[1] + (h2 - 0.5) * 1.6 * def.scatter,
      anchor[2] + (h3 - 0.5) * 2 * def.scatter,
    );
    const color = TINTS[Math.abs(hashInt(n.clusterId)) % TINTS.length];
    const base = n.type === "guide" ? 0.85 : n.type === "chapter" ? 0.75 : 0.55;
    const r = base * (0.8 + n.mastery * 0.9);
    return { ...n, pos, color, r };
  });
  const byId = new Map(placed.map((p) => [p.id, p]));
  return { placed, byId };
}

/* ── the translucent brain shell: a procedural cortex point cloud ── */
function brainPoints(count: number, seedTag: string): Float32Array {
  const pts = new Float32Array(count * 3);
  let placedCount = 0;
  let i = 0;
  while (placedCount < count && i < count * 30) {
    i++;
    const u = hash(seedTag + i), v = hash(seedTag + "v" + i), w = hash(seedTag + "w" + i);
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    let x = Math.sin(phi) * Math.cos(theta);
    let y = Math.cos(phi);
    let z = Math.sin(phi) * Math.sin(theta);
    // cerebrum: wider than tall, longer front-back; flatten the underside
    let sx = 1.0, sy = 0.82, sz = 1.18;
    if (y < 0) sy *= 0.72;
    x *= sx; y *= sy; z *= sz;
    // carve the longitudinal fissure along the top
    if (y > 0.15) y -= 0.16 * Math.exp(-((x / 0.16) ** 2)) * y;
    // gyri wrinkle
    const wr = 1 + 0.035 * Math.sin(9 * theta) * Math.sin(7 * phi) + 0.02 * Math.sin(13 * phi + 3 * theta);
    x *= wr; y *= wr; z *= wr;
    // drop points that would sit where the cerebellum notch is
    if (z < -0.55 && y < -0.1) continue;
    // slight shell thickness
    const t = 0.97 + w * 0.05;
    pts[placedCount * 3] = x * R * t;
    pts[placedCount * 3 + 1] = y * R * t;
    pts[placedCount * 3 + 2] = z * R * t;
    placedCount++;
  }
  return pts.slice(0, placedCount * 3);
}
function cerebellumPoints(count: number): Float32Array {
  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = hash("cb" + i), v = hash("cbv" + i);
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const wr = 1 + 0.06 * Math.sin(16 * theta); // tight cerebellar folds
    const x = Math.sin(phi) * Math.cos(theta) * 0.42 * wr;
    const y = Math.cos(phi) * 0.26 * wr;
    const z = Math.sin(phi) * Math.sin(theta) * 0.34 * wr;
    pts[i * 3] = x * R;
    pts[i * 3 + 1] = (y - 0.42) * R;
    pts[i * 3 + 2] = (z - 0.62) * R;
  }
  return pts;
}
function stemPoints(count: number): Float32Array {
  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = hash("st" + i), v = hash("stv" + i), w = hash("stw" + i);
    const a = u * Math.PI * 2;
    const rr = 0.09 * Math.sqrt(v);
    const yy = -0.5 - w * 0.28;
    pts[i * 3] = Math.cos(a) * rr * R;
    pts[i * 3 + 1] = yy * R;
    pts[i * 3 + 2] = (-0.25 + Math.sin(a) * rr * 0.8) * R;
  }
  return pts;
}

function BrainShell({ reduced }: { reduced: boolean }) {
  const cortex = useMemo(() => brainPoints(reduced ? 1400 : 3200, "cx"), [reduced]);
  const cereb = useMemo(() => cerebellumPoints(reduced ? 260 : 620), [reduced]);
  const stem = useMemo(() => stemPoints(reduced ? 60 : 140), [reduced]);
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current || reduced) return;
    // the whole organ breathes, barely
    const s = 1 + Math.sin(state.clock.elapsedTime * 0.6) * 0.006;
    group.current.scale.setScalar(s);
  });
  const cloud = (positions: Float32Array, size: number, color: string, opacity: number, key: string) => (
    <points key={key}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={size}
        color={color}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
  return (
    <group ref={group}>
      {cloud(cortex, 0.26, "#5f88b8", 0.34, "cortex")}
      {cloud(cereb, 0.22, "#5f88b8", 0.4, "cereb")}
      {cloud(stem, 0.2, "#4f7096", 0.35, "stem")}
    </group>
  );
}

/* ── region glows: soft volumes whose brightness = that region's level; they FLARE on level-up ── */
function RegionGlows({
  stats,
  flare,
}: {
  stats: Stats;
  flare: React.MutableRefObject<Partial<Record<RegionId, number>>>;
}) {
  const mats = useRef<Map<string, THREE.MeshBasicMaterial>>(new Map());
  const byId = useMemo(() => new Map(stats.regions.map((r) => [r.id as RegionId, r])), [stats]);
  useFrame((state, dt) => {
    for (const [key, mat] of mats.current) {
      const rid = key.split("|")[0] as RegionId;
      const level = byId.get(rid)?.level ?? 1;
      const boost = flare.current[rid] ?? 0;
      if (boost > 0) flare.current[rid] = Math.max(0, boost - dt * 0.9);
      const idle = 0.02 + Math.min(level, 8) * 0.011 + Math.sin(state.clock.elapsedTime * 0.9 + hash(key) * 6) * 0.008;
      mat.opacity = idle + boost * 0.5;
      mat.color.lerpColors(new THREE.Color("#4a7fb5"), ACCENT, Math.min(1, boost));
    }
  });
  return (
    <>
      {(Object.keys(REGION_ANCHORS) as RegionId[]).flatMap((rid) =>
        REGION_ANCHORS[rid].anchors.map((a, i) => (
          <mesh key={`${rid}|${i}`} position={a}>
            <sphereGeometry args={[REGION_ANCHORS[rid].scatter + 0.6, 24, 24]} />
            <meshBasicMaterial
              ref={(m) => {
                if (m) mats.current.set(`${rid}|${i}`, m);
              }}
              transparent
              opacity={0.08}
              color="#4a7fb5"
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        )),
      )}
    </>
  );
}

/* ── synapses (per-tube pulse, ambient firing, region-aware bursts) ── */
type Tube = { key: number; geo: THREE.TubeGeometry; mat: THREE.ShaderMaterial; a: string; b: string; heat: number; regions: RegionId[] };

function makeTubeMaterial(cross: boolean, heat: number, phase: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: phase * 20 },
      uBoost: { value: 0 },
      uHeat: { value: heat },
      uColor: { value: new THREE.Color(cross ? "#8fb0c8" : "#ff7a5e") },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime; uniform float uBoost; uniform float uHeat; uniform vec3 uColor;
      varying vec2 vUv;
      void main(){
        float base = 0.06 + uHeat * 0.10;
        float p = fract(vUv.x - uTime * 0.30);
        float pulse = smoothstep(0.0, 0.05, p) * (1.0 - smoothstep(0.05, 0.16, p));
        float edge = smoothstep(0.5, 0.0, abs(vUv.y - 0.5));
        float energy = pulse * (0.5 + uHeat * 0.8 + uBoost * 2.6);
        float a = (base + energy) * (0.35 + edge * 0.65);
        vec3 col = uColor * (0.55 + energy * 2.0) + vec3(1.0) * uBoost * pulse * 0.6;
        gl_FragColor = vec4(col, a);
      }
    `,
  });
}

function Synapses({
  links,
  byId,
  selectedId,
  reduced,
  regionBurst,
}: {
  links: MindLink[];
  byId: Map<string, Placed>;
  selectedId: string | null;
  reduced: boolean;
  regionBurst: React.MutableRefObject<RegionId | "all" | null>;
}) {
  const fireTimer = useRef(0);
  const tubes = useMemo<Tube[]>(() => {
    return links
      .map((l, i) => {
        const a = byId.get(l.source), b = byId.get(l.target);
        if (!a || !b) return null;
        const mid = a.pos.clone().add(b.pos).multiplyScalar(0.5);
        mid.add(mid.clone().normalize().multiplyScalar(a.pos.distanceTo(b.pos) * 0.18));
        const curve = new THREE.QuadraticBezierCurve3(a.pos, mid, b.pos);
        const heat = (a.heat + b.heat) / 2;
        const geo = new THREE.TubeGeometry(curve, 24, 0.05 + heat * 0.03, 6, false);
        return {
          key: i, geo,
          mat: makeTubeMaterial(l.cross, heat, hash(l.source + l.target)),
          a: l.source, b: l.target, heat,
          regions: [a.region, b.region],
        };
      })
      .filter(Boolean) as Tube[];
  }, [links, byId]);

  useEffect(() => {
    if (!selectedId) return;
    for (const t of tubes) if (t.a === selectedId || t.b === selectedId) t.mat.uniforms.uBoost.value = 1.6;
  }, [selectedId, tubes]);

  useFrame((_, dt) => {
    // a level-up storm: every synapse in (or touching) the region fires at once
    if (regionBurst.current) {
      const target = regionBurst.current;
      for (const t of tubes) {
        if (target === "all" || t.regions.includes(target)) {
          t.mat.uniforms.uBoost.value = Math.max(t.mat.uniforms.uBoost.value, 1.9);
        }
      }
      regionBurst.current = null;
    }
    for (const t of tubes) {
      t.mat.uniforms.uTime.value += dt * (0.6 + t.heat * 1.3);
      t.mat.uniforms.uBoost.value *= Math.exp(-dt * 1.8);
    }
    if (reduced || tubes.length === 0) return;
    fireTimer.current -= dt;
    if (fireTimer.current <= 0) {
      fireTimer.current = 0.5 + Math.random() * 1.1;
      const weights = tubes.map((t) => 0.25 + t.heat * 1.5);
      const total = weights.reduce((a, b) => a + b, 0);
      let roll = Math.random() * total;
      for (let i = 0; i < tubes.length; i++) {
        roll -= weights[i];
        if (roll <= 0) {
          tubes[i].mat.uniforms.uBoost.value = Math.max(tubes[i].mat.uniforms.uBoost.value, 1.2);
          break;
        }
      }
    }
  });

  return (
    <>
      {tubes.map((t) => (
        <mesh key={t.key} geometry={t.geo} material={t.mat} />
      ))}
    </>
  );
}

function Node({ node, selected, onSelect }: { node: Placed; selected: boolean; onSelect: (n: Placed) => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  const displayColor = useMemo(() => node.color.clone().lerp(STALE, (1 - node.heat) * 0.65), [node.color, node.heat]);
  useFrame((state) => {
    if (!ref.current) return;
    const beat = Math.sin(state.clock.elapsedTime * (1.2 + node.heat * 2.2) + node.pos.x) * (0.04 + node.heat * 0.07);
    ref.current.scale.setScalar((selected ? 1.7 : hover ? 1.3 : 1) * (1 + beat));
  });
  const emissive = selected ? ACCENT : displayColor;
  const intensity = selected ? 3.2 : hover ? 2.2 : 0.55 + node.heat * 1.6 + node.mastery * 0.5;
  return (
    <mesh
      ref={ref}
      position={node.pos}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = "default"; }}
      onClick={(e) => { e.stopPropagation(); onSelect(node); }}
    >
      <sphereGeometry args={[node.r, 24, 24]} />
      <meshStandardMaterial color={emissive} emissive={emissive} emissiveIntensity={intensity} roughness={0.35} metalness={0.1} />
      {(hover || selected) && (
        <Html center distanceFactor={26} style={{ pointerEvents: "none" }}>
          <div
            style={{
              transform: "translateY(-2.4em)", whiteSpace: "nowrap",
              font: "600 13px -apple-system,system-ui,sans-serif", color: "#eef1f5",
              background: "rgba(11,15,22,.7)", padding: "2px 8px", borderRadius: 8,
              border: "1px solid rgba(255,255,255,.12)",
            }}
          >
            {node.label}
          </div>
        </Html>
      )}
    </mesh>
  );
}

function Rig({ target, controls }: { target: THREE.Vector3 | null; controls: React.MutableRefObject<any> }) {
  const { camera } = useThree();
  useEffect(() => {
    if (!target || !controls.current) return;
    const dir = target.clone().normalize();
    const dest = target.clone().add(dir.multiplyScalar(9)).add(new THREE.Vector3(0, 2.5, 0));
    gsap.to(camera.position, { x: dest.x, y: dest.y, z: dest.z, duration: 1.2, ease: "power3.inOut" });
    gsap.to(controls.current.target, {
      x: target.x, y: target.y, z: target.z, duration: 1.2, ease: "power3.inOut",
      onUpdate: () => controls.current?.update(),
    });
  }, [target, camera, controls]);
  return null;
}

function Scene({
  graph, placed, byId, selectedId, onSelect, reduced, flyTarget, regionBurst, glowFlare,
}: {
  graph: Graph;
  placed: Placed[];
  byId: Map<string, Placed>;
  selectedId: string | null;
  onSelect: (n: Placed) => void;
  reduced: boolean;
  flyTarget: THREE.Vector3 | null;
  regionBurst: React.MutableRefObject<RegionId | "all" | null>;
  glowFlare: React.MutableRefObject<Partial<Record<RegionId, number>>>;
}) {
  const controls = useRef<any>(null);
  return (
    <>
      <color attach="background" args={[BG]} />
      <fogExp2 attach="fog" args={[BG, 0.016]} />
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 0, 0]} intensity={2.2} distance={120} color="#9fb4d6" />
      <Stars radius={140} depth={60} count={reduced ? 800 : 2400} factor={3} saturation={0} fade speed={reduced ? 0 : 0.4} />
      <BrainShell reduced={reduced} />
      <RegionGlows stats={graph.stats} flare={glowFlare} />
      <Synapses links={graph.links} byId={byId} selectedId={selectedId} reduced={reduced} regionBurst={regionBurst} />
      {placed.map((n) => (
        <Node key={n.id} node={n} selected={n.id === selectedId} onSelect={onSelect} />
      ))}
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={9}
        maxDistance={95}
        autoRotate={!reduced}
        autoRotateSpeed={0.3}
      />
      <Rig target={flyTarget} controls={controls} />
      <EffectComposer>
        <Bloom intensity={1.35} luminanceThreshold={0.15} luminanceSmoothing={0.5} mipmapBlur />
        <Vignette eskil={false} offset={0.25} darkness={0.85} />
      </EffectComposer>
    </>
  );
}

/* ── level-up detection: compare against the levels you last saw ── */
type LevelUp = { title: string; sub: string; region: RegionId | "all" };
const LS_KEY = "abrany.mind.levels.v1";

function detectLevelUps(stats: Stats): LevelUp[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const current = {
      mind: stats.mindLevel,
      regions: Object.fromEntries(stats.regions.map((r) => [r.id, r.level])),
      clusters: Object.fromEntries(stats.clusters.map((c) => [c.clusterId, c.level])),
    };
    localStorage.setItem(LS_KEY, JSON.stringify(current));
    if (!raw) return []; // first visit is the baseline, not a party
    const prev = JSON.parse(raw) as typeof current;
    const ups: LevelUp[] = [];
    if (stats.mindLevel > (prev.mind ?? 0)) {
      ups.push({ title: `Mind Level ${stats.mindLevel}`, sub: "Your whole mind leveled up", region: "all" });
    }
    for (const r of stats.regions) {
      if (r.level > (prev.regions?.[r.id] ?? 0)) {
        ups.push({ title: `${REGION_NAME[r.id as RegionId] ?? r.name} — ${r.stat} Lv ${r.level}`, sub: r.detail, region: r.id as RegionId });
      }
    }
    for (const c of stats.clusters) {
      if (c.level > (prev.clusters?.[c.clusterId] ?? 0)) {
        ups.push({ title: `${c.cluster} — Lv ${c.level}`, sub: "Subject leveled up", region: "all" });
      }
    }
    return ups;
  } catch {
    return [];
  }
}

/* ── RPG character sheet (DOM overlay) ── */
const font = (w: number, s: number) => `${w} ${s}px -apple-system,system-ui,sans-serif`;

function XpBar({ progress, color = "#ff4326" }: { progress: number; color?: string }) {
  return (
    <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,.09)", overflow: "hidden" }}>
      <div
        style={{
          width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`, height: "100%",
          borderRadius: 99, background: color, boxShadow: `0 0 8px ${color}`, transition: "width .6s ease",
        }}
      />
    </div>
  );
}

function CharacterSheet({ stats, onClose }: { stats: Stats; onClose: () => void }) {
  return (
    <div
      style={{
        position: "absolute", left: 20, top: 64, bottom: 64, width: "min(300px, 82vw)", zIndex: 3,
        display: "flex", flexDirection: "column",
        background: "rgba(15,20,30,.84)", backdropFilter: "blur(14px)",
        border: "1px solid rgba(255,255,255,.12)", borderRadius: 18,
        boxShadow: "0 24px 60px -30px #000", color: "#eef1f5", overflow: "hidden",
      }}
    >
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ font: font(800, 30), color: "#ff4326", fontVariantNumeric: "tabular-nums" }}>{stats.mindLevel}</span>
            <span style={{ font: font(700, 11), letterSpacing: ".16em", textTransform: "uppercase", color: "#8891a0" }}>Mind level</span>
          </div>
          <button onClick={onClose} style={{ font: font(600, 11), color: "#8891a0", cursor: "pointer", background: "transparent", border: "none", padding: 4 }}>
            hide
          </button>
        </div>
        <div style={{ marginTop: 8 }}><XpBar progress={stats.mindProgress} /></div>
        <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", font: font(500, 11), color: "#8891a0" }}>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{stats.totalXp.toLocaleString()} XP</span>
          <span>
            {stats.streakDays > 0 ? <span style={{ color: "#ffb8a6", fontWeight: 700 }}>{stats.streakDays}-day streak</span> : "no streak yet — train today"}
          </span>
        </div>
      </div>
      <div style={{ overflowY: "auto", padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <p style={{ margin: "0 0 8px", font: font(700, 10), letterSpacing: ".16em", textTransform: "uppercase", color: "#8891a0" }}>Brain regions</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {stats.regions.map((r) => (
              <div key={r.id} title={r.detail}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                  <span style={{ font: font(600, 12.5) }}>{r.name}</span>
                  <span style={{ font: font(700, 11), color: "#ffb8a6", fontVariantNumeric: "tabular-nums" }}>{r.stat} Lv {r.level}</span>
                </div>
                <XpBar progress={r.progress} color="#ff7a5e" />
                <p style={{ margin: "3px 0 0", font: font(400, 10.5), color: "#6f7889" }}>{r.detail}</p>
              </div>
            ))}
          </div>
        </div>
        {stats.clusters.length > 0 && (
          <div>
            <p style={{ margin: "0 0 8px", font: font(700, 10), letterSpacing: ".16em", textTransform: "uppercase", color: "#8891a0" }}>Subjects</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {stats.clusters.slice(0, 6).map((c) => (
                <div key={c.clusterId}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                    <span style={{ font: font(600, 12), maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.cluster}</span>
                    <span style={{ font: font(700, 11), color: "#a8c8d6", fontVariantNumeric: "tabular-nums" }}>Lv {c.level}</span>
                  </div>
                  <XpBar progress={c.progress} color="#8fb0c8" />
                </div>
              ))}
            </div>
          </div>
        )}
        <p style={{ margin: 0, font: font(400, 10.5), color: "#6f7889", lineHeight: 1.5 }}>
          Every number is earned from real training. Each region of the brain lights with its own activity —
          bright is strong, fading is due for review.
        </p>
      </div>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { guide: "Study guide", chapter: "Book chapter", lesson: "Lesson" };

export default function MindScene() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Placed | null>(null);
  const [flyTarget, setFlyTarget] = useState<THREE.Vector3 | null>(null);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [toast, setToast] = useState<LevelUp | null>(null);
  const regionBurst = useRef<RegionId | "all" | null>(null);
  const glowFlare = useRef<Partial<Record<RegionId, number>>>({});
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 720) setSheetOpen(false);
    api<Graph>("/api/mind")
      .then((g) => {
        setGraph(g);
        // level-up ceremony: one toast at a time, each flaring its region
        const ups = detectLevelUps(g.stats);
        if (ups.length) {
          let i = 0;
          const show = () => {
            if (i >= ups.length) { setToast(null); return; }
            const up = ups[i++];
            setToast(up);
            regionBurst.current = up.region;
            if (up.region === "all") {
              (Object.keys(REGION_ANCHORS) as RegionId[]).forEach((r) => (glowFlare.current[r] = 1));
            } else {
              glowFlare.current[up.region] = 1.4;
            }
            setTimeout(show, 3000);
          };
          setTimeout(show, 1200); // let the brain fade in first
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your mind"));
  }, []);

  const { placed, byId } = useMemo(
    () => (graph ? layout(graph) : { placed: [], byId: new Map<string, Placed>() }),
    [graph],
  );

  const onSelect = (n: Placed) => {
    setSelected(n);
    setFlyTarget(n.pos.clone());
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, zIndex: 60 }}>
      {/* overlay chrome — a single wrapping row so narrow screens stack instead of overlap */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
        <div
          style={{
            position: "absolute", left: 14, right: 14, top: 14,
            display: "flex", flexWrap: "wrap", alignItems: "center",
            justifyContent: "space-between", gap: "10px 8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: "#141b28", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <BrainMark />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: font(800, 14), letterSpacing: ".12em", textTransform: "uppercase", color: "#eef1f5" }}>Your Mind</div>
              <div style={{ font: font(500, 11), color: "#8891a0", whiteSpace: "nowrap" }}>
                {graph ? `Level ${graph.stats.mindLevel} · ${graph.nodes.length} nodes · ${graph.stats.clusters.length} subjects` : "loading…"}
              </div>
            </div>
            {graph && !sheetOpen && (
              <button
                onClick={() => setSheetOpen(true)}
                style={{
                  pointerEvents: "auto", flexShrink: 0, font: font(700, 11.5), color: "#ffb8a6", cursor: "pointer",
                  background: "rgba(255,66,38,.12)", border: "1px solid rgba(255,66,38,.3)", padding: "6px 12px", borderRadius: 999,
                }}
              >
                Character sheet
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <Link
              href="/app/mind/about"
              title="What is this? How Your Mind works"
              style={{
                pointerEvents: "auto", font: font(600, 12.5), color: "#cfd6e0", textDecoration: "none", whiteSpace: "nowrap",
                background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", padding: "7px 14px", borderRadius: 999,
              }}
            >
              ⓘ How this works
            </Link>
            <Link
              href="/app"
              style={{
                pointerEvents: "auto", font: font(600, 12.5), color: "#cfd6e0", textDecoration: "none", whiteSpace: "nowrap",
                background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", padding: "7px 14px", borderRadius: 999,
              }}
            >
              ✕ Close
            </Link>
          </div>
        </div>
        <div
          style={{
            position: "absolute", left: "50%", bottom: 18, transform: "translateX(-50%)",
            font: font(500, 11.5), color: "#6f7889", textAlign: "center", width: "max-content", maxWidth: "90vw",
          }}
        >
          drag to orbit · scroll to zoom · click a node to fly in
        </div>
      </div>

      {/* level-up toast */}
      {toast && (
        <div
          style={{
            position: "absolute", left: "50%", top: 96, transform: "translateX(-50%)", zIndex: 5,
            display: "flex", alignItems: "center", gap: 12, width: "max-content", maxWidth: "calc(100% - 28px)",
            background: "rgba(15,20,30,.9)", backdropFilter: "blur(14px)",
            border: "1px solid rgba(255,66,38,.5)", borderRadius: 16, padding: "12px 18px",
            boxShadow: "0 0 40px rgba(255,66,38,.35), 0 24px 60px -30px #000",
            animation: "mindLevelUp .5s cubic-bezier(.2,1.4,.4,1)",
          }}
        >
          <span
            style={{
              width: 38, height: 38, borderRadius: 12, display: "grid", placeItems: "center",
              background: "linear-gradient(135deg,#ff4326,#ff8a3d)", boxShadow: "0 0 18px rgba(255,66,38,.6)",
            }}
          >
            <BrainMark />
          </span>
          <div>
            <div style={{ font: font(800, 10.5), letterSpacing: ".22em", textTransform: "uppercase", color: "#ffb8a6" }}>Level up</div>
            <div style={{ font: font(800, 15.5), color: "#fff", marginTop: 1 }}>{toast.title}</div>
            <div style={{ font: font(500, 11), color: "#8891a0", marginTop: 1 }}>{toast.sub}</div>
          </div>
          <style>{`@keyframes mindLevelUp { from { transform: translateX(-50%) translateY(-14px) scale(.92); opacity: 0; } to { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; } }`}</style>
        </div>
      )}

      {graph && sheetOpen && <CharacterSheet stats={graph.stats} onClose={() => setSheetOpen(false)} />}

      {/* detail card */}
      {selected && (
        <div
          style={{
            position: "absolute", right: 20, bottom: 20, width: "min(320px, 78vw)", zIndex: 3,
            background: "rgba(15,20,30,.86)", backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, padding: "16px 17px",
            color: "#eef1f5", boxShadow: "0 24px 60px -30px #000",
          }}
        >
          <div style={{ font: font(700, 11), letterSpacing: ".14em", textTransform: "uppercase", color: "#ff9d86" }}>
            {KIND_LABEL[selected.type]} · {REGION_NAME[selected.region]}
          </div>
          <div style={{ font: font(700, 17), margin: "6px 0 2px", lineHeight: 1.2 }}>{selected.label}</div>
          <div style={{ font: font(400, 12), color: "#8fb0c8", marginBottom: 4 }}>{selected.cluster}</div>
          <div style={{ font: font(400, 13), color: "#8891a0", margin: "2px 0 10px" }}>{selected.snippet}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ font: font(700, 11.5), color: "#ffb8a6", fontVariantNumeric: "tabular-nums" }}>{selected.xp} XP</span>
            <div style={{ flex: 1 }}><XpBar progress={selected.mastery} color="#3fbf80" /></div>
            <span style={{ font: font(600, 11), color: "#8891a0" }}>{Math.round(selected.mastery * 100)}% mastered</span>
          </div>
          {selected.heat < 0.25 && (
            <p style={{ margin: "0 0 10px", font: font(600, 11.5), color: "#ffb8a6" }}>
              Fading — you haven&apos;t trained this in a while.
            </p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              href={`/app/coach`}
              style={{
                flex: 1, textAlign: "center", textDecoration: "none",
                font: font(700, 12.5), color: "#fff", background: "#ff4326", padding: "9px 10px", borderRadius: 999,
              }}
            >
              Discuss with tutor
            </Link>
            <button
              onClick={() => setSelected(null)}
              style={{
                font: font(700, 12.5), color: "#eef1f5", cursor: "pointer",
                background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", padding: "9px 14px", borderRadius: 999,
              }}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {error && <Centered>{error}</Centered>}
      {graph && graph.nodes.length === 0 && (
        <Centered>
          Your mind is quiet for now. Generate some lessons or a study guide and they&apos;ll appear here inside your brain —
          and every focus session you log will light it up.
        </Centered>
      )}

      {graph && graph.nodes.length > 0 && (
        <Canvas
          camera={{ position: [0, 8, 62], fov: 55 }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
          style={{ position: "absolute", inset: 0 }}
        >
          <Scene
            graph={graph}
            placed={placed}
            byId={byId}
            selectedId={selected?.id ?? null}
            onSelect={onSelect}
            reduced={reduced}
            flyTarget={flyTarget}
            regionBurst={regionBurst}
            glowFlare={glowFlare}
          />
        </Canvas>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24, zIndex: 3 }}>
      <p style={{ maxWidth: 420, textAlign: "center", color: "#8891a0", font: font(400, 15) }}>{children}</p>
    </div>
  );
}

function BrainMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18, color: "#fff" }}>
      <path d="M12 3c-2.2 0-3.4 1.4-3.6 2.6C7 5.5 5.5 6.6 5.5 8.4c0 .7.2 1.2.5 1.6-.9.5-1.5 1.4-1.5 2.6 0 1 .5 1.9 1.2 2.4-.1.3-.2.7-.2 1.1 0 1.7 1.4 3 3.2 3 .3 1 1.2 1.9 2.6 1.9V3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 3c2.2 0 3.4 1.4 3.6 2.6C17 5.5 18.5 6.6 18.5 8.4c0 .7-.2 1.2-.5 1.6.9.5 1.5 1.4 1.5 2.6 0 1-.5 1.9-1.2 2.4.1.3.2.7.2 1.1 0 1.7-1.4 3-3.2 3-.3 1-1.2 1.9-2.6 1.9V3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
