import { WeaponHandler } from '../types';
import { cellCenter, lerp } from './utils';

type ThunderExtra = { px: number; py: number }[][];

const draw: WeaponHandler['draw'] = (ctx, anim, cs) => {
  if (!anim.extra) {
    const paths: { px: number; py: number }[][] = [];
    for (const pos of anim.targets) {
      const c = cellCenter(pos, cs);
      const segs: { px: number; py: number }[] = [
        { px: c.px + (Math.random() - 0.5) * 20, py: -10 },
      ];
      const steps = 4 + Math.floor(Math.random() * 3);
      for (let i = 1; i <= steps; i++) {
        segs.push({
          px: lerp(segs[0].px, c.px, i / steps) + (Math.random() - 0.5) * 20,
          py: lerp(-10, c.py, i / steps),
        });
      }
      segs.push({ px: c.px, py: c.py });
      paths.push(segs);
    }
    anim.extra = paths;
  }
  const paths = anim.extra as ThunderExtra;
  const t = anim.progress;

  ctx.save();
  if (anim.phase === 'projectile') {
    const drawLen = t < 0.4 ? t / 0.4 : 1;
    const alpha = t < 0.4 ? 1 : Math.max(0, 1 - (t - 0.4) / 0.6);
    ctx.globalAlpha = alpha;

    for (const segs of paths) {
      const n = Math.ceil(segs.length * drawLen);
      ctx.strokeStyle = '#ffff88';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(segs[0].px, segs[0].py);
      for (let i = 1; i < n; i++) ctx.lineTo(segs[i].px, segs[i].py);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(segs[0].px, segs[0].py);
      for (let i = 1; i < n; i++) ctx.lineTo(segs[i].px, segs[i].py);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
  ctx.restore();
};

export const thunder: WeaponHandler = {
  draw,
  speed: { projectile: 0.05, impact: 0.1 },
  flashAt: { phase: 'projectile', progress: 0.35 },
  flashStagger: 0.15,
  hasImpact: false,
};
