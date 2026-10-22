import { RoundedBox, useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CycleMachine, indexSeconds, type CycleState } from '../../twin/cycle';
import { useTwin } from '../../twin/store';
import { cavitation, cycleSeconds } from '../../twin/whatif';
import type { PartMaterials, ShellMaterials } from '../materials';
import { Monitored } from './Monitored';

/** Eixo do berço (A) e centro da mesa (B) no referencial da máquina */
export const TRUNNION_AXIS = new THREE.Vector3(0, 1.0, 1.3);
/** z da ponta da ferramenta com o spindle recuado */
const TIP_RETRACTED = 0.66;
const HEAD_Z = -0.01;

interface Shared {
  cycle: CycleState;
  tip: THREE.Vector3;
  carriage: THREE.Vector2;
  spin: number;
}

function useMachining() {
  const machine = useMemo(() => new CycleMachine(), []);
  const shared = useRef<Shared>({
    cycle: machine.advance(0, 7, 2),
    tip: new THREE.Vector3(0, 1.2, TIP_RETRACTED),
    carriage: new THREE.Vector2(0, 1.2),
    spin: 0,
  });
  const lastKey = useRef('');
  const setCycle = useTwin((s) => s.setCycle);

  // prioridade -1: calcula o ciclo antes dos componentes que o leem
  useFrame((_, dt) => {
    const st = useTwin.getState();
    const cutS = cycleSeconds(st.params.spindle);
    const idxS = indexSeconds(st.params.table.speed);
    const c = machine.advance(dt, cutS, idxS);
    const sh = shared.current;
    sh.cycle = c;
    // posição do carro (X/Y) do spindle
    const tiltFrac = Math.min(1, Math.abs(c.A) / (Math.PI / 2));
    const yBase = 1.19 - 0.19 * tiltFrac;
    sh.carriage.set(c.tx * 0.07, yBase + c.ty * (c.face === 4 ? 0.05 : 0.055));
    const travel = c.face === 4 ? 0.315 : c.face % 2 === 0 ? 0.53 : 0.5;
    sh.tip.set(sh.carriage.x, sh.carriage.y, TIP_RETRACTED + travel * c.z);
    sh.spin += dt * st.live.spindle.shaftRpm * 0.0032;
    const key = `${c.face}|${c.phase}|${c.parts}`;
    if (key !== lastKey.current) {
      lastKey.current = key;
      setCycle({ face: c.face, phase: c.phase, parts: c.parts, progress: c.progress });
    }
  }, -1);
  return shared;
}

/* --------------------------------------------------------------- spindle */

