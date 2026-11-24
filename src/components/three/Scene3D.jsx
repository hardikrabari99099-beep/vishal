// Heavy 3D scenes — only ever loaded lazily from Showcase3D (client-side, after idle).
import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, Float, RoundedBox } from "@react-three/drei";
import * as THREE from "three";

const C = {
  green: "#29d39a",
  deep: "#1a7a4a",
  red: "#ff5574",
  gold: "#e8b04a",
  ink: "#0d1512",
  glass: "#b8f5dc",
};

/** Smoothly tilts its children toward the mouse (window-level, canvas stays click-through). */
function MouseTilt({ pointer, strength = 0.35, children }) {
  const g = useRef();
  useFrame((_, d) => {
    if (!g.current) return;
    const k = 1 - Math.exp(-4 * Math.min(d, 0.05));
    g.current.rotation.y += (pointer.current.x * strength - g.current.rotation.y) * k;
    g.current.rotation.x += (-pointer.current.y * strength * 0.6 - g.current.rotation.x) * k;
  });
  return <group ref={g}>{children}</group>;
}

function Spin({ speed = 0.25, axis = "y", children }) {
  const g = useRef();
  useFrame((_, d) => {
    if (g.current) g.current.rotation[axis] += speed * Math.min(d, 0.05);
  });
  return <group ref={g}>{children}</group>;
}

const metal = (color, rough = 0.28) => (
  <meshStandardMaterial color={color} metalness={0.85} roughness={rough} />
);

function Coin({ position = [0, 0, 0], scale = 1, color = C.gold }) {
  return (
    <group position={position} scale={scale} rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <cylinderGeometry args={[0.6, 0.6, 0.12, 48]} />
        {metal(color, 0.22)}
      </mesh>
      <mesh position={[0, 0.065, 0]}>
        <torusGeometry args={[0.48, 0.035, 12, 48]} />
        {metal("#f6d07a", 0.18)}
      </mesh>
      <mesh position={[0, -0.065, 0]}>
        <torusGeometry args={[0.48, 0.035, 12, 48]} />
        {metal("#f6d07a", 0.18)}
      </mesh>
    </group>
  );
}

/* ---------- Home: rising 3D candlestick chart + coin ---------- */
function Candles() {
  const data = useMemo(() => {
    let p = 0;
    const out = [];
    for (let i = 0; i < 11; i++) {
      const up = i % 3 !== 1;
      const body = 0.35 + ((i * 37) % 5) * 0.12;
      p += up ? body * 0.55 : -body * 0.35;
      out.push({ x: (i - 5) * 0.42, y: p, h: body, up, wick: body + 0.35 });
    }
    return out;
  }, []);
  const g = useRef();
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.children.forEach((c, i) => {
      c.position.y = data[i].y - 1 + Math.sin(clock.elapsedTime * 1.2 + i * 0.6) * 0.05;
    });
  });
  return (
    <group>
      <group ref={g}>
        {data.map((d, i) => (
          <group key={i} position={[d.x, d.y - 1, 0]}>
            <RoundedBox args={[0.24, d.h, 0.24]} radius={0.04} smoothness={3}>
              <meshPhysicalMaterial
                color={d.up ? C.green : C.red}
                roughness={0.15}
                metalness={0.2}
                clearcoat={1}
                emissive={d.up ? C.deep : "#5a1020"}
                emissiveIntensity={0.35}
              />
            </RoundedBox>
            <mesh>
              <cylinderGeometry args={[0.02, 0.02, d.wick, 8]} />
              <meshStandardMaterial color="#d8efe4" />
            </mesh>
          </group>
        ))}
      </group>
      <Float speed={2} rotationIntensity={0.6} floatIntensity={0.8}>
        <Coin position={[1.7, 1.3, 0.6]} scale={0.7} />
      </Float>
      <mesh position={[0, -1.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6, 3]} />
        <meshStandardMaterial
          color={C.ink}
          roughness={0.4}
          metalness={0.6}
          transparent
          opacity={0.6}
        />
      </mesh>
    </group>
  );
}

