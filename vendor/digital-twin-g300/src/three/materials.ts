import * as THREE from 'three';
import { SPEC_MATERIALS } from './spec';
import { g300Lettering, grobBadge } from './textures';

/**
 * Materiais compartilhados.
 * - SHELL_*: carcaça. O botão Raio-X torna SOMENTE estes materiais transparentes.
 * - os componentes de interesse (spindle, mesa, bombas…) usam materiais próprios e
 *   continuam opacos e animados no Raio-X.
 */

const m = (id: string, extra: THREE.MeshStandardMaterialParameters = {}) => {
  const s = SPEC_MATERIALS[id];
  return new THREE.MeshStandardMaterial({ color: s.color, metalness: s.metalness, roughness: s.roughness, ...extra });
};

export function createShellMaterials() {
  const mats = {
    white: m('shell-white', { color: '#eceef0', roughness: 0.5 }),
    grey: m('shell-grey'),
    darkGrey: new THREE.MeshStandardMaterial({ color: '#8d959c', metalness: 0.2, roughness: 0.6 }),
    blue: m('grob-blue', { color: '#1d4f9f' }),
    seam: new THREE.MeshStandardMaterial({ color: '#9aa3ab', roughness: 0.7 }),
    black: m('rubber-black'),
    glass: new THREE.MeshPhysicalMaterial({ color: '#566b7c', metalness: 0, roughness: 0.08, transparent: true, opacity: 0.55 }),
    badge: new THREE.MeshStandardMaterial({ map: grobBadge(), roughness: 0.4, metalness: 0.2 }),
    lettering: new THREE.MeshStandardMaterial({ map: g300Lettering(), transparent: true, roughness: 0.5, depthWrite: false }),
  };
  // marca a carcaça: é a única superfície que esconde rótulos (e some no Raio-X)
  Object.values(mats).forEach((mt) => {
    mt.userData.shell = true;
  });
  return mats;
}

export type ShellMaterials = ReturnType<typeof createShellMaterials>;

const XRAY_TINT = new THREE.Color('#9ec9ec');

/** guarda as cores originais para restaurar ao sair do Raio-X */
const original = new WeakMap<THREE.Material, { color: THREE.Color; opacity: number; transparent: boolean }>();

export function applyXray(mats: ShellMaterials, on: boolean) {
  Object.values(mats).forEach((mat) => {
    const std = mat as THREE.MeshStandardMaterial;
    if (!original.has(std)) original.set(std, { color: std.color.clone(), opacity: std.opacity, transparent: std.transparent });
    const o = original.get(std)!;
    if (on) {
      std.transparent = true;
      std.opacity = mat === mats.glass ? 0.06 : 0.09;
      std.depthWrite = false;
      std.color.copy(o.color).lerp(XRAY_TINT, 0.55);
    } else {
      std.transparent = o.transparent;
      std.opacity = o.opacity;
      std.depthWrite = mat !== mats.lettering;
      std.color.copy(o.color);
    }
    std.needsUpdate = true;
  });
}

export function createPartMaterials() {
  return {
    steel: m('steel', { roughness: 0.28 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: '#5e656c', metalness: 0.8, roughness: 0.35 }),
    castWhite: m('cast-white'),
    motor: m('motor-grey'),
    motorBlue: new THREE.MeshStandardMaterial({ color: '#2f5f9e', metalness: 0.3, roughness: 0.45 }),
    red: m('accumulator-red', { roughness: 0.3 }),
    black: m('rubber-black'),
    copper: new THREE.MeshStandardMaterial({ color: '#b8733b', metalness: 0.9, roughness: 0.35 }),
    aluminium: new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 0.75, roughness: 0.32 }),
    hose: new THREE.MeshStandardMaterial({ color: '#2a2f35', roughness: 0.75 }),
    pipe: new THREE.MeshStandardMaterial({ color: '#c4c9ce', metalness: 0.3, roughness: 0.5 }),
    brass: new THREE.MeshStandardMaterial({ color: '#c9a64a', metalness: 0.85, roughness: 0.35 }),
    tank: new THREE.MeshStandardMaterial({ color: '#a8b0b8', metalness: 0.35, roughness: 0.5 }),
  };
}

export type PartMaterials = ReturnType<typeof createPartMaterials>;

export const STATUS_COLOR = {
  normal: new THREE.Color('#1e8a55'),
  attention: new THREE.Color('#ff8a00'),
  critical: new THREE.Color('#ff2a1f'),
  selected: new THREE.Color('#2a9df4'),
};
