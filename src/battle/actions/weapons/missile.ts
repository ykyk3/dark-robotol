import { Position } from '../../../models/types';
import { CONFIG } from '../../../config';
import { WeaponHandler } from '../types';
import { cellCenter, clamp01, lerp, parabola } from './utils';

type MissileExtra = { from: Position; to: Position }[];

const draw: WeaponHandler['draw'] = (ctx, anim, cs) => {
  const originX = anim.origin.x;
  const targetX = anim.targets[0]?.x ?? CONFIG.GRID_COLS - 1 - originX;

  if (!anim.extra) {
    const pairs: { from: Position; to: Position }[] = [];
    for (let y = 0; y < CONFIG.GRID_ROWS; y++) {
      pairs.push({ from: { x: originX, y }, to: { x: targetX, y } });
    }
    anim.extra = pairs;
  }
  const pairs = anim.extra as MissileExtra;

  if (anim.phase === 'projectile') {
    ctx.save();
    for (let idx = 0; idx < pairs.length; idx++) {
      const { from, to } = pairs[idx];
      const delay = idx * 0.08;
      const localT = clamp01((anim.progress - delay) / (1 - delay));
      if (localT <= 0) continue;

      const o = cellCenter(from, cs);
      const tgt = cellCenter(to, cs);
      const bx = lerp(o.px, tgt.px, localT);
      const by = lerp(o.py, tgt.py, localT) - parabola(localT, 35);

      for (let i = 1; i <= 3; i++) {
        const st = clamp01(localT - i * 0.08);
        if (st <= 0) continue;
        const smx = lerp(o.px, tgt.px, st);
        const smy = lerp(o.py, tgt.py, st) - parabola(st, 35);
        ctx.fillStyle = `rgba(150, 150, 150, ${0.15 * (1 - i / 4)})`;
        ctx.beginPath();
        ctx.arc(smx, smy, 2 + i, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ff8844';
      ctx.shadowColor = '#ff4400';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  } else {
    ctx.save();
    for (let idx = 0; idx < pairs.length; idx++) {
      const delay = idx * 0.08;
      const localT = clamp01((anim.progress - delay) / (1 - delay));
      if (localT <= 0) continue;
      const r = localT * 25;
      const tgt = cellCenter(pairs[idx].to, cs);
      ctx.globalAlpha = 1 - localT;
      const grad = ctx.createRadialGradient(tgt.px, tgt.py, 0, tgt.px, tgt.py, r);
      grad.addColorStop(0, 'rgba(255, 100, 0, 0.8)');
      grad.addColorStop(0.6, 'rgba(255, 60, 0, 0.4)');
      grad.addColorStop(1, 'rgba(255, 60, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(tgt.px, tgt.py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
};

export const missile: WeaponHandler = {
  draw,
  speed: { projectile: 0.04, impact: 0.06 },
  flashAt: { phase: 'impact', progress: 0.1 },
  flashStagger: 0.15,
  hasImpact: true,
};
