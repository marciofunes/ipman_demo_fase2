/**
 * Geometria gerada pela conversão img2threejs (ver reference/img2threejs/README.md).
 *
 * `g300-geometry.json` é exportado do object-sculpt-spec.json validado em modo
 * --strict-quality. Cada componente traz tamanho, posição e material no referencial
 * da máquina (metros; +Z frente do operador, +X lado de serviço, +Y para cima).
 * As peças da carcaça usam estes valores diretamente; os detalhes finos e as partes
 * móveis são o passe "refine-code" feito à mão em src/three/parts.
 */
import geometry from './generated/g300-geometry.json';

export interface SpecPart {
  id: string;
  name: string;
  size: [number, number, number];
  position: [number, number, number];
  material: string;
  xray: 'transparent-shell' | 'opaque-internal' | null;
}

const parts = geometry.components as unknown as SpecPart[];

export function part(id: string): SpecPart {
  const p = parts.find((x) => x.id === id);
  if (!p) throw new Error(`Componente "${id}" ausente em g300-geometry.json`);
  return p;
}

export const SPEC_MATERIALS = geometry.materials as Record<
  string,
  { color: string; metalness: number; roughness: number }
>;
export const SPEC_PARTS = parts;