/* ---------- Challenges: gold bars + target rings ---------- */
function GoldStack() {
  const bars = [
    [-0.55, -0.9, 0],
    [0.55, -0.9, 0],
    [0, -0.9, 0.62],
    [0, -0.45, 0.3],
  ];
  return (
    <group>
      {bars.map((p, i) => (
        <RoundedBox
          key={i}
          args={[1, 0.38, 0.5]}
          radius={0.05}
          position={p}
          rotation={[0, i === 3 ? 0.4 : 0, 0]}
        >
          {metal(C.gold, 0.2)}
        </RoundedBox>
      ))}
      <Float speed={1.6} floatIntensity={0.6}>
        <Spin speed={0.5} axis="z">
          <group position={[0, 0.9, 0]} rotation={[0.25, 0, 0]}>
            {[1, 0.72, 0.44].map((r, i) => (
              <mesh key={i}>
                <torusGeometry args={[r, 0.06, 16, 64]} />
                <meshStandardMaterial
                  color={i === 1 ? C.red : C.green}
                  metalness={0.4}
                  roughness={0.25}
                  emissive={i === 1 ? "#4a0f1c" : C.deep}
                  emissiveIntensity={0.4}
                />
              </mesh>
            ))}
            <mesh>
              <sphereGeometry args={[0.16, 24, 24]} />
              {metal(C.gold, 0.15)}
            </mesh>
          </group>
        </Spin>
      </Float>
    </group>
  );
}

/* ---------- Payouts: bank card + coin stack ---------- */
function PaymentCard() {
  return (
    <group>
      <Float speed={1.4} rotationIntensity={0.5} floatIntensity={0.7}>
        <group rotation={[-0.35, 0.5, 0.12]} position={[-0.3, 0.35, 0]}>
          <RoundedBox args={[2.6, 1.6, 0.06]} radius={0.12} smoothness={4}>
            <meshPhysicalMaterial color={C.deep} metalness={0.6} roughness={0.25} clearcoat={1} />
          </RoundedBox>
          <RoundedBox args={[0.42, 0.32, 0.02]} radius={0.04} position={[-0.8, 0.2, 0.04]}>
            {metal(C.gold, 0.2)}
          </RoundedBox>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[-0.75 + i * 0.5, -0.35, 0.04]}>
              <boxGeometry args={[0.38, 0.07, 0.01]} />
              <meshStandardMaterial color="#d8efe4" />
            </mesh>
          ))}
          <mesh position={[0.95, 0.5, 0.04]}>
            <circleGeometry args={[0.16, 32]} />
            <meshStandardMaterial color={C.green} emissive={C.green} emissiveIntensity={0.6} />
          </mesh>
        </group>
      </Float>
      {[0, 1, 2, 3, 4].map((i) => (
        <Coin key={i} position={[1.25, -1.15 + i * 0.13, 0.4]} scale={0.6} />
      ))}
      <Float speed={2.4} floatIntensity={1.2}>
        <Coin position={[1.5, 0.9, 0.5]} scale={0.45} />
      </Float>
    </group>
  );
}

/* ---------- Our Traders: floating video frames ---------- */
function VideoFrames() {
  const frames = [
    [-1.2, 0.3, -0.4, 0.35],
    [0.2, -0.1, 0.3, -0.1],
    [1.4, 0.55, -0.2, -0.35],
  ];
  return (
    <group>
      {frames.map(([x, y, z, ry], i) => (
        <Float key={i} speed={1.2 + i * 0.3} floatIntensity={0.8} rotationIntensity={0.25}>
          <group position={[x, y, z]} rotation={[0, ry, 0]}>
            <RoundedBox args={[1.05, 1.6, 0.05]} radius={0.08}>
              <meshPhysicalMaterial color="#13201a" metalness={0.3} roughness={0.2} clearcoat={1} />
            </RoundedBox>
            <mesh position={[0, 0, 0.03]}>
              <planeGeometry args={[0.92, 1.45]} />
              <meshStandardMaterial
                color={i === 1 ? C.deep : "#1d3a2d"}
                emissive={i === 1 ? C.deep : "#0e2219"}
                emissiveIntensity={0.6}
              />
            </mesh>
            <mesh position={[0.02, 0, 0.06]} rotation={[0, 0, -Math.PI / 2]}>
              <circleGeometry args={[0.16, 3]} />
              <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
            </mesh>
          </group>
        </Float>
      ))}
    </group>
  );
}

