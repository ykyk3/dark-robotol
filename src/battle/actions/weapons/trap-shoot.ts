import { WeaponHandler } from '../types';
import { cellCenter, lerp, parabola } from './utils';

const draw: WeaponHandler['draw'] = (ctx, anim, cs) => {
  if (anim.phase === 'impact') return;
  const o = cellCenter(anim.origin, cs);
  const tgt = cellCenter(anim.targets[0], cs);
  const t = anim.progress;
  const bx = lerp(o.px, tgt.px, t);
  const by = lerp(o.py, tgt.py, t) - parabola(t, 30);

  ctx.save();
  ctx.fillStyle = 'rgba(220, 20, 60, 0.8)';
  ctx.beginPath();
  ctx.moveTo(bx, by - 6);
  ctx.lineTo(bx + 5, by + 4);
  ctx.lineTo(bx - 5, by + 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

export const trapShoot: WeaponHandler = {
  draw,
  speed: { projectile: 0.05, impact: 0.08 },
  flashAt: { phase: 'projectile', progress: 0.85 },
  flashStagger: 0.0,
  hasImpact: false,
};
