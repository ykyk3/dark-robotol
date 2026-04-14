import { WeaponHandler } from '../types';
import { cellCenter, lerp, parabola } from './utils';

const draw: WeaponHandler['draw'] = (ctx, anim, cs) => {
  const o = cellCenter(anim.origin, cs);
  const tgt = cellCenter(anim.targets[0], cs);

  if (anim.phase === 'projectile') {
    const t = anim.progress;
    const bx = lerp(o.px, tgt.px, t);
    const by = lerp(o.py, tgt.py, t) - parabola(t, 25);
    ctx.save();
    ctx.fillStyle = '#44ff44';
    ctx.shadowColor = '#44ff44';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(bx, by, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  } else {
    const t = anim.progress;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = '#44ff44';
    const s = 3 + t * 4;
    ctx.fillRect(tgt.px - s, tgt.py - s * 3, s * 2, s * 6);
    ctx.fillRect(tgt.px - s * 3, tgt.py - s, s * 6, s * 2);
    ctx.restore();
  }
};

export const repairPlant: WeaponHandler = {
  draw,
  speed: { projectile: 0.05, impact: 0.06 },
  flashAt: { phase: 'impact', progress: 0.1 },
  flashStagger: 0.0,
  hasImpact: true,
};
