import * as THREE from 'three';

/**
 * Texturas procedurais desenhadas em canvas (sem arquivos externos):
 * selo GROB, letreiro vertical "G300" e tela da IHM.
 */

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  return { c, ctx };
}

function toTexture(c: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function grobBadge(): THREE.Texture {
  const { c, ctx } = canvas(512, 192);
  if (ctx) {
    ctx.fillStyle = '#1f4fa0';
    ctx.fillRect(0, 0, 512, 192);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 12;
    roundRect(ctx, 14, 14, 484, 164, 22);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 118px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GROB', 256, 100);
  }
  return toTexture(c);
}

export function g300Lettering(): THREE.Texture {
  const { c, ctx } = canvas(256, 1024);
  if (ctx) {
    ctx.clearRect(0, 0, 256, 1024);
    ctx.save();
    ctx.translate(128, 512);
    ctx.rotate(-Math.PI / 2);
    ctx.font = 'bold 230px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // relevo: sombra deslocada + face clara (letreiro rebaixado na chapa)
    ctx.fillStyle = 'rgba(95,103,112,0.6)';
    ctx.fillText('G300', 7, 9);
    ctx.fillStyle = '#b3b9bf';
    ctx.fillText('G300', 0, 0);
    ctx.restore();
  }
  return toTexture(c);
}

export interface HmiData {
  rpm: number;
  feed: number;
  face: number;
  parts: number;
  status: 'normal' | 'attention' | 'critical';
  phase: string;
}

/** Tela da IHM (redesenhada a cada segundo com os valores do gêmeo) */
export class HmiScreen {
  texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D | null;

  constructor() {
    const { c, ctx } = canvas(512, 384);
    this.ctx = ctx;
    this.texture = toTexture(c) as THREE.CanvasTexture;
  }

  draw(d: HmiData) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.fillStyle = '#e9eef2';
    ctx.fillRect(0, 0, 512, 384);
    ctx.fillStyle = '#21364b';
    ctx.fillRect(0, 0, 512, 46);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Arial';
    ctx.fillText('G300  |  AUTO', 14, 31);
    const col =
      d.status === 'normal' ? '#1e8a55' : d.status === 'attention' ? '#e07b10' : '#c9413b';
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(486, 23, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(14, 60, 300, 250);
    ctx.fillStyle = '#21364b';
    ctx.font = '20px Arial';
    const lines = [
      `S1   ${Math.round(d.rpm)} rpm`,
      `F    ${Math.round(d.feed)} mm/min`,
      `FACE ${d.face + 1}/5`,
      `N    ${d.parts}`,
      d.phase.toUpperCase(),
    ];
    lines.forEach((l, i) => ctx.fillText(l, 28, 98 + i * 44));
    // barra de soft-keys
    for (let i = 0; i < 6; i += 1) {
      ctx.fillStyle = i === 2 ? '#e07b10' : '#c8d3dd';
      ctx.fillRect(330, 60 + i * 42, 168, 34);
    }
    ctx.fillStyle = '#9fb3c5';
    ctx.fillRect(0, 330, 512, 54);
    ctx.fillStyle = '#21364b';
    ctx.font = '18px Arial';
    ctx.fillText('MCS  X 0.000  Y 0.000  Z 0.000', 14, 364);
    this.texture.needsUpdate = true;
  }
}
