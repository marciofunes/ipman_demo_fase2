/** Visual reconstruction from imgBloco; illustrative dimensions in metres.
 * Shared face coordinates drive both the cutter and the recessed geometry. */
export type Vec3 = [number, number, number];
export const BLOCK = { width: 0.24, height: 0.3, depth: 0.08, bottom: 0.07 };
export const TABLE_ORIGIN: Vec3 = [0, 1, 1.3];
export interface Hole {
  u: number;
  v: number;
  radius: number;
  depth: number;
}
export interface BlockFace {
  center: Vec3;
  uAxis: Vec3;
  vAxis: Vec3;
  normal: Vec3;
  rotation: Vec3;
  width: number;
  height: number;
  A: number;
  B: number;
  holes: Hole[];
}
const h = (u: number, v: number, radius = 0.016, depth = 0.027): Hole => ({ u, v, radius, depth });
const front = [
  h(-0.098, 0.13, 0.005),
  h(0.098, 0.13, 0.005),
  h(-0.083, 0.075),
  h(0, 0.083, 0.011),
  h(0.083, 0.075),
  h(-0.054, 0.027),
  h(0.054, 0.027),
  ...[-0.081, -0.027, 0.027, 0.081].map((x) => h(x, -0.021)),
  h(0, -0.052, 0.012),
  ...[-0.081, -0.027, 0.027, 0.081].map((x) => h(x, -0.078)),
  h(-0.067, -0.132, 0.005),
  h(0.067, -0.132, 0.005),
];
export const BLOCK_FACES: BlockFace[] = [
  {
    center: [0, 0.22, 0.04],
    uAxis: [1, 0, 0],
    vAxis: [0, 1, 0],
    normal: [0, 0, 1],
    rotation: [0, 0, 0],
    width: 0.24,
    height: 0.3,
    A: 0,
    B: Math.PI,
    holes: front,
  },
  {
    center: [0.12, 0.22, 0],
    uAxis: [0, 0, -1],
    vAxis: [0, 1, 0],
    normal: [1, 0, 0],
    rotation: [0, Math.PI / 2, 0],
    width: 0.08,
    height: 0.3,
    A: 0,
    B: Math.PI / 2,
    holes: [
      h(0, 0.035, 0.022, 0.035),
      h(0.02, 0.08, 0.004),
      h(0.012, -0.035, 0.004),
      h(0, -0.09, 0.004),
    ],
  },
  {
    center: [0, 0.22, -0.04],
    uAxis: [-1, 0, 0],
    vAxis: [0, 1, 0],
    normal: [0, 0, -1],
    rotation: [0, Math.PI, 0],
    width: 0.24,
    height: 0.3,
    A: 0,
    B: 0,
    holes: [
      h(-0.029, 0.077, 0.013),
      h(0.029, 0.077, 0.013),
      h(0, 0.03, 0.035, 0.035),
      h(0, -0.046, 0.021),
      h(-0.059, -0.105, 0.018),
      h(0.059, -0.105, 0.018),
      ...[-0.105, 0.105].flatMap((x) => [h(x, 0.069, 0.007), h(x, -0.006, 0.007)]),
    ],
  },
  {
    center: [-0.12, 0.22, 0],
    uAxis: [0, 0, 1],
    vAxis: [0, 1, 0],
    normal: [-1, 0, 0],
    rotation: [0, -Math.PI / 2, 0],
    width: 0.08,
    height: 0.3,
    A: 0,
    B: -Math.PI / 2,
    holes: [
      ...[-0.1, -0.035, 0.035, 0.1].map((y) => h(-0.009, y, 0.011)),
      h(0.021, -0.09, 0.006),
      h(0.021, 0.09, 0.006),
    ],
  },
  {
    center: [0, 0.37, 0],
    uAxis: [1, 0, 0],
    vAxis: [0, 0, -1],
    normal: [0, 1, 0],
    rotation: [-Math.PI / 2, 0, 0],
    width: 0.24,
    height: 0.08,
    A: -Math.PI / 2,
    B: 0,
    holes: [
      h(-0.06, 0, 0.033, 0.045),
      h(0.06, 0, 0.033, 0.045),
      h(-0.105, 0.025, 0.006),
      h(0.105, 0.025, 0.006),
    ],
  },
];
export const DRILL_OPERATIONS = BLOCK_FACES.flatMap((face, faceIndex) =>
  face.holes.map((hole, faceHole) => ({ ...hole, face: faceIndex, faceHole })),
);
export function rotateOnTable([x, y, z]: Vec3, A: number, B: number): Vec3 {
  const bx = Math.cos(B) * x + Math.sin(B) * z,
    bz = -Math.sin(B) * x + Math.cos(B) * z;
  return [bx, Math.cos(A) * y - Math.sin(A) * bz, Math.sin(A) * y + Math.cos(A) * bz];
}
export function holeSurface(index: number): Vec3 {
  const op = DRILL_OPERATIONS[index],
    face = BLOCK_FACES[op.face];
  const point = face.center.map((v, i) => v + face.uAxis[i] * op.u + face.vAxis[i] * op.v) as Vec3;
  return rotateOnTable(point, face.A, face.B).map((v, i) => v + TABLE_ORIGIN[i]) as Vec3;
}
