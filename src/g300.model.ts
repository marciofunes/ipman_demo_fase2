/** G300 procedural assembly, refined against both supplied references.
 * Relative dimensions; +Z front, +X service bay, +Y up. No official CAD claim.
 * Semantic pivots isolate component heat/vibration from enclosure transparency.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ComponentId } from './twin-engine';
export function setShellTransparency(
  model: { shell: THREE.Group; shellMaterials: THREE.MeshStandardMaterial[] },
  enabled: boolean,
) {
  model.shellMaterials.forEach((material) => {
    material.transparent = enabled;
    material.opacity = enabled ? 0.12 : 1;
    material.depthWrite = !enabled;
    material.needsUpdate = true;
  });
  model.shell.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = !enabled;
  });
}
export type MachinePart = {
  group: THREE.Group;
  rotor: THREE.Group;
  rest: THREE.Vector3;
  materials: THREE.MeshStandardMaterial[];
  anchor: [number, number, number];
  center: [number, number, number];
};
export function createG300Model() {
  const root = new THREE.Group();
  root.name = 'GROB G300';
  const shell = new THREE.Group();
  shell.name = 'Carcaça';
  root.add(shell);
  const paint = (color: string, metalness = 0.12, roughness = 0.38) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const white = paint('#e0e3e1'),
    blue = paint('#06538d', 0.22, 0.3),
    steel = paint('#a0abad', 0.82, 0.3),
    satin = paint('#68777c', 0.75, 0.4),
    dark = paint('#27343b', 0.5, 0.47),
    black = paint('#101b22', 0.15, 0.6),
    red = paint('#9f2936', 0.3, 0.35);
  const shellMaterials: THREE.MeshStandardMaterial[] = [white.clone(), blue.clone()];
  const parts = {} as Record<ComponentId, MachinePart>;
  function mesh(
    parent: THREE.Object3D,
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: number[],
  ) {
    const object = new THREE.Mesh(geometry, material);
    object.name = name;
    object.position.set(...(position as [number, number, number]));
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(
    parent: THREE.Object3D,
    name: string,
    p: number[],
    s: number[],
    material: THREE.Material = white,
    round = 0.025,
  ) {
    return mesh(
      parent,
      name,
      round > 0
        ? new RoundedBoxGeometry(
            ...(s as [number, number, number]),
            2,
            Math.min(round, Math.min(...s) / 4),
          )
        : new THREE.BoxGeometry(...(s as [number, number, number])),
      material,
      p,
    );
  }
  function cyl(
    parent: THREE.Object3D,
    name: string,
    p: number[],
    r: number,
    h: number,
    material: THREE.Material = steel,
    axis: 'y' | 'z' | 'x' = 'y',
    r2 = r,
  ) {
    const m = mesh(parent, name, new THREE.CylinderGeometry(r2, r, h, 40), material, p);
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    return m;
  }
  function pipe(
    parent: THREE.Object3D,
    points: number[][],
    radius = 0.035,
    material: THREE.Material = black,
  ) {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...(p as [number, number, number]))),
    );
    return mesh(
      parent,
      'Tubulação',
      new THREE.TubeGeometry(curve, 20, radius, 8, false),
      material,
      [0, 0, 0],
    );
  }
  function bolts(
    parent: THREE.Object3D,
    center: number[],
    radius: number,
    n: number,
    axis: 'z' | 'y' = 'z',
    size = 0.025,
  ) {
    const instances = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(size, size, 0.018, 6),
      satin,
      n,
    );
    instances.name = 'Fixadores';
    const matrix = new THREE.Matrix4(),
      q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(axis === 'z' ? Math.PI / 2 : 0, 0, 0),
      );
    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI * 2) / n;
      const p = new THREE.Vector3(
        center[0] + Math.cos(a) * radius,
        center[1] + (axis === 'z' ? Math.sin(a) * radius : 0),
        center[2] + (axis === 'y' ? Math.sin(a) * radius : 0),
      );
      matrix.compose(p, q, new THREE.Vector3(1, 1, 1));
      instances.setMatrixAt(i, matrix);
    }
    parent.add(instances);
  }
  function decal(
    parent: THREE.Object3D,
    text: string,
    p: number[],
    w: number,
    h: number,
    color = '#f1f6f8',
    background = '#07548c',
    rotation: [number, number, number] = [0, 0, 0],
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const c = canvas.getContext('2d');
    if (!c) return;
    c.fillStyle = background;
    c.fillRect(0, 0, 512, 256);
    c.fillStyle = color;
    c.font = 'bold 135px Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 256, 138);
    if (text === 'GROB') {
      c.lineWidth = 7;
      c.strokeStyle = color;
      c.strokeRect(22, 45, 468, 177);
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({ map, roughness: 0.48, metalness: 0.1 });
    if (parent === shell) shellMaterials.push(material);
    const m = mesh(
      parent,
      parent === shell ? 'Carcaça' : 'Gravação',
      new THREE.PlaneGeometry(w, h),
      material,
      p,
    );
    m.rotation.set(...rotation);
    return m;
  }
  function part(
    id: ComponentId,
    center: [number, number, number],
    anchor: [number, number, number],
  ) {
    const group = new THREE.Group();
    group.name = id;
    group.position.set(...center);
    root.add(group);
    const rotor = new THREE.Group();
    rotor.name = `${id}-rotor`;
    group.add(rotor);
    const materials = [paint('#729ca9', 0.64, 0.35), paint('#b3bdbe', 0.8, 0.28)];
    return (parts[id] = { group, rotor, rest: group.position.clone(), materials, anchor, center });
  }
  const coverMetal = satin.clone(),
    coverDark = dark.clone();
  shellMaterials.push(coverMetal, coverDark);
  const skin = shellMaterials[0],
    crown = shellMaterials[1];
  box(root, 'Base', [0, 0.22, 0], [5.45, 0.44, 4.1], dark, 0.08);
  box(shell, 'Carcaça', [0, 0.65, 0], [5.35, 0.65, 4.05], skin, 0.07);
  for (const x of [-2.15, 1]) {
    for (const z of [-1.75, 0.9]) box(root, 'Estrutura', [x, 2.35, z], [0.18, 3.25, 0.18], satin);
    for (const y of [0.8, 3.9]) box(root, 'Longarina', [x, y, -0.5], [0.18, 0.18, 2.9], satin);
  }
  box(shell, 'Carcaça', [-2.22, 2.43, 0.05], [0.78, 3.4, 4], skin);
  box(shell, 'Carcaça', [0.9, 2.42, 1.83], [0.58, 3.38, 0.38], skin);
  box(shell, 'Carcaça', [-0.64, 0.98, 1.93], [2.5, 0.58, 0.14], skin);
  box(shell, 'Carcaça', [-0.64, 3.85, 1.78], [2.5, 0.34, 0.52], skin);
  box(shell, 'Carcaça', [-2.22, 4.08, 1.99], [0.81, 0.53, 0.15], crown);
  box(shell, 'Carcaça', [1.79, 4.08, 1.99], [2.38, 0.53, 0.15], crown);
  box(shell, 'Carcaça', [2.77, 4.08, -0.03], [0.16, 0.53, 4.05], crown);
  box(shell, 'Carcaça', [-2.58, 4.08, -0.03], [0.12, 0.53, 4.05], crown);
  box(shell, 'Carcaça', [0.08, 4.08, -2.02], [5.3, 0.53, 0.14], crown);
  for (let i = 0; i < 3; i++)
    box(shell, 'Carcaça', [-0.26, 4.25, 0.95 - i * 1.02], [3.65, 0.45, 0.98], skin, 0.12);
  box(shell, 'Carcaça', [1.72, 2.68, 1.91], [1.03, 2.33, 0.12], skin);
  box(shell, 'Carcaça', [2.42, 2.68, 1.91], [0.36, 2.33, 0.12], skin);
  for (let i = 0; i < 3; i++) {
    box(shell, 'Carcaça', [2.77, 2.85, 1.28 - i * 1.25], [0.12, 1.94, 1.2], skin);
    box(shell, 'Carcaça', [2.77, 0.99, 1.28 - i * 1.25], [0.12, 0.63, 1.2], skin);
  }
  const windowMaterial = paint('#273a42', 0.25, 0.3);
  shellMaterials.push(windowMaterial);
  box(shell, 'Carcaça', [2.844, 2.9, 0.12], [0.015, 1.1, 0.7], windowMaterial, 0.015);
  box(shell, 'Carcaça', [-0.64, 2.44, -1.78], [2.48, 2.8, 0.18], coverDark);
  for (let i = 0; i < 29; i++)
    box(shell, 'Fole', [-0.64, 1.28 + i * 0.085, -1.65], [2.47, 0.025, 0.08], coverMetal, 0);
  box(root, 'Guia', [-1.76, 2.5, -0.5], [0.12, 2.85, 2.3], steel);
  for (let i = 0; i < 20; i++)
    box(shell, 'Fole', [-1.68, 1.43 + i * 0.105, -0.38], [0.07, 0.035, 2.15], coverMetal, 0);
  for (const x of [-2.59, -1.83, 0.6, 1.2]) {
    box(shell, 'Carcaça', [x, 2.35, 2.058], [0.012, 2.8, 0.01], skin, 0);
    for (const y of [1.07, 2.4, 3.69])
      cyl(shell, 'Carcaça', [x, y, 2.069], 0.022, 0.014, skin, 'z');
  }
  decal(shell, 'GROB', [-2.22, 4.08, 2.075], 0.62, 0.29);
  decal(shell, 'GROB', [1.82, 4.08, 2.075], 0.72, 0.32);
  decal(shell, 'GROB', [2.858, 4.08, -0.15], 0.8, 0.34, '#f1f6f8', '#07548c', [0, Math.PI / 2, 0]);
  decal(shell, 'G300', [-2.22, 2.48, 2.065], 2.12, 0.55, '#a0a8a8', '#e0e3e1', [0, 0, Math.PI / 2]);
  box(root, 'Puxador', [-1.86, 1.75, 2.16], [0.055, 0.49, 0.08], black);
  const spindle = part('spindle', [-0.63, 1.78, -0.43], [-2.8, 2.8, 2.1]);
  box(spindle.group, 'Saddle', [0, 0, -0.3], [0.92, 0.94, 0.6], spindle.materials[0], 0.06);
  cyl(spindle.group, 'Flange', [0, 0, 0.04], 0.43, 0.2, spindle.materials[1], 'z');
  bolts(spindle.group, [0, 0, 0.15], 0.34, 8);
  cyl(spindle.group, 'Quill', [0, 0, 0.34], 0.28, 0.56, spindle.materials[0], 'z');
  cyl(spindle.rotor, 'Spindle nose', [0, 0, 0.68], 0.21, 0.18, spindle.materials[1], 'z', 0.16);
  cyl(spindle.rotor, 'Porta-ferramenta', [0, 0, 0.81], 0.125, 0.16, dark, 'z');
  cyl(spindle.rotor, 'Ferramenta', [0, 0, 1.03], 0.065, 0.3, steel, 'z');
  for (let i = 0; i < 4; i++) {
    const flute = box(
      spindle.rotor,
      'Canal',
      [Math.cos((i * Math.PI) / 2) * 0.054, Math.sin((i * Math.PI) / 2) * 0.054, 1.03],
      [0.018, 0.018, 0.28],
      dark,
      0,
    );
    flute.rotation.z = (i * Math.PI) / 2;
  }
  const motor = part('motor', [-0.63, 1.78, -1.34], [-1.25, 4.8, -0.9]);
  cyl(motor.rotor, 'Eixo de transmissão', [0, 0, 0.47], 0.095, 0.55, steel, 'z');
  cyl(motor.group, 'Motor', [0, 0, -0.22], 0.39, 0.9, motor.materials[0], 'z');
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    const fin = box(
      motor.group,
      'Aleta',
      [Math.cos(a) * 0.4, Math.sin(a) * 0.4, -0.22],
      [0.045, 0.1, 0.72],
      motor.materials[0],
      0.004,
    );
    fin.rotation.z = a;
  }
  cyl(motor.group, 'Tampa', [0, 0, -0.73], 0.41, 0.12, motor.materials[1], 'z');
  cyl(motor.rotor, 'Ventoinha', [0, 0, -0.8], 0.29, 0.03, dark, 'z');
  for (let i = 0; i < 8; i++) {
    const blade = box(
      motor.rotor,
      'Pá',
      [Math.cos((i * Math.PI) / 4) * 0.15, Math.sin((i * Math.PI) / 4) * 0.15, -0.825],
      [0.22, 0.045, 0.025],
      steel,
      0,
    );
    blade.rotation.z = (i * Math.PI) / 4;
  }
  box(motor.group, 'Caixa elétrica', [0.36, 0.16, -0.28], [0.27, 0.32, 0.38], motor.materials[0]);
  const table = part('table', [-0.63, 1.02, 0.95], [-2.65, 0.85, 2]);
  box(table.group, 'Berço', [0, -0.12, -0.1], [1.58, 0.27, 1.42], table.materials[0], 0.05);
  for (const x of [-0.65, 0.65]) {
    box(table.group, 'Suporte A', [x, 0.1, -0.12], [0.18, 0.48, 0.8], table.materials[1], 0.07);
    cyl(table.group, 'Mancal A', [x, 0.32, -0.16], 0.39, 0.2, table.materials[0], 'x');
  }
  cyl(table.group, 'Base da mesa', [0, 0.22, 0.08], 0.64, 0.2, table.materials[0]);
  table.rotor.position.y = 0.37;
  cyl(table.rotor, 'Mesa C', [0, 0, 0.08], 0.71, 0.13, table.materials[1]);
  cyl(table.rotor, 'Face usinada', [0, 0.075, 0.08], 0.66, 0.025, steel);
  bolts(table.rotor, [0, 0.097, 0.08], 0.53, 12, 'y', 0.018);
  for (let i = 0; i < 4; i++) {
    const slot = box(table.rotor, 'Ranhura T', [0, 0.094, 0.08], [0.025, 0.009, 1.15], dark, 0);
    slot.rotation.y = (i * Math.PI) / 4;
  }
  box(table.rotor, 'Peça', [0, 0.3, 0.08], [0.78, 0.39, 0.53], steel);
  box(table.rotor, 'Peça', [0, 0.62, 0.08], [0.8, 0.27, 0.5], black);
  for (let i = 0; i < 4; i++)
    cyl(table.rotor, 'Furo', [-0.28 + i * 0.186, 0.32, 0.351], 0.051, 0.012, dark, 'z');
  decal(table.rotor, 'VW AG', [0, 0.19, 0.354], 0.46, 0.11, '#586b71', '#a0abad');
  for (const x of [-0.45, 0.45])
    box(table.rotor, 'Grampo', [x, 0.16, 0.08], [0.14, 0.11, 0.6], dark);
  for (const [id, z, anchor] of [
    ['pump1', 1.22, [3.45, 1.6, 1.9]],
    ['pump2', -0.08, [3.5, 2.75, -0.05]],
    ['pump3', -1.37, [3.4, 3.9, -1.5]],
  ] as [ComponentId, number, [number, number, number]][]) {
    const p = part(id, [1.99, 1.14, z], anchor);
    box(p.group, 'Sapata', [0, -0.42, 0], [0.75, 0.1, 0.8], steel);
    cyl(p.group, 'Bomba', [0, -0.18, 0], 0.28, 0.39, p.materials[0]);
    cyl(p.group, 'Acoplamento', [0, 0.09, 0], 0.19, 0.13, dark);
    cyl(p.group, 'Motor da bomba', [0, 0.44, 0], 0.23, 0.55, p.materials[0]);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const fin = box(
        p.group,
        'Aleta',
        [Math.cos(a) * 0.235, 0.44, Math.sin(a) * 0.235],
        [0.05, 0.48, 0.06],
        p.materials[0],
        0.005,
      );
      fin.rotation.y = -a;
    }
    cyl(p.group, 'Tampa ventilada', [0, 0.76, 0], 0.25, 0.09, p.materials[1]);
    cyl(p.rotor, 'Eixo', [0, 0.1, 0], 0.085, 0.17, steel);
    for (let i = 0; i < 3; i++) {
      const spoke = box(p.rotor, 'Rotor', [0, 0.11, 0], [0.3, 0.025, 0.025], p.materials[1], 0);
      spoke.rotation.y = (i * Math.PI) / 3;
    }
    box(p.group, 'Caixa elétrica', [0.23, 0.44, 0], [0.18, 0.25, 0.29], p.materials[0]);
    pipe(
      p.group,
      [
        [0.18, -0.18, 0],
        [0.5, -0.18, 0],
        [0.5, -0.36, -0.23],
      ],
      0.055,
      satin,
    );
    pipe(
      root,
      [
        [2.2, 1, z],
        [2.45, 1.06, z],
        [2.45, 0.6, z],
        [1.05, 0.6, z],
      ],
      0.035,
    );
  }
  cyl(root, 'Acumulador', [2.36, 2.64, -1.36], 0.2, 1.1, red);
  cyl(root, 'Válvula', [2.36, 3.24, -1.36], 0.07, 0.15, steel);
  for (const y of [2.24, 3.04]) cyl(root, 'Abraçadeira', [2.36, y, -1.36], 0.214, 0.065, dark);
  box(root, 'Bloco hidráulico', [2.11, 2.42, -0.53], [0.67, 0.34, 0.45], satin);
  for (let i = 0; i < 5; i++) {
    cyl(root, 'Solenoide', [2.43, 2.43, -0.75 + i * 0.1], 0.037, 0.14, black, 'x');
    pipe(
      root,
      [
        [2.12, 2.59, -0.72 + i * 0.1],
        [2.12, 3.2, -0.72 + i * 0.1],
        [1.1, 3.35, -0.72 + i * 0.1],
      ],
      0.016,
    );
  }
  box(root, 'Magazine', [1.5, 1.75, 1.62], [0.43, 1.45, 0.18], dark);
  const holders = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.045, 0.065, 0.18, 12),
    steel,
    36,
  );
  holders.name = 'Porta-ferramentas';
  const dummy = new THREE.Object3D();
  for (let r = 0; r < 12; r++)
    for (let c = 0; c < 3; c++) {
      dummy.position.set(1.34 + c * 0.13, 1.13 + r * 0.11, 1.76);
      dummy.rotation.x = Math.PI / 2;
      dummy.updateMatrix();
      holders.setMatrixAt(r * 3 + c, dummy.matrix);
    }
  root.add(holders);
  pipe(
    root,
    [
      [0.95, 1.12, 2],
      [1.09, 0.9, 2.18],
      [1.57, 0.9, 2.18],
      [1.57, 1.6, 2.18],
    ],
    0.085,
    white,
  );
  const control = new THREE.Group();
  control.position.set(1.35, 2.14, 2.29);
  control.rotation.y = -0.08;
  root.add(control);
  box(control, 'Painel de controle', [0, 0, 0], [1.04, 1.31, 0.18], dark, 0.04);
  box(control, 'Painel de controle', [0, 0.22, 0.105], [0.89, 0.65, 0.035], steel);
  const screen = document.createElement('canvas');
  screen.width = 512;
  screen.height = 350;
  const context = screen.getContext('2d');
  if (context) {
    context.fillStyle = '#c6e2ea';
    context.fillRect(0, 0, 512, 350);
    context.fillStyle = '#1e5678';
    context.fillRect(0, 0, 512, 36);
    context.font = '18px monospace';
    context.fillText('GROB  G300 / CNC', 20, 65);
    for (let i = 0; i < 9; i++) {
      context.fillStyle = i % 2 ? '#b2cbd4' : '#e0ebef';
      context.fillRect(10, 90 + i * 22, 300, 18);
    }
    context.strokeStyle = '#2788b9';
    context.lineWidth = 4;
    context.beginPath();
    for (let i = 0; i < 25; i++) context.lineTo(325 + i * 7, 230 + Math.sin(i * 0.5) * 48);
    context.stroke();
    const texture = new THREE.CanvasTexture(screen);
    mesh(
      control,
      'Tela CNC',
      new THREE.PlaneGeometry(0.82, 0.55),
      new THREE.MeshStandardMaterial({
        map: texture,
        emissive: '#4f9bb6',
        emissiveIntensity: 0.24,
      }),
      [0, 0.22, 0.127],
    );
  }
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 12; c++)
      box(
        control,
        'Tecla',
        [-0.39 + c * 0.07, -0.18 - r * 0.068, 0.11],
        [0.046, 0.035, 0.017],
        r === 3 && c < 3 ? blue : white,
        0.002,
      );
  cyl(control, 'Emergência', [-0.38, -0.51, 0.12], 0.066, 0.05, red, 'z');
  cyl(control, 'Seletor', [0.35, -0.5, 0.12], 0.055, 0.04, black, 'z');
  box(shell, 'Carcaça', [0.3, 4.7, -1.17], [2.35, 0.42, 1.15], skin);
  for (let i = 0; i < 9; i++)
    box(
      shell,
      'Carcaça',
      [-0.4, 4.56 + i * 0.032, -0.586],
      [0.65, 0.012, 0.015],
      windowMaterial,
      0,
    );
  cyl(root, 'Exaustor', [1.5, 4.68, -1.4], 0.4, 0.38, satin, 'z');
  Object.entries(parts).forEach(([id, p]) =>
    p.group.traverse((o) => {
      o.userData.componentId = id;
    }),
  );
  const coolant = new THREE.Group();
  root.add(coolant);
  for (let i = 0; i < 16; i++)
    mesh(coolant, 'Cavaco', new THREE.SphereGeometry(0.012, 4, 4), steel, [
      -0.63 + Math.cos(i * 2.4) * 0.22,
      1.7,
      0.55 + Math.sin(i * 2.4) * 0.2,
    ]);
  const leaders = Object.fromEntries(
    Object.entries(parts).map(([id, p]) => {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(...p.center),
          new THREE.Vector3(...p.anchor),
        ]),
        new THREE.LineBasicMaterial({
          color: '#25ad91',
          transparent: true,
          opacity: 0.5,
          depthTest: false,
        }),
      );
      line.renderOrder = 25;
      root.add(line);
      return [id, line];
    }),
  ) as Record<ComponentId, THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>>;
  return {
    leaders,
    root,
    shell,
    shellMaterials,
    parts,
    coolant,
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          geometries.add(o.geometry);
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => materials.add(m));
        }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => {
        if ('map' in m) (m.map as THREE.Texture | null)?.dispose();
        m.dispose();
      });
    },
  };
}