function Spindle({
  shared,
  pm,
  sm,
}: {
  shared: React.MutableRefObject<Shared>;
  pm: PartMaterials;
  sm: ShellMaterials;
}) {
  const carriage = useRef<THREE.Group>(null);
  const quill = useRef<THREE.Group>(null);
  const rotor = useRef<THREE.Group>(null);
  const motorRotor = useRef<THREE.Mesh>(null);
  const ram = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const sh = shared.current;
    if (carriage.current) carriage.current.position.set(sh.carriage.x, sh.carriage.y, HEAD_Z);
    const ext = sh.tip.z - TIP_RETRACTED;
    if (quill.current) quill.current.position.z = ext;
    if (ram.current) {
      ram.current.scale.y = Math.max(0.01, ext + 0.02);
      ram.current.position.z = 0.24 + ext / 2;
    }
    if (rotor.current) rotor.current.rotation.z = sh.spin;
    if (motorRotor.current) motorRotor.current.rotation.z = sh.spin;
  });

  return (
    <Monitored id="spindle" haloAt={[0, 1.2, 0.62]} haloRadius={0.2} haloAxis="z">
      {/* guias lineares e fuso na frente da coluna (internos) */}
      {[0.72, 1.98].map((y) => (
        <mesh key={y} position={[0.1, y, -0.205]} material={pm.steel} userData={{ noTint: true }}>
          <boxGeometry args={[1.2, 0.045, 0.03]} />
        </mesh>
      ))}
      <mesh
        position={[0.1, 1.9, -0.2]}
        rotation={[0, 0, Math.PI / 2]}
        material={pm.darkSteel}
        userData={{ noTint: true }}
      >
        <cylinderGeometry args={[0.018, 0.018, 1.15, 12]} />
      </mesh>
      <group ref={carriage} position={[0, 1.2, HEAD_Z]}>
        {/* cabeçote (carcaça → transparente no Raio-X) */}
        <mesh material={sm.darkGrey} userData={{ noTint: true }} castShadow>
          <boxGeometry args={[0.44, 0.44, 0.34]} />
        </mesh>
        {/* carro vertical */}
        <mesh position={[0, 0, -0.19]} material={pm.steel} userData={{ noTint: true }}>
          <boxGeometry args={[0.52, 0.62, 0.04]} />
        </mesh>
        {/* motor do spindle: estator com enrolamentos + rotor */}
        <group rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.02]}>
          <mesh material={pm.darkSteel}>
            <cylinderGeometry args={[0.15, 0.15, 0.24, 32, 1, true]} />
          </mesh>
          {[-0.09, -0.03, 0.03, 0.09].map((yy) => (
            <mesh
              key={yy}
              position={[0, yy, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              material={pm.copper}
            >
              <torusGeometry args={[0.125, 0.018, 8, 32]} />
            </mesh>
          ))}
          <mesh ref={motorRotor} material={pm.steel}>
            <cylinderGeometry args={[0.07, 0.07, 0.3, 16]} />
          </mesh>
        </group>
        {/* aríete telescópico (fole) */}
        <mesh ref={ram} position={[0, 0, 0.24]} rotation={[Math.PI / 2, 0, 0]} material={pm.black}>
          <cylinderGeometry args={[0.1, 0.1, 1, 24]} />
        </mesh>
        <group ref={quill}>
          {/* corpo do spindle (fundido branco) */}
          <mesh
            position={[0, 0, 0.3]}
            rotation={[Math.PI / 2, 0, 0]}
            material={pm.castWhite}
            castShadow
          >
            <cylinderGeometry args={[0.125, 0.135, 0.26, 32]} />
          </mesh>
          <mesh
            position={[0, 0, 0.44]}
            rotation={[Math.PI / 2, 0, 0]}
            material={pm.steel}
            castShadow
          >
            <cylinderGeometry args={[0.09, 0.11, 0.05, 32]} />
          </mesh>
          {/* bicos de refrigeração */}
          {[-1, 1].map((s) => (
            <mesh
              key={s}
              position={[s * 0.08, 0.09, 0.5]}
              rotation={[Math.PI / 2 - 0.35, 0, -s * 0.5]}
              material={pm.brass}
            >
              <cylinderGeometry args={[0.008, 0.01, 0.1, 8]} />
            </mesh>
          ))}
          {/* parte girante: nariz, porta-ferramenta HSK e fresa */}
          <group ref={rotor}>
            <mesh position={[0, 0, 0.48]} rotation={[Math.PI / 2, 0, 0]} material={pm.steel}>
              <cylinderGeometry args={[0.075, 0.075, 0.03, 24]} />
            </mesh>
            <mesh position={[0, 0, 0.495]} rotation={[0, 0, 0]} material={pm.darkSteel}>
              <boxGeometry args={[0.12, 0.02, 0.012]} />
            </mesh>
            <mesh position={[0, 0, 0.53]} rotation={[-Math.PI / 2, 0, 0]} material={pm.steel}>
              <cylinderGeometry args={[0.022, 0.045, 0.07, 24]} />
            </mesh>
            <mesh position={[0, 0, 0.585]} rotation={[Math.PI / 2, 0, 0]} material={pm.darkSteel}>
              <cylinderGeometry args={[0.03, 0.03, 0.04, 16]} />
            </mesh>
            {[0, 1, 2].map((k) => (
              <mesh
                key={k}
                position={[0, 0, 0.635]}
                rotation={[0, 0, (k * Math.PI) / 3]}
                material={pm.darkSteel}
              >
                <boxGeometry args={[0.03, 0.007, 0.07]} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </Monitored>
  );
}

/* --------------------------------------------------------------- mesa */

function Workpiece() {
  const [face, housing] = useTexture(['/img/abs-face.jpg', '/img/abs-housing.jpg']);
  face.colorSpace = THREE.SRGBColorSpace;
  housing.colorSpace = THREE.SRGBColorSpace;
  const mats = useMemo(() => {
    const alu = new THREE.MeshStandardMaterial({
      color: '#cfd3d8',
      metalness: 0.7,
      roughness: 0.3,
    });
    const photo = new THREE.MeshStandardMaterial({ map: face, metalness: 0.35, roughness: 0.42 });
    // ordem das faces: +x, −x, +y, −y, +z, −z (a −z é a face gravada voltada ao spindle)
    return {
      block: [alu, alu, alu, alu, photo, photo],
      housingFront: new THREE.MeshStandardMaterial({ map: housing, roughness: 0.6 }),
      black: new THREE.MeshStandardMaterial({ color: '#1f2226', roughness: 0.55 }),
    };
  }, [face, housing]);
  return (
    <group position={[0, 0.07, 0]} userData={{ noTint: true }}>
      <mesh
        position={[0, 0.05, 0]}
        material={mats.block}
        castShadow
        userData={{ noTint: true }}
        rotation={[0, Math.PI, 0]}
      >
        <boxGeometry args={[0.28, 0.1, 0.17]} />
      </mesh>
      <RoundedBox
        args={[0.27, 0.13, 0.155]}
        radius={0.02}
        smoothness={3}
        position={[0, 0.165, 0.005]}
        material={mats.black}
        castShadow
        userData={{ noTint: true }}
      />
      {[-0.08, 0.08].map((x) => (
        <mesh
          key={x}
          position={[x, 0.17, -0.085]}
          material={mats.black}
          userData={{ noTint: true }}
        >
          <cylinderGeometry args={[0.022, 0.022, 0.13, 20]} />
        </mesh>
      ))}
      {/* furos roscados da face lateral */}
      {[-0.1, -0.035, 0.035, 0.1].map((x) => (
        <mesh
          key={x}
          position={[x, 0.065, 0.086]}
          rotation={[Math.PI / 2, 0, 0]}
          userData={{ noTint: true }}
        >
          <cylinderGeometry args={[0.016, 0.016, 0.004, 20]} />
          <meshStandardMaterial color="#6f757b" metalness={0.8} roughness={0.25} />
        </mesh>
      ))}
    </group>
  );
}

function Trunnion({ shared, pm }: { shared: React.MutableRefObject<Shared>; pm: PartMaterials }) {
  const cradle = useRef<THREE.Group>(null);
  const table = useRef<THREE.Group>(null);
  const torque = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const c = shared.current.cycle;
    if (cradle.current) cradle.current.rotation.x = c.A;
    if (table.current) table.current.rotation.y = c.B;
    if (torque.current) torque.current.rotation.x = c.A * 3;
  });

  const bowl = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.34, 0.34, 0.66, 40, 1, true, Math.PI, Math.PI);
    g.rotateZ(Math.PI / 2);
    return g;
  }, []);
  const cap = useMemo(() => {
    const g = new THREE.CircleGeometry(0.34, 40, Math.PI, Math.PI);
    return g;
  }, []);

  const tSlots = Array.from({ length: 6 }, (_, i) => (i * Math.PI) / 6);
  const holes = useMemo(() => {
    const out: [number, number][] = [];
    for (let r = 0.08; r < 0.26; r += 0.06)
      for (let a = 0; a < Math.PI * 2; a += Math.PI / (r * 18))
        out.push([Math.cos(a) * r, Math.sin(a) * r]);
    return out;
  }, []);

  return (
    <Monitored
      id="table"
      haloAt={[TRUNNION_AXIS.x, TRUNNION_AXIS.y + 0.02, TRUNNION_AXIS.z]}
      haloRadius={0.36}
    >
      {/* mancais laterais do berço */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.43, 0, TRUNNION_AXIS.z]}>
          <RoundedBox
            args={[0.14, 0.4, 0.42]}
            radius={0.03}
            smoothness={2}
            position={[0, 0.83, 0]}
            material={pm.castWhite}
            castShadow
            receiveShadow
          />
          <mesh
            position={[0, TRUNNION_AXIS.y, 0]}
            rotation={[0, 0, Math.PI / 2]}
            material={pm.castWhite}
            castShadow
          >
            <cylinderGeometry args={[0.2, 0.2, 0.14, 36]} />
          </mesh>
        </group>
      ))}
      {/* motor torque do eixo A (interno, visível no Raio-X) */}
      <mesh
        ref={torque}
        position={[-0.53, TRUNNION_AXIS.y, TRUNNION_AXIS.z]}
        rotation={[0, 0, Math.PI / 2]}
        material={pm.motor}
      >
        <cylinderGeometry args={[0.16, 0.16, 0.08, 32]} />
      </mesh>
      <mesh
        position={[-0.53, TRUNNION_AXIS.y, TRUNNION_AXIS.z]}
        rotation={[0, Math.PI / 2, 0]}
        material={pm.copper}
      >
        <torusGeometry args={[0.12, 0.02, 8, 32]} />
      </mesh>
      <group ref={cradle} position={TRUNNION_AXIS.toArray()}>
        {/* berço (cuba) */}
        <mesh geometry={bowl} castShadow receiveShadow>
          <meshStandardMaterial
            attach="material"
            color="#ecedec"
            roughness={0.5}
            metalness={0.05}
            side={THREE.DoubleSide}
          />
        </mesh>
        {[-0.33, 0.33].map((x) => (
          <mesh
            key={x}
            geometry={cap}
            position={[x, 0, 0]}
            rotation={[0, x < 0 ? -Math.PI / 2 : Math.PI / 2, 0]}
          >
            <meshStandardMaterial color="#e6e8e7" roughness={0.5} side={THREE.DoubleSide} />
          </mesh>
        ))}
        {/* bordas reforçadas da cuba */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0, 0, s * 0.34]} rotation={[0, 0, 0]} material={pm.castWhite}>
            <boxGeometry args={[0.66, 0.03, 0.03]} />
          </mesh>
        ))}
        {/* mesa giratória (eixo B) */}
        <group ref={table} position={[0, 0.0, 0]}>
          <mesh position={[0, 0.02, 0]} material={pm.steel} castShadow receiveShadow>
            <cylinderGeometry args={[0.28, 0.28, 0.05, 64]} />
          </mesh>
          <mesh position={[0, -0.03, 0]} material={pm.darkSteel}>
            <cylinderGeometry args={[0.29, 0.29, 0.06, 64]} />
          </mesh>
          {tSlots.map((a) => (
            <mesh key={a} position={[0, 0.046, 0]} rotation={[0, a, 0]} material={pm.darkSteel}>
              <boxGeometry args={[0.54, 0.004, 0.014]} />
            </mesh>
          ))}
          {holes.map(([x, z], i) => (
            <mesh key={i} position={[x, 0.046, z]} material={pm.black}>
              <cylinderGeometry args={[0.006, 0.006, 0.004, 8]} />
            </mesh>
          ))}
          {/* dispositivo de fixação */}
          <mesh position={[0, 0.058, 0]} material={pm.darkSteel} castShadow>
            <boxGeometry args={[0.34, 0.025, 0.24]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.155, 0.1, 0]} material={pm.darkSteel}>
              <boxGeometry args={[0.02, 0.07, 0.2]} />
            </mesh>
          ))}
          <Workpiece />
        </group>
      </group>
    </Monitored>
  );
}

