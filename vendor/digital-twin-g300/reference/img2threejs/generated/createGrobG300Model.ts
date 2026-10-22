import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type SculptMaterialSpec = Record<string, any>;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((part) => part + part).join('')
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized.slice(1), 16) : 0x8a7a5f;
  return [clampAlbedoChannel((value >> 16) & 255), clampAlbedoChannel((value >> 8) & 255), clampAlbedoChannel(value & 255)];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0) return palette.filter((value) => typeof value === 'string');
  const secondary = spec.albedo?.secondary;
  const colors = [spec.baseColor ?? spec.color ?? spec.albedo?.dominant, ...(Array.isArray(secondary) ? secondary : [])];
  return colors.filter((value): value is string => typeof value === 'string' && value.startsWith('#'));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampAlbedoChannel(value: number): number {
  return Math.max(30, Math.min(240, Math.round(value)));
}

function clampPbrF0(value: number): number {
  return Math.max(0.02, Math.min(1, value));
}

function clampPbrIor(value: number): number {
  return Math.max(1, Math.min(2.5, value));
}

function clampPbrMetalness(value: number): number {
  return value >= 0.5 ? 1 : 0;
}

function clampedAlbedoColor(spec: SculptMaterialSpec): THREE.Color {
  const source = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  // setStyle with an explicit SRGBColorSpace, NOT the numeric constructor.
  //
  // `new THREE.Color(r, g, b)` treats its arguments as LINEAR working-space components,
  // while an authored `baseColor` hex is sRGB. Feeding one to the other skipped the
  // transfer function and lifted every dark albedo: #2e2a28, authored as a near-black
  // vinyl, rendered at roughly sRGB 0.46 — a mid grey. The error is largest exactly where
  // it matters most, because the transfer curve is steepest near black.
  return new THREE.Color().setStyle(source, THREE.SRGBColorSpace);
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(x: number, y: number, seed: number, periodX: number, periodY: number): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value = Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, seed: number, periodX: number, periodY: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === 'number' ? band.frequency : 0;
    const amplitude = typeof band.amplitude === 'number' ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description = `${String(band.pattern ?? '')} ${String(band.role ?? '')}`.toLowerCase();
    return [{
      frequency,
      amplitude,
      stretchX: typeof stretch[0] === 'number' ? Math.max(0.1, stretch[0]) : 1,
      stretchY: typeof stretch[1] === 'number' ? Math.max(0.1, stretch[1]) : 1,
      ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
    }];
  });
  return parsed.length > 0 ? parsed : [
    { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
  ];
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY);
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

type ColorGradientStop = { offset: number; color: string };
type ColorGradientSpec = {
  type: 'linear' | 'radial';
  axis: [number, number];
  stops: ColorGradientStop[];
};

function parseRgba(value: string): [number, number, number] {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!match) return [138, 122, 95];
  return [clampAlbedoChannel(Number(match[1])), clampAlbedoChannel(Number(match[2])), clampAlbedoChannel(Number(match[3]))];
}

// Analytical per-pixel gradient sample. The extraction schema's colorGradient carries
// exact rgba(...) stop colors (see extract_part_color_recipe.py), so this samples the
// same trend directly in JS math rather than round-tripping through a Canvas 2D
// createLinearGradient/createRadialGradient object — same visual result, and it composes
// directly with the existing noise/height-correlated colorVariation blend below.
function sampleColorGradient(gradient: ColorGradientSpec, u: number, v: number): [number, number, number] {
  const stops = gradient.stops.length >= 2 ? gradient.stops : [{ offset: 0, color: 'rgba(138,122,95,1)' }, { offset: 1, color: 'rgba(138,122,95,1)' }];
  let t: number;
  if (gradient.type === 'radial') {
    const [cx, cy] = gradient.axis;
    const dx = u - cx;
    const dy = v - cy;
    const maxRadius = Math.max(0.001, Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy)));
    t = clamp01(Math.hypot(dx, dy) / maxRadius);
  } else {
    const [ax, ay] = gradient.axis;
    const projection = (u - 0.5) * ax + (v - 0.5) * ay;
    const maxProjection = 0.5 * (Math.abs(ax) + Math.abs(ay)) || 0.5;
    t = clamp01(projection / maxProjection + 0.5);
  }
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)));
  const mix = scaled - index;
  const a = parseRgba(stops[index].color);
  const b = parseRgba(stops[index + 1].color);
  return [
    THREE.MathUtils.lerp(a[0], b[0], mix),
    THREE.MathUtils.lerp(a[1], b[1], mix),
    THREE.MathUtils.lerp(a[2], b[2], mix),
  ];
}

function writePixel(data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 2,
    typeof repeat[1] === 'number' ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: 'reference-pixel-extraction' | 'procedural';
};

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== 'object') return null;
  if (reference.usable === false) return null;
  const confidence = typeof reference.confidence === 'number'
    ? reference.confidence
    : (typeof reference.estimatedFidelity === 'number' ? reference.estimatedFidelity : 0);
  const threshold = typeof reference.targetThreshold === 'number' ? reference.targetThreshold : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== 'object') return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== 'object') return null;
  const record = map as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : record.path;
  return typeof url === 'string' && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 1,
    typeof repeat[1] === 'number' ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

function makeReferenceTextureSet(spec: SculptMaterialSpec, options: ProceduralModelOptions): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, 'albedo');
  const roughness = referenceMapUrl(spec, 'roughness');
  const height = referenceMapUrl(spec, 'height');
  const normal = referenceMapUrl(spec, 'normal');
  const ao = referenceMapUrl(spec, 'ao');
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: 'reference-pixel-extraction',
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === 'undefined') return null;
  const qualityFirst = (options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity';
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : (qualityFirst ? 1024 : 512);
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))));
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext('2d'),
    roughness: canvases.roughness.getContext('2d'),
    height: canvases.height.getContext('2d'),
    normal: canvases.normal.getContext('2d'),
    ao: canvases.ao.getContext('2d'),
  };
  if (!contexts.albedo || !contexts.roughness || !contexts.height || !contexts.normal || !contexts.ao) return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  const colors = (palette.length >= 2 ? palette : [fallback, '#6E614B', '#A08F70']).map(hexToRgb);
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ['base'], 0.76));
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ['variation'], 0.18));
  const colorAmplitude = clamp01(readLayerNumber(spec.colorVariation, ['amplitude', 'variation'], 0.18));
  const heightCorrelation = clamp01(readLayerNumber(spec.colorVariation, ['heightCorrelation'], 0.3));
  const colorGradient: ColorGradientSpec | undefined = spec.colorGradient;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2);
      let color: [number, number, number];
      if (colorGradient) {
        // Evidence-derived spatial gradient (Plan 1.3 Workstream C) takes priority
        // over the noise-based palette blend below — it is a measured trend, not a guess.
        color = sampleColorGradient(colorGradient, u, v);
      } else {
        const paletteValue = clamp01(
          0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation
        );
        color = mixPalette(colors, paletteValue);
      }
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35));
  const aoStrength = clamp01(readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35));
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6;
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage = (
        heightField[y * size + left] + heightField[y * size + right]
        + heightField[up + x] + heightField[down + x]
      ) * 0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte);
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte);
      writePixel(
        images.normal.data, offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: 'procedural',
  };
}