/* ---------- Dashboard: interactive 3D bar chart ---------- */
function BarChart() {
  const g = useRef();
  const vals = useMemo(() => Array.from({ length: 16 }, (_, i) => 0.3 + ((i * 53) % 11) / 8), []);
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.children.forEach((m, i) => {
      const h = vals[i] * (0.85 + 0.15 * Math.sin(clock.elapsedTime * 1.5 + i));
      m.scale.y = h;
      m.position.y = h / 2 - 1;
    });
  });
  return (
    <group rotation={[0.45, -0.6, 0]}>
      <group ref={g}>
        {vals.map((_, i) => (
          <mesh key={i} position={[((i % 4) - 1.5) * 0.55, 0, (Math.floor(i / 4) - 1.5) * 0.55]}>
            <boxGeometry args={[0.38, 1, 0.38]} />
            <meshPhysicalMaterial
              color={i % 5 === 2 ? C.red : C.green}
              roughness={0.2}
              clearcoat={0.8}
              emissive={i % 5 === 2 ? "#4a0f1c" : C.deep}
              emissiveIntensity={0.3}
            />
          </mesh>
        ))}
      </group>
      <mesh position={[0, -1.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.8, 2.8]} />
        <meshStandardMaterial color={C.ink} metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  );
}

/* ---------- Admin: subtle wireframe core ---------- */
function AdminCore() {
  return (
    <Spin speed={0.15}>
      <mesh>
        <icosahedronGeometry args={[1.2, 1]} />
        <meshStandardMaterial color={C.green} wireframe transparent opacity={0.35} />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.7, 0]} />
        <meshPhysicalMaterial
          color={C.deep}
          metalness={0.5}
          roughness={0.2}
          clearcoat={1}
          flatShading
        />
      </mesh>
      <mesh rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[1.6, 0.012, 8, 96]} />
        <meshBasicMaterial color={C.glass} transparent opacity={0.5} />
      </mesh>
    </Spin>
  );
}

/* ---------- Trust / verification: extruded shield ---------- */
function Shield() {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 1.1);
    s.quadraticCurveTo(0.6, 0.95, 0.95, 0.8);
    s.lineTo(0.9, 0);
    s.quadraticCurveTo(0.75, -0.75, 0, -1.15);
    s.quadraticCurveTo(-0.75, -0.75, -0.9, 0);
    s.lineTo(-0.95, 0.8);
    s.quadraticCurveTo(-0.6, 0.95, 0, 1.1);
    return new THREE.ExtrudeGeometry(s, {
      depth: 0.22,
      bevelEnabled: true,
      bevelSize: 0.05,
      bevelThickness: 0.05,
      bevelSegments: 4,
    });
  }, []);
  const check = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.45, 0.02);
    s.lineTo(-0.12, -0.32);
    s.lineTo(0.5, 0.36);
    s.lineTo(0.38, 0.47);
    s.lineTo(-0.12, -0.08);
    s.lineTo(-0.33, 0.14);
    return new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false });
  }, []);
  return (
    <Float speed={1.5} rotationIntensity={0.4} floatIntensity={0.6}>
      <group position={[0, 0, -0.1]}>
        <mesh geometry={geo}>
          <meshPhysicalMaterial color={C.deep} metalness={0.7} roughness={0.2} clearcoat={1} />
        </mesh>
        <mesh geometry={check} position={[0, 0, 0.28]}>
          <meshStandardMaterial color={C.green} emissive={C.green} emissiveIntensity={0.5} />
        </mesh>
      </group>
    </Float>
  );
}

