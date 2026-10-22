import * as THREE from 'three';
import type { ComponentId } from '../twin/whatif';

/**
 * Âncoras 3D dos rótulos ao vivo. A cena projeta estas posições para a tela a cada quadro
 * (`projected`) e a camada HTML (LabelsOverlay) posiciona os rótulos com linhas-guia,
 * evitando sobreposição em qualquer ângulo de câmera.
 */
export type LabelId = ComponentId | 'electrical';

export const ANCHORS: Record<LabelId, THREE.Vector3> = {
  spindle: new THREE.Vector3(0, 1.2, 0.7),
  table: new THREE.Vector3(0, 1.0, 1.3),
  bomba1: new THREE.Vector3(0.92, 0.62, -0.6),
  bomba2: new THREE.Vector3(0.9, 0.8, -1.38),
  bomba3: new THREE.Vector3(0.9, 1.35, -1.4),
  electrical: new THREE.Vector3(1.1, 1.66, -1.55),
};

export const LABEL_IDS = Object.keys(ANCHORS) as LabelId[];

export interface Projected {
  x: number;
  y: number;
  visible: boolean;
  /** encoberto por uma superfície opaca (ex.: carcaça fora do Raio-X) */
  occluded?: boolean;
}

export const projected: Record<string, Projected> = {};
export const viewport = { width: 1, height: 1 };

const tmp = new THREE.Vector3();
export function projectAnchors(camera: THREE.Camera, width: number, height: number) {
  camera.updateMatrixWorld();
  viewport.width = width;
  viewport.height = height;
  for (const id of LABEL_IDS) {
    tmp.copy(ANCHORS[id]).project(camera);
    const prev = projected[id];
    projected[id] = { x: ((tmp.x + 1) / 2) * width, y: ((1 - tmp.y) / 2) * height, visible: tmp.z < 1 && Math.abs(tmp.x) < 1.2 && Math.abs(tmp.y) < 1.2, occluded: prev?.occluded };
  }
}

const ray = new THREE.Raycaster();
const dir = new THREE.Vector3();

/**
 * Teste de oclusão (executado algumas vezes por segundo): o rótulo some quando a carcaça
 * está entre a câmera e o ponto do componente. No Raio-X a carcaça fica
 * transparente e deixa de ocultar.
 */
export function updateOcclusion(camera: THREE.Camera, scene: THREE.Object3D, margin = 0.28) {
  const origin = camera.getWorldPosition(new THREE.Vector3());
  for (const id of LABEL_IDS) {
    const p = projected[id];
    if (!p) continue;
    dir.copy(ANCHORS[id]).sub(origin);
    const dist = dir.length();
    ray.set(origin, dir.normalize());
    ray.far = Math.max(0.01, dist - margin);
    const hits = ray.intersectObjects(scene.children, true);
    p.occluded = hits.some((h) => {
      const mesh = h.object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible || mesh.userData.noOcclude) return false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      return mats.some((m) => m.userData.shell === true && !(m.transparent && m.opacity < 0.5));
    });
  }
}

export interface Box {
  id: string;
  ax: number;
  ay: number;
  w: number;
  h: number;
}

export interface Placed extends Box {
  x: number;
  y: number;
  side: 'left' | 'right';
}

/**
 * Layout dos rótulos: cada rótulo vai para o lado (esquerdo/direito) do seu ponto,
 * os de cada lado são ordenados por altura e afastados verticalmente para não se sobreporem.
 */
export function layoutLabels(boxes: Box[], width: number, height: number, gap = 6, offset = 46): Placed[] {
  const cx = width / 2;
  const out: Placed[] = [];
  for (const side of ['left', 'right'] as const) {
    const group = boxes.filter((b) => (side === 'left' ? b.ax < cx : b.ax >= cx)).sort((a, b) => a.ay - b.ay);
    const placed: Placed[] = [];
    for (const b of group) {
      let x = side === 'left' ? b.ax - offset - b.w : b.ax + offset;
      x = Math.max(8, Math.min(width - b.w - 8, x));
      let y = b.ay - b.h / 2;
      const prev = placed[placed.length - 1];
      if (prev) y = Math.max(y, prev.y + prev.h + gap);
      placed.push({ ...b, x, y, side });
    }
    // se estourou embaixo, empurra o grupo para cima
    const last = placed[placed.length - 1];
    if (last && last.y + last.h > height - 8) {
      let shift = last.y + last.h - (height - 8);
      for (let i = placed.length - 1; i >= 0; i -= 1) {
        placed[i].y -= shift;
        const above = placed[i - 1];
        if (above) {
          const overlap = above.y + above.h + gap - placed[i].y;
          shift = Math.max(0, overlap);
          if (shift === 0) break;
        }
      }
    }
    placed.forEach((p) => {
      p.y = Math.max(8, p.y);
    });
    out.push(...placed);
  }
  return out;
}
