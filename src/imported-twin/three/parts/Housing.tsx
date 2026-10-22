import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { part } from '../spec';
import type { ShellMaterials } from '../materials';

type V3 = [number, number, number];

/** Caixa da carcaça (material compartilhado → afetado pelo Raio-X) */
export function SBox({
  size,
  position,
  material,
  radius = 0,
  rotation,
}: {
  size: V3;
  position: V3;
  material: THREE.Material;
  radius?: number;
  rotation?: V3;
}) {
  if (radius > 0) {
    return (
      <RoundedBox
        args={size}
        radius={radius}
        smoothness={2}
        position={position}
        rotation={rotation}
        material={material}
        castShadow
        receiveShadow
      />
    );
  }
  return (
    <mesh position={position} rotation={rotation} material={material} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

/** Peça da carcaça lida diretamente da geometria gerada pelo img2threejs */
function SpecBox({
  id,
  material,
  radius = 0.012,
}: {
  id: string;
  material: THREE.Material;
  radius?: number;
}) {
  const p = part(id);
  return <SBox size={p.size} position={p.position} material={material} radius={radius} />;
}

export default function Housing({ m }: { m: ShellMaterials }) {
  return (
    <group name="housing">
      {/* base, paredes externas e frente (img2threejs) */}
      <SpecBox id="plinth" material={m.grey} radius={0.01} />
      <SBox size={[2.3, 0.07, 0.02]} position={[0, 0.05, 1.81]} material={m.black} />
      <SpecBox id="left-wall" material={m.white} />
      <SpecBox id="rear-wall" material={m.white} />
      <SpecBox id="front-column" material={m.white} />
      <SpecBox id="front-lower-wall" material={m.white} />
      <SpecBox id="front-right-pillar" material={m.white} />
      <SpecBox id="side-wall-front" material={m.white} />

      {/* letreiro vertical G300 e puxador */}
      <mesh position={[-0.875, 1.2, 1.803]} material={m.lettering} renderOrder={2}>
        <planeGeometry args={[0.34, 1.36]} />
      </mesh>
      <SBox
        size={[0.03, 0.2, 0.035]}
        position={[-0.6, 1.0, 1.82]}
        material={m.black}
        radius={0.008}
      />
      {/* juntas de chapa na frente */}
      <SBox size={[0.008, 2.06, 0.006]} position={[-0.55, 1.16, 1.803]} material={m.seam} />
      <SBox size={[0.008, 2.06, 0.006]} position={[0.8, 1.16, 1.803]} material={m.seam} />
      <SBox size={[0.6, 0.006, 0.006]} position={[-0.875, 0.42, 1.803]} material={m.seam} />

      {/* calha de cavacos na soleira (recorte preto) */}
      <mesh position={[0.62, 0.36, 1.86]} rotation={[0, 0, 0]} material={m.black}>
        <torusGeometry args={[0.07, 0.025, 10, 24, Math.PI]} />
      </mesh>

      {/* área de usinagem: paredes internas */}
      <SpecBox id="workarea-back" material={m.grey} radius={0} />
      <SpecBox id="workarea-left" material={m.grey} radius={0} />
      <SpecBox id="workarea-right" material={m.grey} radius={0} />
      <SpecBox id="workarea-ceiling" material={m.grey} radius={0} />
      <SBox size={[1.33, 0.03, 1.55]} position={[0.125, 0.63, 0.97]} material={m.darkGrey} />
      {/* proteção telescópica (lâminas) na parede esquerda – repetitionSystems.way-cover-slats */}
      {Array.from({ length: 9 }, (_, i) => (
        <SBox
          key={i}
          size={[0.012, 0.14, 1.4]}
          position={[-0.525, 0.78 + i * 0.155, 0.95]}
          material={m.seam}
        />
      ))}
      {/* fole em volta da passagem do spindle */}
      <SBox size={[0.62, 0.62, 0.012]} position={[0, 1.15, 0.236]} material={m.darkGrey} />
      {Array.from({ length: 6 }, (_, i) => (
        <SBox
          key={i}
          size={[0.62, 0.012, 0.02]}
          position={[0, 0.88 + i * 0.11, 0.245]}
          material={m.seam}
        />
      ))}

      {/* lado de serviço: janelas, juntas e portas */}
      <mesh position={[1.232, 1.58, 0.55]} rotation={[0, Math.PI / 2, 0]} material={m.glass}>
        <planeGeometry args={[0.42, 0.56]} />
      </mesh>
      <SBox size={[0.012, 0.6, 0.46]} position={[1.226, 1.58, 0.55]} material={m.seam} />
      <mesh position={[1.232, 1.45, -0.12]} rotation={[0, Math.PI / 2, 0]} material={m.glass}>
        <planeGeometry args={[0.22, 0.42]} />
      </mesh>
      {[-0.27, 0.05, 0.33, 0.78, 1.05].map((z) => (
        <SBox key={z} size={[0.006, 2.04, 0.008]} position={[1.232, 1.16, z]} material={m.seam} />
      ))}
      <SBox size={[0.006, 0.008, 1.95]} position={[1.232, 0.82, 0.72]} material={m.seam} />
      <mesh position={[1.24, 1.32, 0.9]} rotation={[0, Math.PI / 2, 0]} material={m.black}>
        <circleGeometry args={[0.06, 3]} />
      </mesh>

      {/* baia de serviço aberta (traseira direita) */}
      <SBox size={[0.04, 2.08, 1.5]} position={[0.56, 1.16, -1.05]} material={m.grey} />
      <SBox size={[0.05, 2.08, 0.05]} position={[1.175, 1.16, -0.33]} material={m.white} />
      <SBox size={[0.05, 2.08, 0.05]} position={[1.175, 1.16, -1.775]} material={m.white} />
      <SBox size={[0.64, 0.05, 1.5]} position={[0.88, 2.17, -1.05]} material={m.white} />
      <SBox size={[0.62, 0.025, 0.66]} position={[0.88, 1.22, -1.42]} material={m.grey} />
      <SBox size={[0.62, 0.025, 0.36]} position={[0.88, 0.48, -0.55]} material={m.darkGrey} />
      {/* eletrocalhas */}
      <SBox size={[0.06, 0.06, 1.45]} position={[0.61, 2.05, -1.05]} material={m.darkGrey} />
      <SBox size={[0.06, 1.0, 0.06]} position={[0.61, 1.5, -0.36]} material={m.darkGrey} />

      {/* faixa azul do teto + selos GROB */}
      <SBox size={[2.4, 0.35, 0.06]} position={[0, 2.375, 1.77]} material={m.blue} radius={0.01} />
      <SBox size={[2.4, 0.35, 0.06]} position={[0, 2.375, -1.77]} material={m.blue} radius={0.01} />
      <SBox size={[0.06, 0.35, 3.6]} position={[-1.17, 2.375, 0]} material={m.blue} radius={0.01} />
      <SBox size={[0.06, 0.35, 3.6]} position={[1.17, 2.375, 0]} material={m.blue} radius={0.01} />
      <SBox size={[2.3, 0.04, 3.5]} position={[0, 2.43, 0]} material={m.grey} />
      <mesh position={[-0.72, 2.39, 1.802]} material={m.badge}>
        <planeGeometry args={[0.4, 0.15]} />
      </mesh>
      <mesh position={[1.202, 2.39, 0.95]} rotation={[0, Math.PI / 2, 0]} material={m.badge}>
        <planeGeometry args={[0.4, 0.15]} />
      </mesh>

      {/* cobertura elevada com venezianas (repetitionSystems.roof-louvres) */}
      <SpecBox id="roof-cover" material={m.white} radius={0.03} />
      {Array.from({ length: 10 }, (_, i) => (
        <SBox
          key={i}
          size={[0.9, 0.018, 0.03]}
          position={[0, 2.5 + i * 0.038, 1.012]}
          material={m.seam}
        />
      ))}
      <SBox
        size={[0.7, 0.32, 0.6]}
        position={[0.45, 2.6, -1.15]}
        material={m.white}
        radius={0.03}
      />
      <mesh position={[0.45, 2.78, -1.15]} material={m.grey}>
        <cylinderGeometry args={[0.18, 0.18, 0.04, 32]} />
      </mesh>
      <SBox
        size={[0.5, 0.2, 0.06]}
        position={[-0.6, 2.55, -0.2]}
        material={m.white}
        radius={0.02}
        rotation={[0.5, 0, 0]}
      />

      {/* IHM no braço */}
      <SBox
        size={[0.11, 0.62, 0.47]}
        position={[1.29, 1.45, 1.22]}
        material={m.grey}
        radius={0.025}
      />
      <mesh position={[1.29, 0.78, 1.22]} material={m.white}>
        <cylinderGeometry args={[0.03, 0.03, 0.75, 16]} />
      </mesh>
      <mesh position={[1.25, 0.42, 1.22]} rotation={[0, 0, Math.PI / 2]} material={m.white}>
        <cylinderGeometry args={[0.03, 0.03, 0.1, 16]} />
      </mesh>
      {Array.from({ length: 4 }, (_, r) =>
        Array.from({ length: 7 }, (_, c) => (
          <SBox
            key={`${r}-${c}`}
            size={[0.008, 0.022, 0.035]}
            position={[1.348, 1.27 - r * 0.035, 1.07 + c * 0.045]}
            material={m.black}
          />
        )),
      )}

      {/* tubo de retorno de refrigerante */}
      <mesh position={[0.92, 0.32, 1.9]} material={m.white}>
        <cylinderGeometry args={[0.045, 0.045, 0.42, 20]} />
      </mesh>
      <mesh position={[0.92, 0.12, 2.0]} rotation={[Math.PI / 2, 0, 0]} material={m.white}>
        <cylinderGeometry args={[0.045, 0.045, 0.22, 20]} />
      </mesh>

      {/* estrutura interna: base e coluna (visível no Raio-X) */}
      <SBox size={[1.5, 0.48, 1.9]} position={[0.2, 0.36, 0.75]} material={m.darkGrey} />
      <SBox size={[1.3, 1.55, 0.4]} position={[0.1, 1.4, -0.42]} material={m.darkGrey} />
    </group>
  );
}
