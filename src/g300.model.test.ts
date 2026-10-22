import { describe, it, expect, vi } from 'vitest';
import { Mesh, Box3, Vector3 } from 'three';
import { createG300Model, setShellTransparency } from './g300.model';
import { componentIds } from './twin-engine';
describe('G300 semantic geometry', () => {
  it('keeps only the enclosure transparent in X-ray mode', () => {
    const stub = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const model = createG300Model();
    setShellTransparency(model, true);
    model.shellMaterials.forEach((m) => {
      expect(m.opacity).toBe(0.12);
      expect(m.depthWrite).toBe(false);
    });
    componentIds.forEach((id) =>
      model.parts[id].materials.forEach((m) => expect(m.opacity).toBe(1)),
    );
    setShellTransparency(model, false);
    model.shellMaterials.forEach((m) => expect(m.opacity).toBe(1));
    model.dispose();
    stub.mockRestore();
  });
  it('contains volumetric assemblies with separate pivots and selectable descendants', () => {
    const stub = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const model = createG300Model();
    componentIds.forEach((id) => {
      const part = model.parts[id];
      expect(part.rotor.parent).toBe(part.group);
      const bounds = new Box3().setFromObject(part.group).getSize(new Vector3());
      expect(Math.min(bounds.x, bounds.y, bounds.z)).toBeGreaterThan(0.1);
      part.group.traverse((object) => {
        if (object instanceof Mesh) expect(object.userData.componentId).toBe(id);
      });
    });
    expect(model.parts.motor.materials[0]).not.toBe(model.parts.pump1.materials[0]);
    model.dispose();
    stub.mockRestore();
  });
});
