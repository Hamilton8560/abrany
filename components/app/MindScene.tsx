"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, Html } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import gsap from "gsap";
import { api } from "@/lib/client";

type MindNode = {
  id: string;
  label: string;
  type: "lesson" | "guide" | "chapter";
  cluster: string;
  clusterId: string;
  kind?: string;
  snippet: string;
};
type MindLink = { source: string; target: string; cross: boolean };
type Graph = { nodes: MindNode[]; links: MindLink[] };

const ACCENT = new THREE.Color("#ff4326");
const TINTS = ["#e7c9a6", "#a8c8d6", "#a9d2b4", "#c9b6e0", "#e0b6a2", "#b6c4e0"].map((c) => new THREE.Color(c));
const BG = "#0b0f16";

/* deterministic pseudo-random from a string */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619;
  return ((h >>> 0) % 100000) / 100000;
}

type Placed = MindNode & { pos: THREE.Vector3; color: THREE.Color; r: number };

function layout(graph: Graph): { placed: Placed[]; byId: Map<string, Placed> } {
  const clusters = [...new Set(graph.nodes.map((n) => n.clusterId))];
  const centers = new Map<string, THREE.Vector3>();
  const golden = Math.PI * (3 - Math.sqrt(5));
  clusters.forEach((cid, i) => {
    // even-ish spread on a sphere shell
    const y = clusters.length === 1 ? 0 : 1 - (i / (clusters.length - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    centers.set(cid, new THREE.Vector3(Math.cos(theta) * rad, y * 0.7, Math.sin(theta) * rad).multiplyScalar(26));
  });
  const idx = new Map<string, number>();
  const placed = graph.nodes.map((n) => {
    const c = centers.get(n.clusterId)!;
    const k = (idx.get(n.clusterId) ?? 0) + 1;
    idx.set(n.clusterId, k);
    const h1 = hash(n.id), h2 = hash(n.id + "y"), h3 = hash(n.id + "z");
    const spread = 5 + k * 1.4;
    const pos = c
      .clone()
      .add(new THREE.Vector3((h1 - 0.5) * spread, (h2 - 0.5) * spread, (h3 - 0.5) * spread));
    const color = TINTS[Math.abs(hashInt(n.clusterId)) % TINTS.length];
    const r = n.type === "guide" ? 0.9 : n.type === "chapter" ? 0.8 : 0.62;
    return { ...n, pos, color, r };
  });
  const byId = new Map(placed.map((p) => [p.id, p]));
  return { placed, byId };
}
function hashInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/* ── pulsing synapse shader (one shared material, animates all tubes) ── */
function makeSynapseMaterial(cross: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(cross ? "#8fb0c8" : "#ff7a5e") } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        float base = 0.10;
        float p = fract(vUv.x * 1.0 - uTime * 0.35);
        float pulse = smoothstep(0.0, 0.06, p) * (1.0 - smoothstep(0.06, 0.16, p));
        float edge = smoothstep(0.5, 0.0, abs(vUv.y - 0.5)); // brighter core of tube
        float a = (base + pulse * 1.3) * (0.35 + edge * 0.65);
        gl_FragColor = vec4(uColor * (0.6 + pulse * 2.2), a);
      }
    `,
  });
}

function Synapses({ links, byId }: { links: MindLink[]; byId: Map<string, Placed> }) {
  const matNormal = useMemo(() => makeSynapseMaterial(false), []);
  const matCross = useMemo(() => makeSynapseMaterial(true), []);
  useFrame((_, dt) => {
    matNormal.uniforms.uTime.value += dt;
    matCross.uniforms.uTime.value += dt;
  });
  const tubes = useMemo(() => {
    return links
      .map((l, i) => {
        const a = byId.get(l.source), b = byId.get(l.target);
        if (!a || !b) return null;
        const mid = a.pos.clone().add(b.pos).multiplyScalar(0.5);
        mid.add(mid.clone().normalize().multiplyScalar(a.pos.distanceTo(b.pos) * 0.18)); // arc outward
        const curve = new THREE.QuadraticBezierCurve3(a.pos, mid, b.pos);
        const geo = new THREE.TubeGeometry(curve, 24, 0.055, 6, false);
        return { key: i, geo, mat: l.cross ? matCross : matNormal };
      })
      .filter(Boolean) as { key: number; geo: THREE.TubeGeometry; mat: THREE.ShaderMaterial }[];
  }, [links, byId, matNormal, matCross]);
  return (
    <>
      {tubes.map((t) => (
        <mesh key={t.key} geometry={t.geo} material={t.mat} />
      ))}
    </>
  );
}

function Node({
  node,
  selected,
  onSelect,
}: {
  node: Placed;
  selected: boolean;
  onSelect: (n: Placed) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  useFrame((state) => {
    if (!ref.current) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 1.6 + node.pos.x) * 0.06;
    const s = (selected ? 1.7 : hover ? 1.3 : 1) * pulse;
    ref.current.scale.setScalar(s);
  });
  const emissive = selected ? ACCENT : node.color;
  return (
    <mesh
      ref={ref}
      position={node.pos}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "default";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node);
      }}
    >
      <sphereGeometry args={[node.r, 24, 24]} />
      <meshStandardMaterial
        color={emissive}
        emissive={emissive}
        emissiveIntensity={selected ? 3.2 : hover ? 2.2 : 1.5}
        roughness={0.35}
        metalness={0.1}
      />
      {(hover || selected) && (
        <Html center distanceFactor={26} style={{ pointerEvents: "none" }}>
          <div
            style={{
              transform: "translateY(-2.4em)",
              whiteSpace: "nowrap",
              font: "600 13px -apple-system,system-ui,sans-serif",
              color: "#eef1f5",
              background: "rgba(11,15,22,.7)",
              padding: "2px 8px",
              borderRadius: 8,
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
      x: target.x,
      y: target.y,
      z: target.z,
      duration: 1.2,
      ease: "power3.inOut",
      onUpdate: () => controls.current?.update(),
    });
  }, [target, camera, controls]);
  return null;
}

function Scene({
  graph,
  selectedId,
  onSelect,
  reduced,
  flyTarget,
}: {
  graph: Graph;
  selectedId: string | null;
  onSelect: (n: Placed) => void;
  reduced: boolean;
  flyTarget: THREE.Vector3 | null;
}) {
  const { placed, byId } = useMemo(() => layout(graph), [graph]);
  const controls = useRef<any>(null);
  return (
    <>
      <color attach="background" args={[BG]} />
      <fogExp2 attach="fog" args={[BG, 0.018]} />
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 0, 0]} intensity={2.2} distance={120} color="#9fb4d6" />
      <Stars radius={120} depth={60} count={reduced ? 800 : 2600} factor={3} saturation={0} fade speed={reduced ? 0 : 0.5} />
      <Synapses links={graph.links} byId={byId} />
      {placed.map((n) => (
        <Node key={n.id} node={n} selected={n.id === selectedId} onSelect={onSelect} />
      ))}
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={10}
        maxDistance={90}
        autoRotate={!reduced}
        autoRotateSpeed={0.35}
      />
      <Rig target={flyTarget} controls={controls} />
      <EffectComposer>
        <Bloom intensity={1.35} luminanceThreshold={0.15} luminanceSmoothing={0.5} mipmapBlur />
        <Vignette eskil={false} offset={0.25} darkness={0.85} />
      </EffectComposer>
    </>
  );
}

const KIND_LABEL: Record<string, string> = { guide: "Study guide", chapter: "Book chapter", lesson: "Lesson" };

export default function MindScene() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Placed | null>(null);
  const [flyTarget, setFlyTarget] = useState<THREE.Vector3 | null>(null);
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    api<Graph>("/api/mind")
      .then(setGraph)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your mind"));
  }, []);

  const onSelect = (n: Placed) => {
    setSelected(n);
    setFlyTarget(n.pos.clone());
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, zIndex: 60 }}>
      {/* overlay chrome */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
        <div style={{ position: "absolute", left: 20, top: 18, display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 30, height: 30, borderRadius: 9, background: "#141b28", display: "grid", placeItems: "center",
            }}
          >
            <BrainMark />
          </span>
          <div>
            <div style={{ font: "800 14px -apple-system,system-ui", letterSpacing: ".12em", textTransform: "uppercase", color: "#eef1f5" }}>
              Your Mind
            </div>
            <div style={{ font: "500 11px -apple-system,system-ui", color: "#8891a0" }}>
              {graph ? `${graph.nodes.length} nodes · ${new Set(graph.nodes.map((n) => n.clusterId)).size} subjects` : "loading…"}
            </div>
          </div>
        </div>
        <Link
          href="/app"
          style={{
            position: "absolute", right: 20, top: 18, pointerEvents: "auto",
            font: "600 12.5px -apple-system,system-ui", color: "#cfd6e0", textDecoration: "none",
            background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)",
            padding: "7px 14px", borderRadius: 999,
          }}
        >
          ✕ Close
        </Link>
        <div
          style={{
            position: "absolute", left: "50%", bottom: 18, transform: "translateX(-50%)",
            font: "500 11.5px -apple-system,system-ui", color: "#6f7889", textAlign: "center",
          }}
        >
          drag to orbit · scroll to zoom · click a node to fly in
        </div>
      </div>

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
          <div style={{ font: "700 11px -apple-system,system-ui", letterSpacing: ".14em", textTransform: "uppercase", color: "#ff9d86" }}>
            {KIND_LABEL[selected.type]} · {selected.cluster}
          </div>
          <div style={{ font: "700 17px -apple-system,system-ui", margin: "6px 0 2px", lineHeight: 1.2 }}>{selected.label}</div>
          <div style={{ font: "400 13px -apple-system,system-ui", color: "#8891a0", margin: "4px 0 14px" }}>{selected.snippet}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              href={`/app/coach`}
              style={{
                flex: 1, textAlign: "center", textDecoration: "none",
                font: "700 12.5px -apple-system,system-ui", color: "#fff", background: "#ff4326",
                padding: "9px 10px", borderRadius: 999,
              }}
            >
              Discuss with tutor
            </Link>
            <button
              onClick={() => { setSelected(null); }}
              style={{
                font: "700 12.5px -apple-system,system-ui", color: "#eef1f5", cursor: "pointer",
                background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)",
                padding: "9px 14px", borderRadius: 999,
              }}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* empty / error states */}
      {error && <Centered>{error}</Centered>}
      {graph && graph.nodes.length === 0 && (
        <Centered>
          Your mind is quiet for now. Generate some lessons or a study guide and they&apos;ll appear here as a constellation.
        </Centered>
      )}

      {graph && graph.nodes.length > 0 && (
        <Canvas
          camera={{ position: [0, 6, 60], fov: 55 }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
          style={{ position: "absolute", inset: 0 }}
        >
          <Scene graph={graph} selectedId={selected?.id ?? null} onSelect={onSelect} reduced={reduced} flyTarget={flyTarget} />
        </Canvas>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24, zIndex: 3,
      }}
    >
      <p style={{ maxWidth: 420, textAlign: "center", color: "#8891a0", font: "400 15px -apple-system,system-ui" }}>{children}</p>
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
