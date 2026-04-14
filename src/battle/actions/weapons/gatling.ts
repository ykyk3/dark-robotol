import { WeaponHandler } from '../types';
import { cellCenter, clamp01 } from './utils';

type GatlingExtra = { dx: number; dy: number; delay: number }[];

const draw: WeaponHandler['draw'] = (ctx, anim, cs) => {
  if (anim.phase === 'impact') return;
  const n = anim.targets.length;
  const t = anim.progress;

  if (!anim.extra) {
    anim.extra = Array.from({ length: n * 6 }, () => ({
      dx: (Math.random() - 0.5) * cs * 0.6,
      dy: (Math.random() - 0.5) * cs * 0.6,
      delay: Math.random() * 0.3,
    }));
  }
  const sparks = anim.extra as GatlingExtra;

  ctx.save();
  for (let i = 0; i < n; i++) {
    const tgt = cellCenter(anim.targets[i], cs);
    for (let s = 0; s < 6; s++) {
      const spark = sparks[i * 6 + s];
      const localT = clamp01((t - spark.delay) / 0.5);
      if (localT <= 0 || localT >= 1) continue;
      const alpha = 1 - localT;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffaa';
      ctx.beginPath();
      ctx.arc(tgt.px + spark.dx * localT, tgt.py + spark.dy * localT, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
};

export const gatling: WeaponHandler = {
  draw,
  speed: { projectile: 0.06, impact: 0.1 },
  flashAt: { phase: 'projectile', progress: 0.25 },
  flashStagger: 0.15,
  hasImpact: false,
};