/* --------------------------------------------------------------- cavacos e refrigerante */

const tmp = new THREE.Object3D();

function Particles({ shared }: { shared: React.MutableRefObject<Shared> }) {
  const CHIPS = 110;
  const DROPS = 220;
  const chips = useRef<THREE.InstancedMesh>(null);
  const drops = useRef<THREE.InstancedMesh>(null);
  const chipState = useMemo(
    () => ({
      p: new Float32Array(CHIPS * 3),
      v: new Float32Array(CHIPS * 3),
      life: new Float32Array(CHIPS),
      next: 0,
      acc: 0,
    }),
    [],
  );
  const dropState = useMemo(
    () => ({
      p: new Float32Array(DROPS * 3),
      v: new Float32Array(DROPS * 3),
      life: new Float32Array(DROPS),
      next: 0,
      acc: 0,
    }),
    [],
  );
  const chipMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#e4e7ea',
        metalness: 0.5,
        roughness: 0.35,
        emissive: '#6d7378',
        flatShading: true,
      }),
    [],
  );
  const dropMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#cfe8ff',
        transparent: true,
        opacity: 0.75,
        roughness: 0.1,
        metalness: 0,
      }),
    [],
  );

  useFrame(({ clock }, dt) => {
    const st = useTwin.getState();
    const sh = shared.current;
    const c = sh.cycle;
    const p = st.params;
    const t = clock.elapsedTime;
    // cavacos: taxa proporcional à remoção de material; cor escurece com desgaste da ferramenta
    const rate = c.cutting ? 60 * (p.spindle.feed / 2400) * (p.spindle.depth / 1.5) : 0;
    chipMat.color.setRGB(
      0.85 - 0.35 * (p.spindle.toolWear / 100),
      0.86 - 0.3 * (p.spindle.toolWear / 100),
      0.9 - 0.05 * (p.spindle.toolWear / 100),
    );
    chipState.acc += rate * dt;
    while (chipState.acc >= 1) {
      chipState.acc -= 1;
      const i = chipState.next;
      chipState.next = (i + 1) % CHIPS;
      chipState.p.set([sh.tip.x, sh.tip.y, sh.tip.z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const sp = 0.3 + Math.random() * 0.7;
      chipState.v.set(
        [Math.cos(a) * sp, 0.3 + Math.random() * 0.9, -0.15 - Math.random() * 0.6],
        i * 3,
      );
      chipState.life[i] = 1.1;
    }
    // refrigerante: vazão da Bomba 1 (frequência e pressão); cavitação → jato intermitente
    const cav = cavitation(p.bomba1.tankLevel);
    const sputter = cav > 0 ? (Math.sin(t * 11) > 0.1 - cav ? 0.15 : 1) * (1 - 0.6 * cav) : 1;
    const flow = (p.bomba1.frequency / 50) * Math.sqrt(p.bomba1.pressure / 4) * sputter;
    const spraying = c.phase === 'cut' || c.phase === 'approach';
    dropState.acc += spraying ? 160 * flow * dt : 0;
    const speed = 2.2 * Math.sqrt(p.bomba1.pressure / 4) * (0.8 + 0.3 * (p.bomba3.pressure / 60));
    while (dropState.acc >= 1) {
      dropState.acc -= 1;
      const i = dropState.next;
      dropState.next = (i + 1) % DROPS;
      const s = Math.random() > 0.5 ? 1 : -1;
      const nx = sh.tip.x + s * 0.08;
      const ny = sh.tip.y + 0.09;
      const nz = sh.tip.z - 0.14;
      dropState.p.set([nx, ny, nz], i * 3);
      const dx = sh.tip.x - nx;
      const dy = sh.tip.y - ny;
      const dz = sh.tip.z + 0.02 - nz;
      const len = Math.hypot(dx, dy, dz);
      dropState.v.set(
        [
          (dx / len) * speed + (Math.random() - 0.5) * 0.3,
          (dy / len) * speed + (Math.random() - 0.5) * 0.3,
          (dz / len) * speed,
        ],
        i * 3,
      );
      dropState.life[i] = 0.55;
    }
    const step = (
      s: typeof chipState,
      n: number,
      mesh: THREE.InstancedMesh | null,
      size: number,
      drag: number,
    ) => {
      if (!mesh) return;
      for (let i = 0; i < n; i += 1) {
        if (s.life[i] > 0) {
          s.life[i] -= dt;
          s.v[i * 3 + 1] -= 9.8 * dt * drag;
          s.p[i * 3] += s.v[i * 3] * dt;
          s.p[i * 3 + 1] += s.v[i * 3 + 1] * dt;
          s.p[i * 3 + 2] += s.v[i * 3 + 2] * dt;
          // confinado à área de usinagem (paredes internas)
          if (s.p[i * 3] < -0.5 || s.p[i * 3] > 0.75) {
            s.p[i * 3] = Math.max(-0.5, Math.min(0.75, s.p[i * 3]));
            s.v[i * 3] *= -0.4;
          }
          if (s.p[i * 3 + 2] < 0.28 || s.p[i * 3 + 2] > 1.7) {
            s.p[i * 3 + 2] = Math.max(0.28, Math.min(1.7, s.p[i * 3 + 2]));
            s.v[i * 3 + 2] *= -0.4;
          }
          if (s.p[i * 3 + 1] < 0.66) {
            s.p[i * 3 + 1] = 0.66;
            s.v[i * 3] *= 0.3;
            s.v[i * 3 + 1] = 0;
            s.v[i * 3 + 2] *= 0.3;
          }
          tmp.position.set(s.p[i * 3], s.p[i * 3 + 1], s.p[i * 3 + 2]);
          tmp.rotation.set(s.life[i] * 9, s.life[i] * 7, 0);
          tmp.scale.setScalar(size * Math.min(1, s.life[i] * 3));
        } else {
          tmp.scale.setScalar(0);
        }
        tmp.updateMatrix();
        mesh.setMatrixAt(i, tmp.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    step(chipState, CHIPS, chips.current, 1, 1);
    step(dropState, DROPS, drops.current, 1, 0.6);
  });

  return (
    <group userData={{ noTint: true }}>
      <instancedMesh
        ref={chips}
        args={[undefined, undefined, CHIPS]}
        material={chipMat}
        frustumCulled={false}
        raycast={() => null}
      >
        <tetrahedronGeometry args={[0.0065]} />
      </instancedMesh>
      <instancedMesh
        ref={drops}
        args={[undefined, undefined, DROPS]}
        material={dropMat}
        frustumCulled={false}
        raycast={() => null}
      >
        <sphereGeometry args={[0.0055, 6, 4]} />
      </instancedMesh>
    </group>
  );
}

/* --------------------------------------------------------------- magazine */

function ToolMagazine({
  shared,
  pm,
}: {
  shared: React.MutableRefObject<Shared>;
  pm: PartMaterials;
}) {
  const rows = useRef<THREE.Group>(null);
  const N = 12;
  const PITCH = 0.105;
  const offset = useRef(0);
  useFrame((_, dt) => {
    const c = shared.current.cycle;
    if (c.phase === 'index' || c.phase === 'tilt') offset.current += dt * 0.12;
    rows.current?.children.forEach((row, r) => {
      row.children.forEach((tool, i) => {
        const z =
          (((i * PITCH + offset.current * (r % 2 ? -1 : 1)) % (N * PITCH)) + N * PITCH) %
          (N * PITCH);
        tool.position.z = -1.68 + z;
      });
    });
  });
  const lengths = [0.07, 0.11, 0.09, 0.13, 0.06, 0.1, 0.08, 0.12, 0.09, 0.07, 0.11, 0.1];
  return (
    <group>
      {[1.6, 1.86].map((y) => (
        <mesh key={y} position={[0.66, y, -1.06]} material={pm.darkSteel}>
          <boxGeometry args={[0.04, 0.03, 1.32]} />
        </mesh>
      ))}
      <group ref={rows}>
        {[1.62, 1.88].map((y) => (
          <group key={y}>
            {lengths.map((len, i) => (
              <group key={i} position={[0.72, y, -1.68 + i * PITCH]}>
                <mesh rotation={[0, 0, -Math.PI / 2]} material={pm.steel}>
                  <cylinderGeometry args={[0.018, 0.034, 0.06, 16]} />
                </mesh>
                <mesh
                  position={[0.03 + len / 2, 0, 0]}
                  rotation={[0, 0, -Math.PI / 2]}
                  material={pm.darkSteel}
                >
                  <cylinderGeometry args={[0.012, 0.014, len, 10]} />
                </mesh>
              </group>
            ))}
          </group>
        ))}
      </group>
    </group>
  );
}

export default function MachiningCell({ pm, sm }: { pm: PartMaterials; sm: ShellMaterials }) {
  const shared = useMachining();
  return (
    <group name="machining-cell">
      <Spindle shared={shared} pm={pm} sm={sm} />
      <Trunnion shared={shared} pm={pm} />
      <Particles shared={shared} />
      <ToolMagazine shared={shared} pm={pm} />
    </group>
  );
}