function createSculptMaterial(id: string, spec: SculptMaterialSpec, options: ProceduralModelOptions, denseComponent = false): THREE.MeshPhysicalMaterial {
  // A material that declares -- with evidence -- that its subject carries no texture
  // detail gets NO texture set. Synthesising one anyway is not a harmless default: the
  // branch below then forces color to white and roughness to 1 and reads both from the
  // generated maps, so the authored albedo and the reference-derived roughness are both
  // discarded, and the model gains mottling the reference does not have. Measured on the
  // tuxedo cat, whose black fur rendered as speckled grey-and-white from a palette that
  // only ever described two flat regions.
  const textureless = (spec.textureless as { declared?: boolean } | undefined)?.declared === true;
  const textures = textureless
    ? null
    : makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options);
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : clampedAlbedoColor(spec),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ['base'], 0.76)),
    metalness: clampPbrMetalness(readLayerNumber(spec.metalness, ['base'], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ['base', 'amount'], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ['base'], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ['base', 'amount'], 0)),
    ior: clampPbrIor(readLayerNumber(spec.ior, ['base', 'value'], 1.5)),
    thickness: Math.max(0, readLayerNumber(spec.thickness, ['base', 'amount'], 0)),
    attenuationDistance: Math.max(0.001, readLayerNumber(spec.attenuationDistance, ['base', 'value'], Infinity)),
    attenuationColor: new THREE.Color(typeof spec.attenuationColor === 'string' ? spec.attenuationColor : '#ffffff'),
    sheen: clamp01(readLayerNumber(spec.sheen, ['base', 'amount'], 0)),
    sheenColor: new THREE.Color(typeof spec.sheenColor === 'string' ? spec.sheenColor : '#ffffff'),
    sheenRoughness: clamp01(readLayerNumber(spec.sheenRoughness, ['base'], 1.0)),
    iridescence: clamp01(readLayerNumber(spec.iridescence, ['base', 'amount'], 0)),
    iridescenceIOR: clampPbrIor(readLayerNumber(spec.iridescenceIOR, ['base', 'value'], 1.3)),
    anisotropy: clamp01(readLayerNumber(spec.anisotropy, ['base', 'amount'], 0)),
    anisotropyRotation: readLayerNumber(spec.anisotropy, ['rotation'], 0),
    specularIntensity: clampPbrF0(readLayerNumber(spec.specularF0 ?? spec.f0 ?? spec.specularIntensity, ['base', 'value'], 1.0)),
    specularColor: new THREE.Color(typeof spec.specularColor === 'string' ? spec.specularColor : '#ffffff'),
    emissive: new THREE.Color(typeof spec.emissive === 'string' ? spec.emissive : '#000000'),
    emissiveIntensity: Math.max(0, readLayerNumber(spec.emissiveIntensity, ['base'], 1.0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ['base'], 1)),
    transparent: readLayerNumber(spec.transmission, ['base', 'amount'], 0) > 0 || readLayerNumber(spec.opacity, ['base'], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ['cutoff', 'alphaTest'], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
    flatShading: spec.flatShading === true,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35)));
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35);
    const denseMesh = denseComponent || spec.denseMesh === true || spec.geometryDensity === 'dense' || spec.topologyClass === 'dense';
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ['amplitude', 'strength'], 0));
    const effectiveBumpScale = denseMesh ? Math.max(0.05, bumpScale) : bumpScale;
    if (effectiveBumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = effectiveBumpScale;
    }
    const displacementScale = Math.max(0, readLayerNumber(spec.displacement, ['amplitude', 'strength'], 0));
    const effectiveDisplacementScale = denseMesh ? Math.max(0.005, displacementScale) : displacementScale;
    if (effectiveDisplacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = effectiveDisplacementScale;
      material.displacementBias = -effectiveDisplacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ['envMapIntensity'], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrConstraints = { albedoRange: [30, 240], binaryMetalness: true, f0Range: [0.02, 1], iorRange: [1, 2.5] };
  material.userData.pbrTextureSource = textures?.source ?? 'flat-fallback';
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.userData.referenceMaterialId = spec.referenceMaterialId ?? spec.materialReference?.profileId ?? null;
  material.userData.materialEvidence = spec.materialEvidence ?? null;
  material.userData.validationViews = spec.materialReference?.validationViews ?? [];
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number')) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55));
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: GROB G300 machining centre
// Sculpt build pass: blockout
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createGROBG300MachiningCentreModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "GROB G300 machining centre";
  root.userData.reconstructionEvidence = {"itemFamily": null, "subtype": null, "componentAdapter": null, "route": null, "exactnessTier": null, "referenceCamera": {"solved": false, "fovDegrees": 40.0, "aspect": 1.0, "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [0.0, 0.0, 3.0], "note": "For likeness work, solve the reference camera (forge/stage1_intake/solve_camera_pose.py) so the review render aligns with the photo and the reference can be projected. Confirm by overlay review."}, "approximationNotes": []};
  root.userData.materialPipeline = {};
  root.userData.materialReferenceRegistry = null;

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["shell-white"] = createSculptMaterial(
    "shell-white",
    {"id": "shell-white", "name": "Painted sheet metal, white satin", "type": "standard", "shaderModel": "MeshStandardMaterial", "baseColor": "#E7E9EA", "color": "#E7E9EA", "albedo": {"dominant": "#E7E9EA", "secondary": ["#D5D8DB"], "samplingNotes": "Sampled from flat-lit regions of the reference render."}, "metalness": 0.1, "roughness": {"base": 0.55, "variation": 0.08}, "localOverrides": [{"id": "shell-white-edge-ao", "kind": "ambient-occlusion", "notes": "darken seams and bay cavities"}], "dirt": {"amount": 0.05, "cavityBias": 0.3}, "textureless": {"declared": true, "evidence": ["Reference is a studio CG render: 3x3 zone crops of this material show uniform albedo with only lighting gradients, no grain, print or pores at 707x600."]}},
    options
  );
  materialMap["shell-grey"] = createSculptMaterial(
    "shell-grey",
    {"id": "shell-grey", "name": "Inner panels and plinth, grey satin", "type": "standard", "shaderModel": "MeshStandardMaterial", "baseColor": "#C3C8CD", "color": "#C3C8CD", "albedo": {"dominant": "#C3C8CD", "secondary": ["#A9AFB5"], "samplingNotes": "Sampled from flat-lit regions of the reference render."}, "metalness": 0.15, "roughness": {"base": 0.6, "variation": 0.08}, "localOverrides": [{"id": "shell-grey-edge-ao", "kind": "ambient-occlusion", "notes": "darken seams and bay cavities"}], "dirt": {"amount": 0.05, "cavityBias": 0.3}, "textureless": {"declared": true, "evidence": ["Reference is a studio CG render: 3x3 zone crops of this material show uniform albedo with only lighting gradients, no grain, print or pores at 707x600."]}},
    options
  );
  materialMap["grob-blue"] = createSculptMaterial(
    "grob-blue",
    {"id": "grob-blue", "name": "Roof band, vivid blue mid value", "type": "standard", "shaderModel": "MeshStandardMaterial", "baseColor": "#1F4FA0", "color": "#1F4FA0", "albedo": {"dominant": "#1F4FA0", "secondary": ["#173F82"], "samplingNotes": "Sampled from flat-lit regions of the reference render."}, "metalness": 0.2, "roughness": {"base": 0.45, "variation": 0.08}, "localOverrides": [{"id": "grob-blue-edge-ao", "kind": "ambient-occlusion", "notes": "darken seams and bay cavities"}], "dirt": {"amount": 0.05, "cavityBias": 0.3}, "textureless": {"declared": true, "evidence": ["Reference is a studio CG render: 3x3 zone crops of this material show uniform albedo with only lighting gradients, no grain, print or pores at 707x600."]}},
    options
  );
  materialMap["steel"] = createSculptMaterial(
    "steel",
    {"id": "steel", "name": "Machined steel, spindle and table", "type": "standard", "shaderModel": "MeshStandardMaterial", "baseColor": "#A9AEB4", "color": "#A9AEB4", "albedo": {"dominant": "#A9AEB4", "secondary": ["#8C9298"], "samplingNotes": "Sampled from flat-lit regions of the reference render."}, "metalness": 0.85, "roughness": {"base": 0.3, "variation": 0.08}, "localOverrides": [{"id": "steel-edge-ao", "kind": "ambient-occlusion", "notes": "darken seams and bay cavities"}], "dirt": {"amount": 0.05, "cavityBias": 0.3}, "textureless": {"declared": true, "evidence": ["Reference is a studio CG render: 3x3 zone crops of this material show uniform albedo with only lighting gradients, no grain, print or pores at 707x600."]}},
    options
  );
  materialMap["cast-white"] = createSculptMaterial(
    "cast-white",
    {"id": "cast-white", "name": "Trunnion casting, white", "type": "standard", "shaderModel": "MeshStandardMaterial", "baseColor": "#ECEDEC", "color": "#ECEDEC", "albedo": {"dominant": "#ECEDEC", "secondary": ["#DADCDC"], "samplingNotes": "Sampled from flat-lit regions of the reference render."}, "metalness": 0.05, "roughness": {"base": 0.5, "variation": 0.08}, "localOverrides": [{"id": "cast-white-edge-ao", "kind": "ambient-occlusion", "notes": "darken seams and bay cavities"}], "dirt": {"amount": 0.05, "cavityBias": 0.3}, "textureless": {"declared": true, "evidence": ["Reference is a studio CG render: 3x3 zone crops of this material show uniform albedo with only lighting gradients, no grain, print or pores at 707x600."]}},
    options
  );
  materialMap["accumulator-red"] = createSculptMaterial(
    "accumulator-red",
    {"id": "accumulator-red", "name": "Bladder accumulator, red gloss", "type": "standard", "shaderModel": "MeshStandardMaterial", "baseColor": "#C42A2A", "color": "#C42A2A", "albedo": {"dominant": "#C42A2A", "secondary": ["#9E2020"], "samplingNotes": "Sampled from flat-lit regions of the reference render."}, "metalness": 0.2, "roughness": {"base": 0.35, "variation": 0.08}, "localOverrides": [{"id": "accumulator-red-edge-ao", "kind": "ambient-occlusion", "notes": "darken seams and bay cavities"}], "dirt": {"amount": 0.05, "cavityBias": 0.3}, "textureless": {"declared": true, "evidence": ["Reference is a studio CG render: 3x3 zone crops of this material show uniform albedo with only lighting gradients, no grain, print or pores at 707x600."]}},
    options
  );
  materialMap["glass"] = createSculptMaterial(
    "glass",
    {"id": "glass", "name": "Window glass", "type": "standard", "shaderModel": "MeshStandardMaterial", "baseColor": "#8FA3B3", "color": "#8FA3B3", "albedo": {"dominant": "#8FA3B3", "secondary": ["#6F8291"], "samplingNotes": "Sampled from flat-lit regions of the reference render."}, "metalness": 0.0, "roughness": {"base": 0.05, "variation": 0.08}, "localOverrides": [{"id": "glass-edge-ao", "kind": "ambient-occlusion", "notes": "darken seams and bay cavities"}], "dirt": {"amount": 0.05, "cavityBias": 0.3}, "textureless": {"declared": true, "evidence": ["Reference is a studio CG render: 3x3 zone crops of this material show uniform albedo with only lighting gradients, no grain, print or pores at 707x600."]}},
    options
  );
  materialMap["motor-grey"] = createSculptMaterial(
    "motor-grey",
    {"id": "motor-grey", "name": "Motor housings", "type": "standard", "shaderModel": "MeshStandardMaterial", "baseColor": "#B7BCC2", "color": "#B7BCC2", "albedo": {"dominant": "#B7BCC2", "secondary": ["#9AA0A6"], "samplingNotes": "Sampled from flat-lit regions of the reference render."}, "metalness": 0.4, "roughness": {"base": 0.45, "variation": 0.08}, "localOverrides": [{"id": "motor-grey-edge-ao", "kind": "ambient-occlusion", "notes": "darken seams and bay cavities"}], "dirt": {"amount": 0.05, "cavityBias": 0.3}, "textureless": {"declared": true, "evidence": ["Reference is a studio CG render: 3x3 zone crops of this material show uniform albedo with only lighting gradients, no grain, print or pores at 707x600."]}},
    options
  );
  materialMap["hmi"] = createSculptMaterial(
    "hmi",
    {"id": "hmi", "name": "HMI screen, emissive", "type": "standard", "shaderModel": "MeshStandardMaterial", "baseColor": "#5AA7E0", "color": "#5AA7E0", "albedo": {"dominant": "#5AA7E0", "secondary": ["#2D6C9C"], "samplingNotes": "Sampled from flat-lit regions of the reference render."}, "metalness": 0.0, "roughness": {"base": 0.2, "variation": 0.08}, "localOverrides": [{"id": "hmi-edge-ao", "kind": "ambient-occlusion", "notes": "darken seams and bay cavities"}], "dirt": {"amount": 0.05, "cavityBias": 0.3}, "textureless": {"declared": true, "evidence": ["Reference is a studio CG render: 3x3 zone crops of this material show uniform albedo with only lighting gradients, no grain, print or pores at 707x600."]}},
    options
  );
  materialMap["rubber-black"] = createSculptMaterial(
    "rubber-black",
    {"id": "rubber-black", "name": "Seals, handles, keypad", "type": "standard", "shaderModel": "MeshStandardMaterial", "baseColor": "#1E2226", "color": "#1E2226", "albedo": {"dominant": "#1E2226", "secondary": ["#33383D"], "samplingNotes": "Sampled from flat-lit regions of the reference render."}, "metalness": 0.0, "roughness": {"base": 0.7, "variation": 0.08}, "localOverrides": [{"id": "rubber-black-edge-ao", "kind": "ambient-occlusion", "notes": "darken seams and bay cavities"}], "dirt": {"amount": 0.05, "cavityBias": 0.3}, "textureless": {"declared": true, "evidence": ["Reference is a studio CG render: 3x3 zone crops of this material show uniform albedo with only lighting gradients, no grain, print or pores at 707x600."]}},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const endpoint_root_0 = makeAttachmentEndpoint(null);
  const node_root_0 = new THREE.Group();
  node_root_0.name = "GROB G300 machining centre__pivot";
  node_root_0.scale.set(1, 1, 1);
  if (endpoint_root_0) {
    node_root_0.position.copy(endpoint_root_0.start);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_root_0.position.set(0.0, 0.0, 0.0);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  }
  node_root_0.userData.sculptComponent = {"id": "root", "name": "GROB G300 machining centre", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": null, "attachment": null, "dimensions": {"width": 2.4, "height": 3.0, "depth": 3.6, "units": "m", "confidence": 0.6}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-white", "materialLayers": ["shell-white"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(231, 233, 234, 1.0)", "secondaryAlbedo": "rgba(213, 216, 219, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_root_0.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_root_0);
  nodes["root"] = node_root_0;
  const mesh_root_0Geometry = endpoint_root_0
    ? new THREE.CylinderGeometry(endpoint_root_0.endRadius, endpoint_root_0.baseRadius, endpoint_root_0.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_root_0) {
    mesh_root_0Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_root_0 = new THREE.Mesh(
    mesh_root_0Geometry,
    materialMap["shell-white"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_root_0.name = "GROB G300 machining centre";
  if (endpoint_root_0) {
    mesh_root_0.position.copy(endpoint_root_0.midpoint);
    mesh_root_0.quaternion.copy(endpoint_root_0.quaternion);
  }
  mesh_root_0.castShadow = options.castShadow ?? true;
  mesh_root_0.receiveShadow = options.receiveShadow ?? true;
  mesh_root_0.userData.sculptComponent = {"id": "root", "name": "GROB G300 machining centre", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": null, "attachment": null, "dimensions": {"width": 2.4, "height": 3.0, "depth": 3.6, "units": "m", "confidence": 0.6}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-white", "materialLayers": ["shell-white"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(231, 233, 234, 1.0)", "secondaryAlbedo": "rgba(213, 216, 219, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_root_0.add(mesh_root_0);
  meshes["root"] = mesh_root_0;
  colliders["root"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_root_0);

  const endpoint_plinth_1 = makeAttachmentEndpoint(null);
  const node_plinth_1 = new THREE.Group();
  node_plinth_1.name = "Base plinth__pivot";
  node_plinth_1.scale.set(1, 1, 1);
  if (endpoint_plinth_1) {
    node_plinth_1.position.copy(endpoint_plinth_1.start);
    node_plinth_1.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_plinth_1.position.set(0.0, 0.06, 0.0);
    node_plinth_1.rotation.set(0.0, 0.0, 0.0);
  }
  node_plinth_1.userData.sculptComponent = {"id": "plinth", "name": "Base plinth", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 2.4, "height": 0.12, "depth": 3.6, "units": "m", "confidence": 0.6}, "transform": {"position": [0, 0.06, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "leveling-feet", "description": "leveling feet"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_plinth_1.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_plinth_1);
  nodes["plinth"] = node_plinth_1;
  const mesh_plinth_1Geometry = endpoint_plinth_1
    ? new THREE.CylinderGeometry(endpoint_plinth_1.endRadius, endpoint_plinth_1.baseRadius, endpoint_plinth_1.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_plinth_1) {
    mesh_plinth_1Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_plinth_1 = new THREE.Mesh(
    mesh_plinth_1Geometry,
    materialMap["shell-grey"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_plinth_1.name = "Base plinth";
  if (endpoint_plinth_1) {
    mesh_plinth_1.position.copy(endpoint_plinth_1.midpoint);
    mesh_plinth_1.quaternion.copy(endpoint_plinth_1.quaternion);
  }
  mesh_plinth_1.castShadow = options.castShadow ?? true;
  mesh_plinth_1.receiveShadow = options.receiveShadow ?? true;
  mesh_plinth_1.userData.sculptComponent = {"id": "plinth", "name": "Base plinth", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 2.4, "height": 0.12, "depth": 3.6, "units": "m", "confidence": 0.6}, "transform": {"position": [0, 0.06, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "leveling-feet", "description": "leveling feet"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_plinth_1.add(mesh_plinth_1);
  meshes["plinth"] = mesh_plinth_1;
  colliders["plinth"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_plinth_1);

  const endpoint_front_column_2 = makeAttachmentEndpoint(null);
  const node_front_column_2 = new THREE.Group();
  node_front_column_2.name = "Front-left column with G300 lettering__pivot";
  node_front_column_2.scale.set(1, 1, 1);
  if (endpoint_front_column_2) {
    node_front_column_2.position.copy(endpoint_front_column_2.start);
    node_front_column_2.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_front_column_2.position.set(-0.875, 1.16, 1.75);
    node_front_column_2.rotation.set(0.0, 0.0, 0.0);
  }
  node_front_column_2.userData.sculptComponent = {"id": "front-column", "name": "Front-left column with G300 lettering", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.65, "height": 2.08, "depth": 0.1, "units": "m", "confidence": 0.6}, "transform": {"position": [-0.875, 1.16, 1.75], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-white", "materialLayers": ["shell-white"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "g300-vertical-lettering", "description": "g300 vertical lettering"}, {"id": "door-handle", "description": "door handle"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(231, 233, 234, 1.0)", "secondaryAlbedo": "rgba(213, 216, 219, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_front_column_2.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_front_column_2);
  nodes["front-column"] = node_front_column_2;
  const mesh_front_column_2Geometry = endpoint_front_column_2
    ? new THREE.CylinderGeometry(endpoint_front_column_2.endRadius, endpoint_front_column_2.baseRadius, endpoint_front_column_2.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_front_column_2) {
    mesh_front_column_2Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_front_column_2 = new THREE.Mesh(
    mesh_front_column_2Geometry,
    materialMap["shell-white"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_front_column_2.name = "Front-left column with G300 lettering";
  if (endpoint_front_column_2) {
    mesh_front_column_2.position.copy(endpoint_front_column_2.midpoint);
    mesh_front_column_2.quaternion.copy(endpoint_front_column_2.quaternion);
  }
  mesh_front_column_2.castShadow = options.castShadow ?? true;
  mesh_front_column_2.receiveShadow = options.receiveShadow ?? true;
  mesh_front_column_2.userData.sculptComponent = {"id": "front-column", "name": "Front-left column with G300 lettering", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.65, "height": 2.08, "depth": 0.1, "units": "m", "confidence": 0.6}, "transform": {"position": [-0.875, 1.16, 1.75], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-white", "materialLayers": ["shell-white"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "g300-vertical-lettering", "description": "g300 vertical lettering"}, {"id": "door-handle", "description": "door handle"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(231, 233, 234, 1.0)", "secondaryAlbedo": "rgba(213, 216, 219, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_front_column_2.add(mesh_front_column_2);
  meshes["front-column"] = mesh_front_column_2;
  colliders["front-column"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_front_column_2);

  const endpoint_front_lower_wall_3 = makeAttachmentEndpoint(null);
  const node_front_lower_wall_3 = new THREE.Group();
  node_front_lower_wall_3.name = "Work-area front sill__pivot";
  node_front_lower_wall_3.scale.set(1, 1, 1);
  if (endpoint_front_lower_wall_3) {
    node_front_lower_wall_3.position.copy(endpoint_front_lower_wall_3.start);
    node_front_lower_wall_3.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_front_lower_wall_3.position.set(0.125, 0.37, 1.8);
    node_front_lower_wall_3.rotation.set(0.0, 0.0, 0.0);
  }
  node_front_lower_wall_3.userData.sculptComponent = {"id": "front-lower-wall", "name": "Work-area front sill", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 1.35, "height": 0.5, "depth": 0.1, "units": "m", "confidence": 0.6}, "transform": {"position": [0.125, 0.37, 1.8], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-white", "materialLayers": ["shell-white"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "chip-chute-notch", "description": "chip chute notch"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(231, 233, 234, 1.0)", "secondaryAlbedo": "rgba(213, 216, 219, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_front_lower_wall_3.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_front_lower_wall_3);
  nodes["front-lower-wall"] = node_front_lower_wall_3;
  const mesh_front_lower_wall_3Geometry = endpoint_front_lower_wall_3
    ? new THREE.CylinderGeometry(endpoint_front_lower_wall_3.endRadius, endpoint_front_lower_wall_3.baseRadius, endpoint_front_lower_wall_3.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_front_lower_wall_3) {
    mesh_front_lower_wall_3Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_front_lower_wall_3 = new THREE.Mesh(
    mesh_front_lower_wall_3Geometry,
    materialMap["shell-white"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_front_lower_wall_3.name = "Work-area front sill";
  if (endpoint_front_lower_wall_3) {
    mesh_front_lower_wall_3.position.copy(endpoint_front_lower_wall_3.midpoint);
    mesh_front_lower_wall_3.quaternion.copy(endpoint_front_lower_wall_3.quaternion);
  }
  mesh_front_lower_wall_3.castShadow = options.castShadow ?? true;
  mesh_front_lower_wall_3.receiveShadow = options.receiveShadow ?? true;
  mesh_front_lower_wall_3.userData.sculptComponent = {"id": "front-lower-wall", "name": "Work-area front sill", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 1.35, "height": 0.5, "depth": 0.1, "units": "m", "confidence": 0.6}, "transform": {"position": [0.125, 0.37, 1.8], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-white", "materialLayers": ["shell-white"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "chip-chute-notch", "description": "chip chute notch"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(231, 233, 234, 1.0)", "secondaryAlbedo": "rgba(213, 216, 219, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_front_lower_wall_3.add(mesh_front_lower_wall_3);
  meshes["front-lower-wall"] = mesh_front_lower_wall_3;
  colliders["front-lower-wall"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_front_lower_wall_3);

  const endpoint_front_right_pillar_4 = makeAttachmentEndpoint(null);
  const node_front_right_pillar_4 = new THREE.Group();
  node_front_right_pillar_4.name = "Front-right frame pillar__pivot";
  node_front_right_pillar_4.scale.set(1, 1, 1);
  if (endpoint_front_right_pillar_4) {
    node_front_right_pillar_4.position.copy(endpoint_front_right_pillar_4.start);
    node_front_right_pillar_4.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_front_right_pillar_4.position.set(1.0, 1.16, 1.75);
    node_front_right_pillar_4.rotation.set(0.0, 0.0, 0.0);
  }
  node_front_right_pillar_4.userData.sculptComponent = {"id": "front-right-pillar", "name": "Front-right frame pillar", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.4, "height": 2.08, "depth": 0.1, "units": "m", "confidence": 0.6}, "transform": {"position": [1.0, 1.16, 1.75], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-white", "materialLayers": ["shell-white"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(231, 233, 234, 1.0)", "secondaryAlbedo": "rgba(213, 216, 219, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_front_right_pillar_4.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_front_right_pillar_4);
  nodes["front-right-pillar"] = node_front_right_pillar_4;
  const mesh_front_right_pillar_4Geometry = endpoint_front_right_pillar_4
    ? new THREE.CylinderGeometry(endpoint_front_right_pillar_4.endRadius, endpoint_front_right_pillar_4.baseRadius, endpoint_front_right_pillar_4.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_front_right_pillar_4) {
    mesh_front_right_pillar_4Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_front_right_pillar_4 = new THREE.Mesh(
    mesh_front_right_pillar_4Geometry,
    materialMap["shell-white"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_front_right_pillar_4.name = "Front-right frame pillar";
  if (endpoint_front_right_pillar_4) {
    mesh_front_right_pillar_4.position.copy(endpoint_front_right_pillar_4.midpoint);
    mesh_front_right_pillar_4.quaternion.copy(endpoint_front_right_pillar_4.quaternion);
  }
  mesh_front_right_pillar_4.castShadow = options.castShadow ?? true;
  mesh_front_right_pillar_4.receiveShadow = options.receiveShadow ?? true;
  mesh_front_right_pillar_4.userData.sculptComponent = {"id": "front-right-pillar", "name": "Front-right frame pillar", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.4, "height": 2.08, "depth": 0.1, "units": "m", "confidence": 0.6}, "transform": {"position": [1.0, 1.16, 1.75], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-white", "materialLayers": ["shell-white"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(231, 233, 234, 1.0)", "secondaryAlbedo": "rgba(213, 216, 219, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_front_right_pillar_4.add(mesh_front_right_pillar_4);
  meshes["front-right-pillar"] = mesh_front_right_pillar_4;
  colliders["front-right-pillar"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_front_right_pillar_4);

  const endpoint_workarea_back_5 = makeAttachmentEndpoint(null);
  const node_workarea_back_5 = new THREE.Group();
  node_workarea_back_5.name = "Work-area rear wall__pivot";
  node_workarea_back_5.scale.set(1, 1, 1);
  if (endpoint_workarea_back_5) {
    node_workarea_back_5.position.copy(endpoint_workarea_back_5.start);
    node_workarea_back_5.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_workarea_back_5.position.set(0.125, 1.41, 0.2);
    node_workarea_back_5.rotation.set(0.0, 0.0, 0.0);
  }
  node_workarea_back_5.userData.sculptComponent = {"id": "workarea-back", "name": "Work-area rear wall", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 1.35, "height": 1.58, "depth": 0.06, "units": "m", "confidence": 0.6}, "transform": {"position": [0.125, 1.41, 0.2], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "spindle-port", "description": "spindle port"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_workarea_back_5.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_workarea_back_5);
  nodes["workarea-back"] = node_workarea_back_5;
  const mesh_workarea_back_5Geometry = endpoint_workarea_back_5
    ? new THREE.CylinderGeometry(endpoint_workarea_back_5.endRadius, endpoint_workarea_back_5.baseRadius, endpoint_workarea_back_5.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_workarea_back_5) {
    mesh_workarea_back_5Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_workarea_back_5 = new THREE.Mesh(
    mesh_workarea_back_5Geometry,
    materialMap["shell-grey"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_workarea_back_5.name = "Work-area rear wall";
  if (endpoint_workarea_back_5) {
    mesh_workarea_back_5.position.copy(endpoint_workarea_back_5.midpoint);
    mesh_workarea_back_5.quaternion.copy(endpoint_workarea_back_5.quaternion);
  }
  mesh_workarea_back_5.castShadow = options.castShadow ?? true;
  mesh_workarea_back_5.receiveShadow = options.receiveShadow ?? true;
  mesh_workarea_back_5.userData.sculptComponent = {"id": "workarea-back", "name": "Work-area rear wall", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 1.35, "height": 1.58, "depth": 0.06, "units": "m", "confidence": 0.6}, "transform": {"position": [0.125, 1.41, 0.2], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "spindle-port", "description": "spindle port"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_workarea_back_5.add(mesh_workarea_back_5);
  meshes["workarea-back"] = mesh_workarea_back_5;
  colliders["workarea-back"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_workarea_back_5);

  const endpoint_workarea_left_6 = makeAttachmentEndpoint(null);
  const node_workarea_left_6 = new THREE.Group();
  node_workarea_left_6.name = "Work-area left wall with telescopic covers__pivot";
  node_workarea_left_6.scale.set(1, 1, 1);
  if (endpoint_workarea_left_6) {
    node_workarea_left_6.position.copy(endpoint_workarea_left_6.start);
    node_workarea_left_6.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_workarea_left_6.position.set(-0.55, 1.41, 0.97);
    node_workarea_left_6.rotation.set(0.0, 0.0, 0.0);
  }
  node_workarea_left_6.userData.sculptComponent = {"id": "workarea-left", "name": "Work-area left wall with telescopic covers", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.04, "height": 1.58, "depth": 1.55, "units": "m", "confidence": 0.6}, "transform": {"position": [-0.55, 1.41, 0.97], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_workarea_left_6.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_workarea_left_6);
  nodes["workarea-left"] = node_workarea_left_6;
  const mesh_workarea_left_6Geometry = endpoint_workarea_left_6
    ? new THREE.CylinderGeometry(endpoint_workarea_left_6.endRadius, endpoint_workarea_left_6.baseRadius, endpoint_workarea_left_6.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_workarea_left_6) {
    mesh_workarea_left_6Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_workarea_left_6 = new THREE.Mesh(
    mesh_workarea_left_6Geometry,
    materialMap["shell-grey"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_workarea_left_6.name = "Work-area left wall with telescopic covers";
  if (endpoint_workarea_left_6) {
    mesh_workarea_left_6.position.copy(endpoint_workarea_left_6.midpoint);
    mesh_workarea_left_6.quaternion.copy(endpoint_workarea_left_6.quaternion);
  }
  mesh_workarea_left_6.castShadow = options.castShadow ?? true;
  mesh_workarea_left_6.receiveShadow = options.receiveShadow ?? true;
  mesh_workarea_left_6.userData.sculptComponent = {"id": "workarea-left", "name": "Work-area left wall with telescopic covers", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.04, "height": 1.58, "depth": 1.55, "units": "m", "confidence": 0.6}, "transform": {"position": [-0.55, 1.41, 0.97], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_workarea_left_6.add(mesh_workarea_left_6);
  meshes["workarea-left"] = mesh_workarea_left_6;
  colliders["workarea-left"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_workarea_left_6);

  const endpoint_workarea_right_7 = makeAttachmentEndpoint(null);
  const node_workarea_right_7 = new THREE.Group();
  node_workarea_right_7.name = "Work-area right wall__pivot";
  node_workarea_right_7.scale.set(1, 1, 1);
  if (endpoint_workarea_right_7) {
    node_workarea_right_7.position.copy(endpoint_workarea_right_7.start);
    node_workarea_right_7.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_workarea_right_7.position.set(0.8, 1.41, 0.97);
    node_workarea_right_7.rotation.set(0.0, 0.0, 0.0);
  }
  node_workarea_right_7.userData.sculptComponent = {"id": "workarea-right", "name": "Work-area right wall", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.04, "height": 1.58, "depth": 1.55, "units": "m", "confidence": 0.6}, "transform": {"position": [0.8, 1.41, 0.97], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_workarea_right_7.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_workarea_right_7);
  nodes["workarea-right"] = node_workarea_right_7;
  const mesh_workarea_right_7Geometry = endpoint_workarea_right_7
    ? new THREE.CylinderGeometry(endpoint_workarea_right_7.endRadius, endpoint_workarea_right_7.baseRadius, endpoint_workarea_right_7.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_workarea_right_7) {
    mesh_workarea_right_7Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_workarea_right_7 = new THREE.Mesh(
    mesh_workarea_right_7Geometry,
    materialMap["shell-grey"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_workarea_right_7.name = "Work-area right wall";
  if (endpoint_workarea_right_7) {
    mesh_workarea_right_7.position.copy(endpoint_workarea_right_7.midpoint);
    mesh_workarea_right_7.quaternion.copy(endpoint_workarea_right_7.quaternion);
  }
  mesh_workarea_right_7.castShadow = options.castShadow ?? true;
  mesh_workarea_right_7.receiveShadow = options.receiveShadow ?? true;
  mesh_workarea_right_7.userData.sculptComponent = {"id": "workarea-right", "name": "Work-area right wall", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.04, "height": 1.58, "depth": 1.55, "units": "m", "confidence": 0.6}, "transform": {"position": [0.8, 1.41, 0.97], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_workarea_right_7.add(mesh_workarea_right_7);
  meshes["workarea-right"] = mesh_workarea_right_7;
  colliders["workarea-right"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_workarea_right_7);

  const endpoint_workarea_ceiling_8 = makeAttachmentEndpoint(null);
  const node_workarea_ceiling_8 = new THREE.Group();
  node_workarea_ceiling_8.name = "Work-area ceiling__pivot";
  node_workarea_ceiling_8.scale.set(1, 1, 1);
  if (endpoint_workarea_ceiling_8) {
    node_workarea_ceiling_8.position.copy(endpoint_workarea_ceiling_8.start);
    node_workarea_ceiling_8.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_workarea_ceiling_8.position.set(0.125, 2.2, 0.97);
    node_workarea_ceiling_8.rotation.set(0.0, 0.0, 0.0);
  }
  node_workarea_ceiling_8.userData.sculptComponent = {"id": "workarea-ceiling", "name": "Work-area ceiling", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 1.35, "height": 0.04, "depth": 1.55, "units": "m", "confidence": 0.6}, "transform": {"position": [0.125, 2.2, 0.97], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_workarea_ceiling_8.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_workarea_ceiling_8);
  nodes["workarea-ceiling"] = node_workarea_ceiling_8;
  const mesh_workarea_ceiling_8Geometry = endpoint_workarea_ceiling_8
    ? new THREE.CylinderGeometry(endpoint_workarea_ceiling_8.endRadius, endpoint_workarea_ceiling_8.baseRadius, endpoint_workarea_ceiling_8.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_workarea_ceiling_8) {
    mesh_workarea_ceiling_8Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_workarea_ceiling_8 = new THREE.Mesh(
    mesh_workarea_ceiling_8Geometry,
    materialMap["shell-grey"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_workarea_ceiling_8.name = "Work-area ceiling";
  if (endpoint_workarea_ceiling_8) {
    mesh_workarea_ceiling_8.position.copy(endpoint_workarea_ceiling_8.midpoint);
    mesh_workarea_ceiling_8.quaternion.copy(endpoint_workarea_ceiling_8.quaternion);
  }
  mesh_workarea_ceiling_8.castShadow = options.castShadow ?? true;
  mesh_workarea_ceiling_8.receiveShadow = options.receiveShadow ?? true;
  mesh_workarea_ceiling_8.userData.sculptComponent = {"id": "workarea-ceiling", "name": "Work-area ceiling", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 1.35, "height": 0.04, "depth": 1.55, "units": "m", "confidence": 0.6}, "transform": {"position": [0.125, 2.2, 0.97], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_workarea_ceiling_8.add(mesh_workarea_ceiling_8);
  meshes["workarea-ceiling"] = mesh_workarea_ceiling_8;
  colliders["workarea-ceiling"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_workarea_ceiling_8);

  const endpoint_side_wall_front_9 = makeAttachmentEndpoint(null);
  const node_side_wall_front_9 = new THREE.Group();
  node_side_wall_front_9.name = "Service side wall with windows__pivot";
  node_side_wall_front_9.scale.set(1, 1, 1);
  if (endpoint_side_wall_front_9) {
    node_side_wall_front_9.position.copy(endpoint_side_wall_front_9.start);
    node_side_wall_front_9.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_side_wall_front_9.position.set(1.2, 1.16, 0.7);
    node_side_wall_front_9.rotation.set(0.0, 0.0, 0.0);
  }
  node_side_wall_front_9.userData.sculptComponent = {"id": "side-wall-front", "name": "Service side wall with windows", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.06, "height": 2.08, "depth": 2.0, "units": "m", "confidence": 0.6}, "transform": {"position": [1.2, 1.16, 0.7], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-white", "materialLayers": ["shell-white"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "window-panes", "description": "window panes"}, {"id": "seam-screws", "description": "seam screws"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(231, 233, 234, 1.0)", "secondaryAlbedo": "rgba(213, 216, 219, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_side_wall_front_9.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_side_wall_front_9);
  nodes["side-wall-front"] = node_side_wall_front_9;
  const mesh_side_wall_front_9Geometry = endpoint_side_wall_front_9
    ? new THREE.CylinderGeometry(endpoint_side_wall_front_9.endRadius, endpoint_side_wall_front_9.baseRadius, endpoint_side_wall_front_9.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_side_wall_front_9) {
    mesh_side_wall_front_9Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_side_wall_front_9 = new THREE.Mesh(
    mesh_side_wall_front_9Geometry,
    materialMap["shell-white"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_side_wall_front_9.name = "Service side wall with windows";
  if (endpoint_side_wall_front_9) {
    mesh_side_wall_front_9.position.copy(endpoint_side_wall_front_9.midpoint);
    mesh_side_wall_front_9.quaternion.copy(endpoint_side_wall_front_9.quaternion);
  }
  mesh_side_wall_front_9.castShadow = options.castShadow ?? true;
  mesh_side_wall_front_9.receiveShadow = options.receiveShadow ?? true;
  mesh_side_wall_front_9.userData.sculptComponent = {"id": "side-wall-front", "name": "Service side wall with windows", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.06, "height": 2.08, "depth": 2.0, "units": "m", "confidence": 0.6}, "transform": {"position": [1.2, 1.16, 0.7], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-white", "materialLayers": ["shell-white"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "window-panes", "description": "window panes"}, {"id": "seam-screws", "description": "seam screws"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(231, 233, 234, 1.0)", "secondaryAlbedo": "rgba(213, 216, 219, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_side_wall_front_9.add(mesh_side_wall_front_9);
  meshes["side-wall-front"] = mesh_side_wall_front_9;
  colliders["side-wall-front"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_side_wall_front_9);

  const endpoint_left_wall_10 = makeAttachmentEndpoint(null);
  const node_left_wall_10 = new THREE.Group();
  node_left_wall_10.name = "Left closed wall__pivot";
  node_left_wall_10.scale.set(1, 1, 1);
  if (endpoint_left_wall_10) {
    node_left_wall_10.position.copy(endpoint_left_wall_10.start);
    node_left_wall_10.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_left_wall_10.position.set(-1.2, 1.16, -0.05);
    node_left_wall_10.rotation.set(0.0, 0.0, 0.0);
  }
  node_left_wall_10.userData.sculptComponent = {"id": "left-wall", "name": "Left closed wall", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.06, "height": 2.08, "depth": 3.5, "units": "m", "confidence": 0.6}, "transform": {"position": [-1.2, 1.16, -0.05], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-white", "materialLayers": ["shell-white"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(231, 233, 234, 1.0)", "secondaryAlbedo": "rgba(213, 216, 219, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_left_wall_10.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_left_wall_10);
  nodes["left-wall"] = node_left_wall_10;
  const mesh_left_wall_10Geometry = endpoint_left_wall_10
    ? new THREE.CylinderGeometry(endpoint_left_wall_10.endRadius, endpoint_left_wall_10.baseRadius, endpoint_left_wall_10.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_left_wall_10) {
    mesh_left_wall_10Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_left_wall_10 = new THREE.Mesh(
    mesh_left_wall_10Geometry,
    materialMap["shell-white"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_left_wall_10.name = "Left closed wall";
  if (endpoint_left_wall_10) {
    mesh_left_wall_10.position.copy(endpoint_left_wall_10.midpoint);
    mesh_left_wall_10.quaternion.copy(endpoint_left_wall_10.quaternion);
  }
  mesh_left_wall_10.castShadow = options.castShadow ?? true;
  mesh_left_wall_10.receiveShadow = options.receiveShadow ?? true;
  mesh_left_wall_10.userData.sculptComponent = {"id": "left-wall", "name": "Left closed wall", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.06, "height": 2.08, "depth": 3.5, "units": "m", "confidence": 0.6}, "transform": {"position": [-1.2, 1.16, -0.05], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-white", "materialLayers": ["shell-white"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(231, 233, 234, 1.0)", "secondaryAlbedo": "rgba(213, 216, 219, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_left_wall_10.add(mesh_left_wall_10);
  meshes["left-wall"] = mesh_left_wall_10;
  colliders["left-wall"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_left_wall_10);

  const endpoint_rear_wall_11 = makeAttachmentEndpoint(null);
  const node_rear_wall_11 = new THREE.Group();
  node_rear_wall_11.name = "Rear closed wall__pivot";
  node_rear_wall_11.scale.set(1, 1, 1);
  if (endpoint_rear_wall_11) {
    node_rear_wall_11.position.copy(endpoint_rear_wall_11.start);
    node_rear_wall_11.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_rear_wall_11.position.set(0.0, 1.16, -1.8);
    node_rear_wall_11.rotation.set(0.0, 0.0, 0.0);
  }
  node_rear_wall_11.userData.sculptComponent = {"id": "rear-wall", "name": "Rear closed wall", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 2.4, "height": 2.08, "depth": 0.06, "units": "m", "confidence": 0.6}, "transform": {"position": [0, 1.16, -1.8], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-white", "materialLayers": ["shell-white"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(231, 233, 234, 1.0)", "secondaryAlbedo": "rgba(213, 216, 219, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_rear_wall_11.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_rear_wall_11);
  nodes["rear-wall"] = node_rear_wall_11;
  const mesh_rear_wall_11Geometry = endpoint_rear_wall_11
    ? new THREE.CylinderGeometry(endpoint_rear_wall_11.endRadius, endpoint_rear_wall_11.baseRadius, endpoint_rear_wall_11.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_rear_wall_11) {
    mesh_rear_wall_11Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_rear_wall_11 = new THREE.Mesh(
    mesh_rear_wall_11Geometry,
    materialMap["shell-white"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_rear_wall_11.name = "Rear closed wall";
  if (endpoint_rear_wall_11) {
    mesh_rear_wall_11.position.copy(endpoint_rear_wall_11.midpoint);
    mesh_rear_wall_11.quaternion.copy(endpoint_rear_wall_11.quaternion);
  }
  mesh_rear_wall_11.castShadow = options.castShadow ?? true;
  mesh_rear_wall_11.receiveShadow = options.receiveShadow ?? true;
  mesh_rear_wall_11.userData.sculptComponent = {"id": "rear-wall", "name": "Rear closed wall", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 2.4, "height": 2.08, "depth": 0.06, "units": "m", "confidence": 0.6}, "transform": {"position": [0, 1.16, -1.8], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-white", "materialLayers": ["shell-white"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(231, 233, 234, 1.0)", "secondaryAlbedo": "rgba(213, 216, 219, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_rear_wall_11.add(mesh_rear_wall_11);
  meshes["rear-wall"] = mesh_rear_wall_11;
  colliders["rear-wall"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_rear_wall_11);

  const endpoint_service_bay_12 = makeAttachmentEndpoint(null);
  const node_service_bay_12 = new THREE.Group();
  node_service_bay_12.name = "Open rear service bay__pivot";
  node_service_bay_12.scale.set(1, 1, 1);
  if (endpoint_service_bay_12) {
    node_service_bay_12.position.copy(endpoint_service_bay_12.start);
    node_service_bay_12.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_service_bay_12.position.set(0.88, 1.16, -1.05);
    node_service_bay_12.rotation.set(0.0, 0.0, 0.0);
  }
  node_service_bay_12.userData.sculptComponent = {"id": "service-bay", "name": "Open rear service bay", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.65, "height": 2.08, "depth": 1.5, "units": "m", "confidence": 0.6}, "transform": {"position": [0.88, 1.16, -1.05], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "bay-shelf", "description": "bay shelf"}, {"id": "cable-ducts", "description": "cable ducts"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_service_bay_12.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_service_bay_12);
  nodes["service-bay"] = node_service_bay_12;
  const mesh_service_bay_12Geometry = endpoint_service_bay_12
    ? new THREE.CylinderGeometry(endpoint_service_bay_12.endRadius, endpoint_service_bay_12.baseRadius, endpoint_service_bay_12.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_service_bay_12) {
    mesh_service_bay_12Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_service_bay_12 = new THREE.Mesh(
    mesh_service_bay_12Geometry,
    materialMap["shell-grey"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_service_bay_12.name = "Open rear service bay";
  if (endpoint_service_bay_12) {
    mesh_service_bay_12.position.copy(endpoint_service_bay_12.midpoint);
    mesh_service_bay_12.quaternion.copy(endpoint_service_bay_12.quaternion);
  }
  mesh_service_bay_12.castShadow = options.castShadow ?? true;
  mesh_service_bay_12.receiveShadow = options.receiveShadow ?? true;
  mesh_service_bay_12.userData.sculptComponent = {"id": "service-bay", "name": "Open rear service bay", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.65, "height": 2.08, "depth": 1.5, "units": "m", "confidence": 0.6}, "transform": {"position": [0.88, 1.16, -1.05], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "bay-shelf", "description": "bay shelf"}, {"id": "cable-ducts", "description": "cable ducts"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_service_bay_12.add(mesh_service_bay_12);
  meshes["service-bay"] = mesh_service_bay_12;
  colliders["service-bay"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_service_bay_12);

  const endpoint_roof_band_13 = makeAttachmentEndpoint(null);
  const node_roof_band_13 = new THREE.Group();
  node_roof_band_13.name = "Blue roof band with GROB badges__pivot";
  node_roof_band_13.scale.set(1, 1, 1);
  if (endpoint_roof_band_13) {
    node_roof_band_13.position.copy(endpoint_roof_band_13.start);
    node_roof_band_13.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_roof_band_13.position.set(0.0, 2.375, 0.0);
    node_roof_band_13.rotation.set(0.0, 0.0, 0.0);
  }
  node_roof_band_13.userData.sculptComponent = {"id": "roof-band", "name": "Blue roof band with GROB badges", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 2.4, "height": 0.35, "depth": 3.6, "units": "m", "confidence": 0.6}, "transform": {"position": [0, 2.375, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "grob-blue", "materialLayers": ["grob-blue"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "grob-badge-front", "description": "grob badge front"}, {"id": "grob-badge-side", "description": "grob badge side"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(31, 79, 160, 1.0)", "secondaryAlbedo": "rgba(23, 63, 130, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_roof_band_13.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_roof_band_13);
  nodes["roof-band"] = node_roof_band_13;
  const mesh_roof_band_13Geometry = endpoint_roof_band_13
    ? new THREE.CylinderGeometry(endpoint_roof_band_13.endRadius, endpoint_roof_band_13.baseRadius, endpoint_roof_band_13.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_roof_band_13) {
    mesh_roof_band_13Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_roof_band_13 = new THREE.Mesh(
    mesh_roof_band_13Geometry,
    materialMap["grob-blue"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_roof_band_13.name = "Blue roof band with GROB badges";
  if (endpoint_roof_band_13) {
    mesh_roof_band_13.position.copy(endpoint_roof_band_13.midpoint);
    mesh_roof_band_13.quaternion.copy(endpoint_roof_band_13.quaternion);
  }
  mesh_roof_band_13.castShadow = options.castShadow ?? true;
  mesh_roof_band_13.receiveShadow = options.receiveShadow ?? true;
  mesh_roof_band_13.userData.sculptComponent = {"id": "roof-band", "name": "Blue roof band with GROB badges", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 2.4, "height": 0.35, "depth": 3.6, "units": "m", "confidence": 0.6}, "transform": {"position": [0, 2.375, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "grob-blue", "materialLayers": ["grob-blue"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "grob-badge-front", "description": "grob badge front"}, {"id": "grob-badge-side", "description": "grob badge side"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(31, 79, 160, 1.0)", "secondaryAlbedo": "rgba(23, 63, 130, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_roof_band_13.add(mesh_roof_band_13);
  meshes["roof-band"] = mesh_roof_band_13;
  colliders["roof-band"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_roof_band_13);

  const endpoint_roof_cover_14 = makeAttachmentEndpoint(null);
  const node_roof_cover_14 = new THREE.Group();
  node_roof_cover_14.name = "Raised roof cover with louvres__pivot";
  node_roof_cover_14.scale.set(1, 1, 1);
  if (endpoint_roof_cover_14) {
    node_roof_cover_14.position.copy(endpoint_roof_cover_14.start);
    node_roof_cover_14.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_roof_cover_14.position.set(0.0, 2.55, 0.2);
    node_roof_cover_14.rotation.set(0.0, 0.0, 0.0);
  }
  node_roof_cover_14.userData.sculptComponent = {"id": "roof-cover", "name": "Raised roof cover with louvres", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 1.2, "height": 0.6, "depth": 1.6, "units": "m", "confidence": 0.6}, "transform": {"position": [0, 2.55, 0.2], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-white", "materialLayers": ["shell-white"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "vent-louvres", "description": "vent louvres"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(231, 233, 234, 1.0)", "secondaryAlbedo": "rgba(213, 216, 219, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_roof_cover_14.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_roof_cover_14);
  nodes["roof-cover"] = node_roof_cover_14;
  const mesh_roof_cover_14Geometry = endpoint_roof_cover_14
    ? new THREE.CylinderGeometry(endpoint_roof_cover_14.endRadius, endpoint_roof_cover_14.baseRadius, endpoint_roof_cover_14.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_roof_cover_14) {
    mesh_roof_cover_14Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_roof_cover_14 = new THREE.Mesh(
    mesh_roof_cover_14Geometry,
    materialMap["shell-white"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_roof_cover_14.name = "Raised roof cover with louvres";
  if (endpoint_roof_cover_14) {
    mesh_roof_cover_14.position.copy(endpoint_roof_cover_14.midpoint);
    mesh_roof_cover_14.quaternion.copy(endpoint_roof_cover_14.quaternion);
  }
  mesh_roof_cover_14.castShadow = options.castShadow ?? true;
  mesh_roof_cover_14.receiveShadow = options.receiveShadow ?? true;
  mesh_roof_cover_14.userData.sculptComponent = {"id": "roof-cover", "name": "Raised roof cover with louvres", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 1.2, "height": 0.6, "depth": 1.6, "units": "m", "confidence": 0.6}, "transform": {"position": [0, 2.55, 0.2], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-white", "materialLayers": ["shell-white"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "vent-louvres", "description": "vent louvres"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(231, 233, 234, 1.0)", "secondaryAlbedo": "rgba(213, 216, 219, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_roof_cover_14.add(mesh_roof_cover_14);
  meshes["roof-cover"] = mesh_roof_cover_14;
  colliders["roof-cover"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_roof_cover_14);

  const endpoint_hmi_panel_15 = makeAttachmentEndpoint(null);
  const node_hmi_panel_15 = new THREE.Group();
  node_hmi_panel_15.name = "Control panel on arm__pivot";
  node_hmi_panel_15.scale.set(1, 1, 1);
  if (endpoint_hmi_panel_15) {
    node_hmi_panel_15.position.copy(endpoint_hmi_panel_15.start);
    node_hmi_panel_15.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_hmi_panel_15.position.set(1.29, 1.45, 1.22);
    node_hmi_panel_15.rotation.set(0.0, 0.0, 0.0);
  }
  node_hmi_panel_15.userData.sculptComponent = {"id": "hmi-panel", "name": "Control panel on arm", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "side-wall-front", "attachment": {"parentSocket": "side-wall-front", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.1, "height": 0.6, "depth": 0.45, "units": "m", "confidence": 0.6}, "transform": {"position": [1.29, 1.45, 1.22], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "hmi-screen", "description": "hmi screen"}, {"id": "keypad-rows", "description": "keypad rows"}, {"id": "e-stop", "description": "e stop"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_hmi_panel_15.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["side-wall-front"] ?? root).add(node_hmi_panel_15);
  nodes["hmi-panel"] = node_hmi_panel_15;
  const mesh_hmi_panel_15Geometry = endpoint_hmi_panel_15
    ? new THREE.CylinderGeometry(endpoint_hmi_panel_15.endRadius, endpoint_hmi_panel_15.baseRadius, endpoint_hmi_panel_15.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_hmi_panel_15) {
    mesh_hmi_panel_15Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_hmi_panel_15 = new THREE.Mesh(
    mesh_hmi_panel_15Geometry,
    materialMap["shell-grey"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hmi_panel_15.name = "Control panel on arm";
  if (endpoint_hmi_panel_15) {
    mesh_hmi_panel_15.position.copy(endpoint_hmi_panel_15.midpoint);
    mesh_hmi_panel_15.quaternion.copy(endpoint_hmi_panel_15.quaternion);
  }
  mesh_hmi_panel_15.castShadow = options.castShadow ?? true;
  mesh_hmi_panel_15.receiveShadow = options.receiveShadow ?? true;
  mesh_hmi_panel_15.userData.sculptComponent = {"id": "hmi-panel", "name": "Control panel on arm", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.75, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "side-wall-front", "attachment": {"parentSocket": "side-wall-front", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.1, "height": 0.6, "depth": 0.45, "units": "m", "confidence": 0.6}, "transform": {"position": [1.29, 1.45, 1.22], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "hmi-screen", "description": "hmi screen"}, {"id": "keypad-rows", "description": "keypad rows"}, {"id": "e-stop", "description": "e stop"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_hmi_panel_15.add(mesh_hmi_panel_15);
  meshes["hmi-panel"] = mesh_hmi_panel_15;
  colliders["hmi-panel"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_hmi_panel_15);

  const attachment_coolant_pipe_16 = {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002};
  const endpoint_coolant_pipe_16 = makeAttachmentEndpoint(attachment_coolant_pipe_16);
  const node_coolant_pipe_16 = new THREE.Group();
  node_coolant_pipe_16.name = "Coolant return pipe__pivot";
  node_coolant_pipe_16.scale.set(1, 1, 1);
  if (endpoint_coolant_pipe_16) {
    node_coolant_pipe_16.position.copy(endpoint_coolant_pipe_16.start);
    node_coolant_pipe_16.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_coolant_pipe_16.position.set(0.9, 0.3, 1.9);
    node_coolant_pipe_16.rotation.set(0.0, 0.0, 0.0);
  }
  node_coolant_pipe_16.userData.sculptComponent = {"id": "coolant-pipe", "name": "Coolant return pipe", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Rotationally symmetric machined/turned part", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.08, "height": 0.6, "depth": 0.08, "units": "m", "confidence": 0.6}, "transform": {"position": [0.9, 0.3, 1.9], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_coolant_pipe_16.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_coolant_pipe_16);
  nodes["coolant-pipe"] = node_coolant_pipe_16;
  const mesh_coolant_pipe_16Geometry = endpoint_coolant_pipe_16
    ? new THREE.CylinderGeometry(endpoint_coolant_pipe_16.endRadius, endpoint_coolant_pipe_16.baseRadius, endpoint_coolant_pipe_16.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16);
  if (!endpoint_coolant_pipe_16) {
    mesh_coolant_pipe_16Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_coolant_pipe_16 = new THREE.Mesh(
    mesh_coolant_pipe_16Geometry,
    materialMap["shell-grey"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_coolant_pipe_16.name = "Coolant return pipe";
  if (endpoint_coolant_pipe_16) {
    mesh_coolant_pipe_16.position.copy(endpoint_coolant_pipe_16.midpoint);
    mesh_coolant_pipe_16.quaternion.copy(endpoint_coolant_pipe_16.quaternion);
  }
  mesh_coolant_pipe_16.castShadow = options.castShadow ?? true;
  mesh_coolant_pipe_16.receiveShadow = options.receiveShadow ?? true;
  mesh_coolant_pipe_16.userData.sculptComponent = {"id": "coolant-pipe", "name": "Coolant return pipe", "level": "meso", "role": "shell", "importance": 0.7, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Rotationally symmetric machined/turned part", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.08, "height": 0.6, "depth": 0.08, "units": "m", "confidence": 0.6}, "transform": {"position": [0.9, 0.3, 1.9], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "transparent-shell", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_coolant_pipe_16.add(mesh_coolant_pipe_16);
  meshes["coolant-pipe"] = mesh_coolant_pipe_16;
  colliders["coolant-pipe"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_coolant_pipe_16);

  const attachment_spindle_17 = {"parentSocket": "workarea-back", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002};
  const endpoint_spindle_17 = makeAttachmentEndpoint(attachment_spindle_17);
  const node_spindle_17 = new THREE.Group();
  node_spindle_17.name = "Horizontal motor spindle__pivot";
  node_spindle_17.scale.set(1, 1, 1);
  if (endpoint_spindle_17) {
    node_spindle_17.position.copy(endpoint_spindle_17.start);
    node_spindle_17.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_spindle_17.position.set(0.15, 1.3, 0.55);
    node_spindle_17.rotation.set(0.0, 0.0, 0.0);
  }
  node_spindle_17.userData.sculptComponent = {"id": "spindle", "name": "Horizontal motor spindle", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Rotationally symmetric machined/turned part", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "workarea-back", "attachment": {"parentSocket": "workarea-back", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.22, "height": 0.22, "depth": 0.6, "units": "m", "confidence": 0.6}, "transform": {"position": [0.15, 1.3, 0.55], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "hsk-tool-holder", "description": "hsk tool holder"}, {"id": "end-mill", "description": "end mill"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 174, 180, 1.0)", "secondaryAlbedo": "rgba(140, 146, 152, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_spindle_17.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["workarea-back"] ?? root).add(node_spindle_17);
  nodes["spindle"] = node_spindle_17;
  const mesh_spindle_17Geometry = endpoint_spindle_17
    ? new THREE.CylinderGeometry(endpoint_spindle_17.endRadius, endpoint_spindle_17.baseRadius, endpoint_spindle_17.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16);
  if (!endpoint_spindle_17) {
    mesh_spindle_17Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_spindle_17 = new THREE.Mesh(
    mesh_spindle_17Geometry,
    materialMap["steel"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_spindle_17.name = "Horizontal motor spindle";
  if (endpoint_spindle_17) {
    mesh_spindle_17.position.copy(endpoint_spindle_17.midpoint);
    mesh_spindle_17.quaternion.copy(endpoint_spindle_17.quaternion);
  }
  mesh_spindle_17.castShadow = options.castShadow ?? true;
  mesh_spindle_17.receiveShadow = options.receiveShadow ?? true;
  mesh_spindle_17.userData.sculptComponent = {"id": "spindle", "name": "Horizontal motor spindle", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Rotationally symmetric machined/turned part", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "workarea-back", "attachment": {"parentSocket": "workarea-back", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.22, "height": 0.22, "depth": 0.6, "units": "m", "confidence": 0.6}, "transform": {"position": [0.15, 1.3, 0.55], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "hsk-tool-holder", "description": "hsk tool holder"}, {"id": "end-mill", "description": "end mill"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 174, 180, 1.0)", "secondaryAlbedo": "rgba(140, 146, 152, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_spindle_17.add(mesh_spindle_17);
  meshes["spindle"] = mesh_spindle_17;
  colliders["spindle"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_spindle_17);

  const attachment_spindle_motor_18 = {"parentSocket": "spindle", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002};
  const endpoint_spindle_motor_18 = makeAttachmentEndpoint(attachment_spindle_motor_18);
  const node_spindle_motor_18 = new THREE.Group();
  node_spindle_motor_18.name = "Spindle motor stator (internal)__pivot";
  node_spindle_motor_18.scale.set(1, 1, 1);
  if (endpoint_spindle_motor_18) {
    node_spindle_motor_18.position.copy(endpoint_spindle_motor_18.start);
    node_spindle_motor_18.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_spindle_motor_18.position.set(0.15, 1.3, 0.05);
    node_spindle_motor_18.rotation.set(0.0, 0.0, 0.0);
  }
  node_spindle_motor_18.userData.sculptComponent = {"id": "spindle-motor", "name": "Spindle motor stator (internal)", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Rotationally symmetric machined/turned part", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "spindle", "attachment": {"parentSocket": "spindle", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.32, "height": 0.32, "depth": 0.36, "units": "m", "confidence": 0.6}, "transform": {"position": [0.15, 1.3, 0.05], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "motor-grey", "materialLayers": ["motor-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "stator-windings", "description": "stator windings"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 188, 194, 1.0)", "secondaryAlbedo": "rgba(154, 160, 166, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_spindle_motor_18.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["spindle"] ?? root).add(node_spindle_motor_18);
  nodes["spindle-motor"] = node_spindle_motor_18;
  const mesh_spindle_motor_18Geometry = endpoint_spindle_motor_18
    ? new THREE.CylinderGeometry(endpoint_spindle_motor_18.endRadius, endpoint_spindle_motor_18.baseRadius, endpoint_spindle_motor_18.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16);
  if (!endpoint_spindle_motor_18) {
    mesh_spindle_motor_18Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_spindle_motor_18 = new THREE.Mesh(
    mesh_spindle_motor_18Geometry,
    materialMap["motor-grey"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_spindle_motor_18.name = "Spindle motor stator (internal)";
  if (endpoint_spindle_motor_18) {
    mesh_spindle_motor_18.position.copy(endpoint_spindle_motor_18.midpoint);
    mesh_spindle_motor_18.quaternion.copy(endpoint_spindle_motor_18.quaternion);
  }
  mesh_spindle_motor_18.castShadow = options.castShadow ?? true;
  mesh_spindle_motor_18.receiveShadow = options.receiveShadow ?? true;
  mesh_spindle_motor_18.userData.sculptComponent = {"id": "spindle-motor", "name": "Spindle motor stator (internal)", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Rotationally symmetric machined/turned part", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "spindle", "attachment": {"parentSocket": "spindle", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.32, "height": 0.32, "depth": 0.36, "units": "m", "confidence": 0.6}, "transform": {"position": [0.15, 1.3, 0.05], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "motor-grey", "materialLayers": ["motor-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "stator-windings", "description": "stator windings"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 188, 194, 1.0)", "secondaryAlbedo": "rgba(154, 160, 166, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_spindle_motor_18.add(mesh_spindle_motor_18);
  meshes["spindle-motor"] = mesh_spindle_motor_18;
  colliders["spindle-motor"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_spindle_motor_18);

  const endpoint_trunnion_19 = makeAttachmentEndpoint(null);
  const node_trunnion_19 = new THREE.Group();
  node_trunnion_19.name = "Trunnion cradle (A axis)__pivot";
  node_trunnion_19.scale.set(1, 1, 1);
  if (endpoint_trunnion_19) {
    node_trunnion_19.position.copy(endpoint_trunnion_19.start);
    node_trunnion_19.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_trunnion_19.position.set(0.0, 0.92, 1.2);
    node_trunnion_19.rotation.set(0.0, 0.0, 0.0);
  }
  node_trunnion_19.userData.sculptComponent = {"id": "trunnion", "name": "Trunnion cradle (A axis)", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.9, "height": 0.42, "depth": 0.62, "units": "m", "confidence": 0.6}, "transform": {"position": [0.0, 0.92, 1.2], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "cast-white", "materialLayers": ["cast-white"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "bearing-blocks", "description": "bearing blocks"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(236, 237, 236, 1.0)", "secondaryAlbedo": "rgba(218, 220, 220, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_trunnion_19.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_trunnion_19);
  nodes["trunnion"] = node_trunnion_19;
  const mesh_trunnion_19Geometry = endpoint_trunnion_19
    ? new THREE.CylinderGeometry(endpoint_trunnion_19.endRadius, endpoint_trunnion_19.baseRadius, endpoint_trunnion_19.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_trunnion_19) {
    mesh_trunnion_19Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_trunnion_19 = new THREE.Mesh(
    mesh_trunnion_19Geometry,
    materialMap["cast-white"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_trunnion_19.name = "Trunnion cradle (A axis)";
  if (endpoint_trunnion_19) {
    mesh_trunnion_19.position.copy(endpoint_trunnion_19.midpoint);
    mesh_trunnion_19.quaternion.copy(endpoint_trunnion_19.quaternion);
  }
  mesh_trunnion_19.castShadow = options.castShadow ?? true;
  mesh_trunnion_19.receiveShadow = options.receiveShadow ?? true;
  mesh_trunnion_19.userData.sculptComponent = {"id": "trunnion", "name": "Trunnion cradle (A axis)", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "root", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.9, "height": 0.42, "depth": 0.62, "units": "m", "confidence": 0.6}, "transform": {"position": [0.0, 0.92, 1.2], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "cast-white", "materialLayers": ["cast-white"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "bearing-blocks", "description": "bearing blocks"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(236, 237, 236, 1.0)", "secondaryAlbedo": "rgba(218, 220, 220, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_trunnion_19.add(mesh_trunnion_19);
  meshes["trunnion"] = mesh_trunnion_19;
  colliders["trunnion"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_trunnion_19);

  const attachment_rotary_table_20 = {"parentSocket": "trunnion", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002};
  const endpoint_rotary_table_20 = makeAttachmentEndpoint(attachment_rotary_table_20);
  const node_rotary_table_20 = new THREE.Group();
  node_rotary_table_20.name = "Rotary table (B axis)__pivot";
  node_rotary_table_20.scale.set(1, 1, 1);
  if (endpoint_rotary_table_20) {
    node_rotary_table_20.position.copy(endpoint_rotary_table_20.start);
    node_rotary_table_20.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_rotary_table_20.position.set(0.0, 1.02, 1.2);
    node_rotary_table_20.rotation.set(0.0, 0.0, 0.0);
  }
  node_rotary_table_20.userData.sculptComponent = {"id": "rotary-table", "name": "Rotary table (B axis)", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Rotationally symmetric machined/turned part", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "trunnion", "attachment": {"parentSocket": "trunnion", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.56, "height": 0.06, "depth": 0.56, "units": "m", "confidence": 0.6}, "transform": {"position": [0.0, 1.02, 1.2], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "t-slots", "description": "t slots"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 174, 180, 1.0)", "secondaryAlbedo": "rgba(140, 146, 152, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_rotary_table_20.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["trunnion"] ?? root).add(node_rotary_table_20);
  nodes["rotary-table"] = node_rotary_table_20;
  const mesh_rotary_table_20Geometry = endpoint_rotary_table_20
    ? new THREE.CylinderGeometry(endpoint_rotary_table_20.endRadius, endpoint_rotary_table_20.baseRadius, endpoint_rotary_table_20.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16);
  if (!endpoint_rotary_table_20) {
    mesh_rotary_table_20Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_rotary_table_20 = new THREE.Mesh(
    mesh_rotary_table_20Geometry,
    materialMap["steel"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_rotary_table_20.name = "Rotary table (B axis)";
  if (endpoint_rotary_table_20) {
    mesh_rotary_table_20.position.copy(endpoint_rotary_table_20.midpoint);
    mesh_rotary_table_20.quaternion.copy(endpoint_rotary_table_20.quaternion);
  }
  mesh_rotary_table_20.castShadow = options.castShadow ?? true;
  mesh_rotary_table_20.receiveShadow = options.receiveShadow ?? true;
  mesh_rotary_table_20.userData.sculptComponent = {"id": "rotary-table", "name": "Rotary table (B axis)", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Rotationally symmetric machined/turned part", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "trunnion", "attachment": {"parentSocket": "trunnion", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.56, "height": 0.06, "depth": 0.56, "units": "m", "confidence": 0.6}, "transform": {"position": [0.0, 1.02, 1.2], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "t-slots", "description": "t slots"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 174, 180, 1.0)", "secondaryAlbedo": "rgba(140, 146, 152, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_rotary_table_20.add(mesh_rotary_table_20);
  meshes["rotary-table"] = mesh_rotary_table_20;
  colliders["rotary-table"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_rotary_table_20);

  const endpoint_workpiece_21 = makeAttachmentEndpoint(null);
  const node_workpiece_21 = new THREE.Group();
  node_workpiece_21.name = "ABS valve block on fixture__pivot";
  node_workpiece_21.scale.set(1, 1, 1);
  if (endpoint_workpiece_21) {
    node_workpiece_21.position.copy(endpoint_workpiece_21.start);
    node_workpiece_21.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_workpiece_21.position.set(0.0, 1.2, 1.2);
    node_workpiece_21.rotation.set(0.0, 0.0, 0.0);
  }
  node_workpiece_21.userData.sculptComponent = {"id": "workpiece", "name": "ABS valve block on fixture", "level": "micro", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "rotary-table", "attachment": {"parentSocket": "rotary-table", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.24, "height": 0.3, "depth": 0.16, "units": "m", "confidence": 0.6}, "transform": {"position": [0.0, 1.2, 1.2], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "laser-engraving", "description": "laser engraving"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 174, 180, 1.0)", "secondaryAlbedo": "rgba(140, 146, 152, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_workpiece_21.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["rotary-table"] ?? root).add(node_workpiece_21);
  nodes["workpiece"] = node_workpiece_21;
  const mesh_workpiece_21Geometry = endpoint_workpiece_21
    ? new THREE.CylinderGeometry(endpoint_workpiece_21.endRadius, endpoint_workpiece_21.baseRadius, endpoint_workpiece_21.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_workpiece_21) {
    mesh_workpiece_21Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_workpiece_21 = new THREE.Mesh(
    mesh_workpiece_21Geometry,
    materialMap["steel"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_workpiece_21.name = "ABS valve block on fixture";
  if (endpoint_workpiece_21) {
    mesh_workpiece_21.position.copy(endpoint_workpiece_21.midpoint);
    mesh_workpiece_21.quaternion.copy(endpoint_workpiece_21.quaternion);
  }
  mesh_workpiece_21.castShadow = options.castShadow ?? true;
  mesh_workpiece_21.receiveShadow = options.receiveShadow ?? true;
  mesh_workpiece_21.userData.sculptComponent = {"id": "workpiece", "name": "ABS valve block on fixture", "level": "micro", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "rotary-table", "attachment": {"parentSocket": "rotary-table", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.24, "height": 0.3, "depth": 0.16, "units": "m", "confidence": 0.6}, "transform": {"position": [0.0, 1.2, 1.2], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "laser-engraving", "description": "laser engraving"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 174, 180, 1.0)", "secondaryAlbedo": "rgba(140, 146, 152, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_workpiece_21.add(mesh_workpiece_21);
  meshes["workpiece"] = mesh_workpiece_21;
  colliders["workpiece"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_workpiece_21);

  const endpoint_tool_magazine_22 = makeAttachmentEndpoint(null);
  const node_tool_magazine_22 = new THREE.Group();
  node_tool_magazine_22.name = "Tool magazine rows__pivot";
  node_tool_magazine_22.scale.set(1, 1, 1);
  if (endpoint_tool_magazine_22) {
    node_tool_magazine_22.position.copy(endpoint_tool_magazine_22.start);
    node_tool_magazine_22.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_tool_magazine_22.position.set(0.62, 1.75, -1.05);
    node_tool_magazine_22.rotation.set(0.0, 0.0, 0.0);
  }
  node_tool_magazine_22.userData.sculptComponent = {"id": "tool-magazine", "name": "Tool magazine rows", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "service-bay", "attachment": {"parentSocket": "service-bay", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.12, "height": 0.5, "depth": 1.2, "units": "m", "confidence": 0.6}, "transform": {"position": [0.62, 1.75, -1.05], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 174, 180, 1.0)", "secondaryAlbedo": "rgba(140, 146, 152, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_tool_magazine_22.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["service-bay"] ?? root).add(node_tool_magazine_22);
  nodes["tool-magazine"] = node_tool_magazine_22;
  const mesh_tool_magazine_22Geometry = endpoint_tool_magazine_22
    ? new THREE.CylinderGeometry(endpoint_tool_magazine_22.endRadius, endpoint_tool_magazine_22.baseRadius, endpoint_tool_magazine_22.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_tool_magazine_22) {
    mesh_tool_magazine_22Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_tool_magazine_22 = new THREE.Mesh(
    mesh_tool_magazine_22Geometry,
    materialMap["steel"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_tool_magazine_22.name = "Tool magazine rows";
  if (endpoint_tool_magazine_22) {
    mesh_tool_magazine_22.position.copy(endpoint_tool_magazine_22.midpoint);
    mesh_tool_magazine_22.quaternion.copy(endpoint_tool_magazine_22.quaternion);
  }
  mesh_tool_magazine_22.castShadow = options.castShadow ?? true;
  mesh_tool_magazine_22.receiveShadow = options.receiveShadow ?? true;
  mesh_tool_magazine_22.userData.sculptComponent = {"id": "tool-magazine", "name": "Tool magazine rows", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "service-bay", "attachment": {"parentSocket": "service-bay", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.12, "height": 0.5, "depth": 1.2, "units": "m", "confidence": 0.6}, "transform": {"position": [0.62, 1.75, -1.05], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "steel", "materialLayers": ["steel"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(169, 174, 180, 1.0)", "secondaryAlbedo": "rgba(140, 146, 152, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_tool_magazine_22.add(mesh_tool_magazine_22);
  meshes["tool-magazine"] = mesh_tool_magazine_22;
  colliders["tool-magazine"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_tool_magazine_22);

  const attachment_pump_hydraulic_23 = {"parentSocket": "service-bay", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002};
  const endpoint_pump_hydraulic_23 = makeAttachmentEndpoint(attachment_pump_hydraulic_23);
  const node_pump_hydraulic_23 = new THREE.Group();
  node_pump_hydraulic_23.name = "Hydraulic unit, motor + pump (Bomba 2)__pivot";
  node_pump_hydraulic_23.scale.set(1, 1, 1);
  if (endpoint_pump_hydraulic_23) {
    node_pump_hydraulic_23.position.copy(endpoint_pump_hydraulic_23.start);
    node_pump_hydraulic_23.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pump_hydraulic_23.position.set(0.92, 0.75, -1.4);
    node_pump_hydraulic_23.rotation.set(0.0, 0.0, 0.0);
  }
  node_pump_hydraulic_23.userData.sculptComponent = {"id": "pump-hydraulic", "name": "Hydraulic unit, motor + pump (Bomba 2)", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Rotationally symmetric machined/turned part", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "service-bay", "attachment": {"parentSocket": "service-bay", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.2, "height": 0.62, "depth": 0.2, "units": "m", "confidence": 0.6}, "transform": {"position": [0.92, 0.75, -1.4], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "motor-grey", "materialLayers": ["motor-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "motor-fins", "description": "motor fins"}, {"id": "fan-cover", "description": "fan cover"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 188, 194, 1.0)", "secondaryAlbedo": "rgba(154, 160, 166, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_pump_hydraulic_23.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["service-bay"] ?? root).add(node_pump_hydraulic_23);
  nodes["pump-hydraulic"] = node_pump_hydraulic_23;
  const mesh_pump_hydraulic_23Geometry = endpoint_pump_hydraulic_23
    ? new THREE.CylinderGeometry(endpoint_pump_hydraulic_23.endRadius, endpoint_pump_hydraulic_23.baseRadius, endpoint_pump_hydraulic_23.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16);
  if (!endpoint_pump_hydraulic_23) {
    mesh_pump_hydraulic_23Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_pump_hydraulic_23 = new THREE.Mesh(
    mesh_pump_hydraulic_23Geometry,
    materialMap["motor-grey"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pump_hydraulic_23.name = "Hydraulic unit, motor + pump (Bomba 2)";
  if (endpoint_pump_hydraulic_23) {
    mesh_pump_hydraulic_23.position.copy(endpoint_pump_hydraulic_23.midpoint);
    mesh_pump_hydraulic_23.quaternion.copy(endpoint_pump_hydraulic_23.quaternion);
  }
  mesh_pump_hydraulic_23.castShadow = options.castShadow ?? true;
  mesh_pump_hydraulic_23.receiveShadow = options.receiveShadow ?? true;
  mesh_pump_hydraulic_23.userData.sculptComponent = {"id": "pump-hydraulic", "name": "Hydraulic unit, motor + pump (Bomba 2)", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Rotationally symmetric machined/turned part", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "service-bay", "attachment": {"parentSocket": "service-bay", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.2, "height": 0.62, "depth": 0.2, "units": "m", "confidence": 0.6}, "transform": {"position": [0.92, 0.75, -1.4], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "motor-grey", "materialLayers": ["motor-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "motor-fins", "description": "motor fins"}, {"id": "fan-cover", "description": "fan cover"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 188, 194, 1.0)", "secondaryAlbedo": "rgba(154, 160, 166, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_pump_hydraulic_23.add(mesh_pump_hydraulic_23);
  meshes["pump-hydraulic"] = mesh_pump_hydraulic_23;
  colliders["pump-hydraulic"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_pump_hydraulic_23);

  const attachment_pump_coolant_24 = {"parentSocket": "service-bay", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002};
  const endpoint_pump_coolant_24 = makeAttachmentEndpoint(attachment_pump_coolant_24);
  const node_pump_coolant_24 = new THREE.Group();
  node_pump_coolant_24.name = "Coolant pump, motor + pump (Bomba 1)__pivot";
  node_pump_coolant_24.scale.set(1, 1, 1);
  if (endpoint_pump_coolant_24) {
    node_pump_coolant_24.position.copy(endpoint_pump_coolant_24.start);
    node_pump_coolant_24.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pump_coolant_24.position.set(0.95, 0.55, -0.6);
    node_pump_coolant_24.rotation.set(0.0, 0.0, 0.0);
  }
  node_pump_coolant_24.userData.sculptComponent = {"id": "pump-coolant", "name": "Coolant pump, motor + pump (Bomba 1)", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Rotationally symmetric machined/turned part", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "service-bay", "attachment": {"parentSocket": "service-bay", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.18, "height": 0.5, "depth": 0.18, "units": "m", "confidence": 0.6}, "transform": {"position": [0.95, 0.55, -0.6], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "motor-grey", "materialLayers": ["motor-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "motor-fins-coolant", "description": "motor fins coolant"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 188, 194, 1.0)", "secondaryAlbedo": "rgba(154, 160, 166, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_pump_coolant_24.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["service-bay"] ?? root).add(node_pump_coolant_24);
  nodes["pump-coolant"] = node_pump_coolant_24;
  const mesh_pump_coolant_24Geometry = endpoint_pump_coolant_24
    ? new THREE.CylinderGeometry(endpoint_pump_coolant_24.endRadius, endpoint_pump_coolant_24.baseRadius, endpoint_pump_coolant_24.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16);
  if (!endpoint_pump_coolant_24) {
    mesh_pump_coolant_24Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_pump_coolant_24 = new THREE.Mesh(
    mesh_pump_coolant_24Geometry,
    materialMap["motor-grey"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pump_coolant_24.name = "Coolant pump, motor + pump (Bomba 1)";
  if (endpoint_pump_coolant_24) {
    mesh_pump_coolant_24.position.copy(endpoint_pump_coolant_24.midpoint);
    mesh_pump_coolant_24.quaternion.copy(endpoint_pump_coolant_24.quaternion);
  }
  mesh_pump_coolant_24.castShadow = options.castShadow ?? true;
  mesh_pump_coolant_24.receiveShadow = options.receiveShadow ?? true;
  mesh_pump_coolant_24.userData.sculptComponent = {"id": "pump-coolant", "name": "Coolant pump, motor + pump (Bomba 1)", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Rotationally symmetric machined/turned part", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "service-bay", "attachment": {"parentSocket": "service-bay", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.18, "height": 0.5, "depth": 0.18, "units": "m", "confidence": 0.6}, "transform": {"position": [0.95, 0.55, -0.6], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "motor-grey", "materialLayers": ["motor-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "motor-fins-coolant", "description": "motor fins coolant"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 188, 194, 1.0)", "secondaryAlbedo": "rgba(154, 160, 166, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_pump_coolant_24.add(mesh_pump_coolant_24);
  meshes["pump-coolant"] = mesh_pump_coolant_24;
  colliders["pump-coolant"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_pump_coolant_24);

  const attachment_pump_hp_25 = {"parentSocket": "service-bay", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002};
  const endpoint_pump_hp_25 = makeAttachmentEndpoint(attachment_pump_hp_25);
  const node_pump_hp_25 = new THREE.Group();
  node_pump_hp_25.name = "High-pressure pump, horizontal (Bomba 3)__pivot";
  node_pump_hp_25.scale.set(1, 1, 1);
  if (endpoint_pump_hp_25) {
    node_pump_hp_25.position.copy(endpoint_pump_hp_25.start);
    node_pump_hp_25.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pump_hp_25.position.set(0.92, 1.28, -1.25);
    node_pump_hp_25.rotation.set(0.0, 0.0, 0.0);
  }
  node_pump_hp_25.userData.sculptComponent = {"id": "pump-hp", "name": "High-pressure pump, horizontal (Bomba 3)", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Rotationally symmetric machined/turned part", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "service-bay", "attachment": {"parentSocket": "service-bay", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.16, "height": 0.16, "depth": 0.5, "units": "m", "confidence": 0.6}, "transform": {"position": [0.92, 1.28, -1.25], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "motor-grey", "materialLayers": ["motor-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "motor-fins-hp", "description": "motor fins hp"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 188, 194, 1.0)", "secondaryAlbedo": "rgba(154, 160, 166, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_pump_hp_25.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["service-bay"] ?? root).add(node_pump_hp_25);
  nodes["pump-hp"] = node_pump_hp_25;
  const mesh_pump_hp_25Geometry = endpoint_pump_hp_25
    ? new THREE.CylinderGeometry(endpoint_pump_hp_25.endRadius, endpoint_pump_hp_25.baseRadius, endpoint_pump_hp_25.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16);
  if (!endpoint_pump_hp_25) {
    mesh_pump_hp_25Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_pump_hp_25 = new THREE.Mesh(
    mesh_pump_hp_25Geometry,
    materialMap["motor-grey"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pump_hp_25.name = "High-pressure pump, horizontal (Bomba 3)";
  if (endpoint_pump_hp_25) {
    mesh_pump_hp_25.position.copy(endpoint_pump_hp_25.midpoint);
    mesh_pump_hp_25.quaternion.copy(endpoint_pump_hp_25.quaternion);
  }
  mesh_pump_hp_25.castShadow = options.castShadow ?? true;
  mesh_pump_hp_25.receiveShadow = options.receiveShadow ?? true;
  mesh_pump_hp_25.userData.sculptComponent = {"id": "pump-hp", "name": "High-pressure pump, horizontal (Bomba 3)", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Rotationally symmetric machined/turned part", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "service-bay", "attachment": {"parentSocket": "service-bay", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.16, "height": 0.16, "depth": 0.5, "units": "m", "confidence": 0.6}, "transform": {"position": [0.92, 1.28, -1.25], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "motor-grey", "materialLayers": ["motor-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "motor-fins-hp", "description": "motor fins hp"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(183, 188, 194, 1.0)", "secondaryAlbedo": "rgba(154, 160, 166, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_pump_hp_25.add(mesh_pump_hp_25);
  meshes["pump-hp"] = mesh_pump_hp_25;
  colliders["pump-hp"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_pump_hp_25);

  const attachment_accumulator_26 = {"parentSocket": "service-bay", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002};
  const endpoint_accumulator_26 = makeAttachmentEndpoint(attachment_accumulator_26);
  const node_accumulator_26 = new THREE.Group();
  node_accumulator_26.name = "Red bladder accumulator__pivot";
  node_accumulator_26.scale.set(1, 1, 1);
  if (endpoint_accumulator_26) {
    node_accumulator_26.position.copy(endpoint_accumulator_26.start);
    node_accumulator_26.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_accumulator_26.position.set(1.0, 1.55, -0.6);
    node_accumulator_26.rotation.set(0.0, 0.0, 0.0);
  }
  node_accumulator_26.userData.sculptComponent = {"id": "accumulator", "name": "Red bladder accumulator", "level": "micro", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Rotationally symmetric machined/turned part", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "service-bay", "attachment": {"parentSocket": "service-bay", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.18, "height": 0.55, "depth": 0.18, "units": "m", "confidence": 0.6}, "transform": {"position": [1.0, 1.55, -0.6], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "accumulator-red", "materialLayers": ["accumulator-red"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 42, 42, 1.0)", "secondaryAlbedo": "rgba(158, 32, 32, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_accumulator_26.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["service-bay"] ?? root).add(node_accumulator_26);
  nodes["accumulator"] = node_accumulator_26;
  const mesh_accumulator_26Geometry = endpoint_accumulator_26
    ? new THREE.CylinderGeometry(endpoint_accumulator_26.endRadius, endpoint_accumulator_26.baseRadius, endpoint_accumulator_26.length, 32, 12)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 16);
  if (!endpoint_accumulator_26) {
    mesh_accumulator_26Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_accumulator_26 = new THREE.Mesh(
    mesh_accumulator_26Geometry,
    materialMap["accumulator-red"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_accumulator_26.name = "Red bladder accumulator";
  if (endpoint_accumulator_26) {
    mesh_accumulator_26.position.copy(endpoint_accumulator_26.midpoint);
    mesh_accumulator_26.quaternion.copy(endpoint_accumulator_26.quaternion);
  }
  mesh_accumulator_26.castShadow = options.castShadow ?? true;
  mesh_accumulator_26.receiveShadow = options.receiveShadow ?? true;
  mesh_accumulator_26.userData.sculptComponent = {"id": "accumulator", "name": "Red bladder accumulator", "level": "micro", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Rotationally symmetric machined/turned part", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "service-bay", "attachment": {"parentSocket": "service-bay", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.18, "height": 0.55, "depth": 0.18, "units": "m", "confidence": 0.6}, "transform": {"position": [1.0, 1.55, -0.6], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "accumulator-red", "materialLayers": ["accumulator-red"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 42, 42, 1.0)", "secondaryAlbedo": "rgba(158, 32, 32, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_accumulator_26.add(mesh_accumulator_26);
  meshes["accumulator"] = mesh_accumulator_26;
  colliders["accumulator"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_accumulator_26);

  const endpoint_hydraulic_tank_27 = makeAttachmentEndpoint(null);
  const node_hydraulic_tank_27 = new THREE.Group();
  node_hydraulic_tank_27.name = "Hydraulic oil tank__pivot";
  node_hydraulic_tank_27.scale.set(1, 1, 1);
  if (endpoint_hydraulic_tank_27) {
    node_hydraulic_tank_27.position.copy(endpoint_hydraulic_tank_27.start);
    node_hydraulic_tank_27.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_hydraulic_tank_27.position.set(0.9, 0.31, -1.4);
    node_hydraulic_tank_27.rotation.set(0.0, 0.0, 0.0);
  }
  node_hydraulic_tank_27.userData.sculptComponent = {"id": "hydraulic-tank", "name": "Hydraulic oil tank", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "service-bay", "attachment": {"parentSocket": "service-bay", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.5, "height": 0.38, "depth": 0.5, "units": "m", "confidence": 0.6}, "transform": {"position": [0.9, 0.31, -1.4], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_hydraulic_tank_27.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["service-bay"] ?? root).add(node_hydraulic_tank_27);
  nodes["hydraulic-tank"] = node_hydraulic_tank_27;
  const mesh_hydraulic_tank_27Geometry = endpoint_hydraulic_tank_27
    ? new THREE.CylinderGeometry(endpoint_hydraulic_tank_27.endRadius, endpoint_hydraulic_tank_27.baseRadius, endpoint_hydraulic_tank_27.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_hydraulic_tank_27) {
    mesh_hydraulic_tank_27Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_hydraulic_tank_27 = new THREE.Mesh(
    mesh_hydraulic_tank_27Geometry,
    materialMap["shell-grey"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hydraulic_tank_27.name = "Hydraulic oil tank";
  if (endpoint_hydraulic_tank_27) {
    mesh_hydraulic_tank_27.position.copy(endpoint_hydraulic_tank_27.midpoint);
    mesh_hydraulic_tank_27.quaternion.copy(endpoint_hydraulic_tank_27.quaternion);
  }
  mesh_hydraulic_tank_27.castShadow = options.castShadow ?? true;
  mesh_hydraulic_tank_27.receiveShadow = options.receiveShadow ?? true;
  mesh_hydraulic_tank_27.userData.sculptComponent = {"id": "hydraulic-tank", "name": "Hydraulic oil tank", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "service-bay", "attachment": {"parentSocket": "service-bay", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.5, "height": 0.38, "depth": 0.5, "units": "m", "confidence": 0.6}, "transform": {"position": [0.9, 0.31, -1.4], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_hydraulic_tank_27.add(mesh_hydraulic_tank_27);
  meshes["hydraulic-tank"] = mesh_hydraulic_tank_27;
  colliders["hydraulic-tank"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_hydraulic_tank_27);

  const endpoint_electrical_cabinet_28 = makeAttachmentEndpoint(null);
  const node_electrical_cabinet_28 = new THREE.Group();
  node_electrical_cabinet_28.name = "Electrical cabinet with 3-phase meter__pivot";
  node_electrical_cabinet_28.scale.set(1, 1, 1);
  if (endpoint_electrical_cabinet_28) {
    node_electrical_cabinet_28.position.copy(endpoint_electrical_cabinet_28.start);
    node_electrical_cabinet_28.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_electrical_cabinet_28.position.set(0.58, 0.85, -0.85);
    node_electrical_cabinet_28.rotation.set(0.0, 0.0, 0.0);
  }
  node_electrical_cabinet_28.userData.sculptComponent = {"id": "electrical-cabinet", "name": "Electrical cabinet with 3-phase meter", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "service-bay", "attachment": {"parentSocket": "service-bay", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.08, "height": 0.6, "depth": 0.5, "units": "m", "confidence": 0.6}, "transform": {"position": [0.58, 0.85, -0.85], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "breaker-row", "description": "breaker row"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_electrical_cabinet_28.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}};
  (nodes["service-bay"] ?? root).add(node_electrical_cabinet_28);
  nodes["electrical-cabinet"] = node_electrical_cabinet_28;
  const mesh_electrical_cabinet_28Geometry = endpoint_electrical_cabinet_28
    ? new THREE.CylinderGeometry(endpoint_electrical_cabinet_28.endRadius, endpoint_electrical_cabinet_28.baseRadius, endpoint_electrical_cabinet_28.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_electrical_cabinet_28) {
    mesh_electrical_cabinet_28Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_electrical_cabinet_28 = new THREE.Mesh(
    mesh_electrical_cabinet_28Geometry,
    materialMap["shell-grey"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_electrical_cabinet_28.name = "Electrical cabinet with 3-phase meter";
  if (endpoint_electrical_cabinet_28) {
    mesh_electrical_cabinet_28.position.copy(endpoint_electrical_cabinet_28.midpoint);
    mesh_electrical_cabinet_28.quaternion.copy(endpoint_electrical_cabinet_28.quaternion);
  }
  mesh_electrical_cabinet_28.castShadow = options.castShadow ?? true;
  mesh_electrical_cabinet_28.receiveShadow = options.receiveShadow ?? true;
  mesh_electrical_cabinet_28.userData.sculptComponent = {"id": "electrical-cabinet", "name": "Electrical cabinet with 3-phase meter", "level": "meso", "role": "monitored-or-moving", "importance": 0.7, "confidence": 0.55, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Sheet-metal cuboid with chamfered edges", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "service-bay", "attachment": {"parentSocket": "service-bay", "contactType": "butt", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "gapTolerance": 0.005, "embedDepth": 0.002}, "dimensions": {"width": 0.08, "height": 0.6, "depth": 0.5, "units": "m", "confidence": 0.6}, "transform": {"position": [0.58, 0.85, -0.85], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "base"}}, "material": "shell-grey", "materialLayers": ["shell-grey"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "breaker-row", "description": "breaker row"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "xray": "opaque-internal", "colorMaterialRecipe": {"dominantAlbedo": "rgba(195, 200, 205, 1.0)", "secondaryAlbedo": "rgba(169, 175, 181, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8}};
  node_electrical_cabinet_28.add(mesh_electrical_cabinet_28);
  meshes["electrical-cabinet"] = mesh_electrical_cabinet_28;
  colliders["electrical-cabinet"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_electrical_cabinet_28);

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createGROBG300MachiningCentreLookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "GROB G300 machining centre look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === 'reference' ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === 'grazing' ? 0.28 : mode === 'reference' ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === 'reference' ? 0xffcf8a : 0xfff4e8,
    mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15,
  );
  if (mode === 'grazing') key.position.set(7.5, 1.1, 4.0);
  else if (mode === 'reference') key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 7;
  key.shadow.blurSamples = 24;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.updateProjectionMatrix();
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === 'grazing' ? 0.12 : 0.42);
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === 'grazing' ? 0.28 : 0.85);
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = [{"id": "key", "type": "directional", "direction": [-0.4, -1, -0.5], "intensity": 2.2, "notes": "soft studio key from upper front-right"}, {"id": "fill", "type": "hemisphere", "sky": "#ffffff", "ground": "#d8dde2", "intensity": 0.6}, {"id": "rim", "type": "directional", "direction": [0.6, -0.4, 0.8], "intensity": 0.6}, {"id": "environment", "type": "lightformer-environment", "notes": "ACES filmic tone mapping, exposure 1.0; contact shadow on the floor plane; ambient occlusion in bays"}];
  lights.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createGROBG300MachiningCentreEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

// Plan 1.3 §3.2 — auto-framing by bounding box. The Divine Eye can only compare a
// render to the reference if the object is FRAMED consistently (an object framed
// differently scores as wrong even when its shape is right). This positions the camera
// deterministically from the object's bounding box so it fills the frame at a stable
// margin, and sets near/far to the object scale. Call after adding the model to the
// scene, and again on resize (after updating camera.aspect).
export function frameGROBG300MachiningCentreCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  options: { margin?: number; azimuthDeg?: number; elevationDeg?: number } = {},
): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const margin = options.margin ?? 1.15;
  const maxDim = Math.max(size.x, size.y, size.z) * margin;
  const fov = (camera.fov * Math.PI) / 180;
  // distance so the largest object dimension fits vertically in the frame
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  const az = ((options.azimuthDeg ?? 0) * Math.PI) / 180;
  const el = ((options.elevationDeg ?? 0) * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(0.01, distance - maxDim);
  camera.far = distance + maxDim * 2;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

// Plan 1.3 §3.2c — PRESENTATION composer (DOF + bloom). CRITICAL (R-POSTFX): this is
// for the showcase/hero render ONLY. The Divine Eye's EVALUATION render MUST use a
// plain renderer with NO composer — bloom blows highlights and DOF blurs edges, which
// would corrupt the deterministic IoU/DCD/edge/blowout signals. Enable dof/bloom ONLY
// when the reference photo actually exhibits them (detect_reference_effects.py authorizes).
export function createGROBG300MachiningCentrePresentationComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: { dof?: boolean; bloom?: boolean; bloomStrength?: number; dofFocus?: number; dofAperture?: number } = {},
): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (options.dof) {
    composer.addPass(new BokehPass(scene, camera, {
      focus: options.dofFocus ?? 10.0,
      aperture: options.dofAperture ?? 0.0002,
      maxblur: 0.01,
    }));
  }
  if (options.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer.addPass(new UnrealBloomPass(size, options.bloomStrength ?? 0.4, 0.4, 0.85));
  }
  return composer;
}

export function configureGROBG300MachiningCentreRenderer(renderer: THREE.WebGLRenderer): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createGROBG300MachiningCentreInspectControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  // View-dependent finishes only read correctly once the user orbits — their color
  // comes from the environment reflection, not albedo, so free rotation matters here.
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 8.0;
  controls.autoRotate = false;
  return controls;
}
