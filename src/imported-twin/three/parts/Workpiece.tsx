import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK, BLOCK_FACES, DRILL_OPERATIONS } from '../../twin/workpiece';
import type { CycleState } from '../../twin/cycle';

/** Real apertures with recessed, stepped walls and a moving blind-hole floor.
 * Uncut apertures are closed by coplanar aluminium disks, never dark decals. */
export function Workpiece({ cycle }: { cycle: () => CycleState }) {
  const model = useMemo(() => {
    const group = new THREE.Group();
    group.name = 'aluminium-workpiece';
    const aluminium = new THREE.MeshStandardMaterial({
      color: '#cbd0d5',
      metalness: 0.6,
      roughness: 0.38,
      side: THREE.DoubleSide,
    });
    const inside = new THREE.MeshStandardMaterial({
      color: '#aeb7c0',
      metalness: 0.88,
      roughness: 0.24,
      side: THREE.DoubleSide,
    });
    const geometries: THREE.BufferGeometry[] = [];
    const cavities: { cup: THREE.Mesh; floor: THREE.Mesh; radius: number; depth: number }[] = [];
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
      geometries.push(geometry);
      const result = new THREE.Mesh(geometry, material);
      result.userData.noTint = true;
      result.castShadow = true;
      result.receiveShadow = true;
      return result;
    };
    for (const face of BLOCK_FACES) {
      const surface = new THREE.Group();
      surface.position.set(...face.center);
      surface.rotation.set(...face.rotation);
      group.add(surface);
      const shape = new THREE.Shape(),
        w = face.width / 2,
        h = face.height / 2;
      shape.moveTo(-w, -h);
      shape.lineTo(w, -h);
      shape.lineTo(w, h);
      shape.lineTo(-w, h);
      shape.closePath();
      for (const hole of face.holes) {
        const path = new THREE.Path();
        path.absarc(hole.u, hole.v, hole.radius, 0, 2 * Math.PI, true);
        shape.holes.push(path);
      }
      surface.add(mesh(new THREE.ShapeGeometry(shape, 32), aluminium));
      for (const hole of face.holes) {
        const r = hole.radius,
          d = hole.depth;
        const profile = [
          [r, 0],
          [r * 0.88, d * 0.1],
          [r * 0.88, d * 0.3],
          [r * 0.53, d * 0.42],
          [r * 0.53, d],
        ].map(([x, y]) => new THREE.Vector2(x, y));
        const cup = mesh(new THREE.LatheGeometry(profile, 64).rotateX(-Math.PI / 2), inside);
        cup.position.set(hole.u, hole.v, 0);
        cup.visible = false;
        surface.add(cup);
        // Match ShapeGeometry's 2 * curveSegments vertices: the untouched cap
        // must meet the face exactly, with no dark polygon gaps around it.
        const floor = mesh(new THREE.CircleGeometry(1, 64), aluminium);
        floor.position.set(hole.u, hole.v, 0);
        floor.scale.set(r, r, 1);
        surface.add(floor);
        cavities.push({ cup, floor, radius: r, depth: d });
      }
    }
    const bottom = mesh(new THREE.PlaneGeometry(BLOCK.width, BLOCK.depth), aluminium);
    bottom.rotation.x = Math.PI / 2;
    bottom.position.y = BLOCK.bottom;
    group.add(bottom);
    return { group, cavities, geometries, aluminium, inside };
  }, []);
  useEffect(
    () => () => {
      model.geometries.forEach((g) => g.dispose());
      model.aluminium.dispose();
      model.inside.dispose();
    },
    [model],
  );
  useFrame(() => {
    const state = cycle();
    model.cavities.forEach((hole, i) => {
      const progress =
        i < state.completed ? 1 : i === state.hole && state.cutting ? state.penetration : 0;
      hole.cup.visible = progress > 0;
      hole.cup.scale.z = Math.max(0.0001, progress);
      hole.floor.position.z = -hole.depth * progress;
      const radius = hole.radius * (1 - 0.47 * Math.min(1, progress / 0.08));
      hole.floor.scale.set(radius, radius, 1);
    });
    model.group.userData.completedHoles = state.completed;
    model.group.userData.totalHoles = DRILL_OPERATIONS.length;
  });
  return <primitive object={model.group} />;
}