/* ---------- Platform: phone slab with live line chart ---------- */
function PhoneChart() {
  const line = useRef();
  const pts = useMemo(
    () => Array.from({ length: 40 }, (_, i) => new THREE.Vector3(-0.42 + i * 0.0215, 0, 0.05)),
    [],
  );
  const geo = useMemo(() => new THREE.BufferGeometry().setFromPoints(pts), [pts]);
  useFrame(({ clock }) => {
    const pos = geo.attributes.position;
    for (let i = 0; i < pts.length; i++)
      pos.setY(i, -0.2 + i * 0.012 + Math.sin(i * 0.5 + clock.elapsedTime * 2) * 0.06);
    pos.needsUpdate = true;
  });
  return (
    <Float speed={1.3} rotationIntensity={0.3} floatIntensity={0.5}>
      <group rotation={[0, -0.45, 0.06]}>
        <RoundedBox args={[1.15, 2.3, 0.1]} radius={0.14} smoothness={4}>
          <meshPhysicalMaterial color="#0b0f0d" metalness={0.8} roughness={0.25} clearcoat={1} />
        </RoundedBox>
        <mesh position={[0, 0, 0.051]}>
          <planeGeometry args={[1.02, 2.12]} />
          <meshStandardMaterial color="#0f1d17" emissive="#0a1611" emissiveIntensity={0.5} />
        </mesh>
        <line ref={line} geometry={geo}>
          <lineBasicMaterial color={C.green} />
        </line>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, -0.55 - i * 0.22, 0.055]}>
            <planeGeometry args={[0.86, 0.15]} />
            <meshStandardMaterial color="#173226" />
          </mesh>
        ))}
      </group>
    </Float>
  );
}

/* ---------- Default (about, rules, faq, blog, contact…): orbiting points globe ---------- */
function PointGlobe() {
  const geo = useMemo(() => {
    const n = 900,
      arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2,
        r = Math.sqrt(1 - y * y),
        t = i * 2.39996;
      arr.set([Math.cos(t) * r * 1.3, y * 1.3, Math.sin(t) * r * 1.3], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);
  return (
    <Spin speed={0.12}>
      <points geometry={geo}>
        <pointsMaterial color={C.green} size={0.03} sizeAttenuation transparent opacity={0.85} />
      </points>
      <mesh rotation={[Math.PI / 2.2, 0.2, 0]}>
        <torusGeometry args={[1.75, 0.01, 8, 120]} />
        <meshBasicMaterial color={C.gold} transparent opacity={0.6} />
      </mesh>
    </Spin>
  );
}

const VARIANTS = {
  home: Candles,
  challenges: GoldStack,
  payouts: PaymentCard,
  traders: VideoFrames,
  dashboard: BarChart,
  admin: AdminCore,
  trust: Shield,
  platform: PhoneChart,
  default: PointGlobe,
};

export default function Scene3D({
  variant = "default",
  pointer,
  active = true,
  low = false,
  onReady,
}) {
  const Model = VARIANTS[variant] || PointGlobe;
  return (
    <Canvas
      dpr={low ? [1, 1.15] : [1, 1.5]}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 0, 5.2], fov: 40 }}
      gl={{ antialias: !low, alpha: true, powerPreference: "low-power" }}
      onCreated={() => onReady?.()}
      style={{ pointerEvents: "none" }}
    >
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 4, 5]} intensity={1.4} />
      <pointLight position={[-3, -1, 2]} intensity={12} color={C.green} />
      <Environment resolution={32}>
        <Lightformer intensity={2} position={[0, 5, 0]} scale={[10, 10, 1]} />
        <Lightformer
          intensity={1.2}
          color="#9fe8c8"
          position={[-5, 1, -1]}
          rotation-y={Math.PI / 2}
          scale={[20, 1, 1]}
        />
        <Lightformer
          intensity={0.8}
          color="#f6d07a"
          position={[5, -1, 1]}
          rotation-y={-Math.PI / 2}
          scale={[20, 1, 1]}
        />
      </Environment>
      <MouseTilt pointer={pointer} strength={variant === "admin" ? 0.15 : 0.35}>
        <Model />
      </MouseTilt>
    </Canvas>
  );
}
