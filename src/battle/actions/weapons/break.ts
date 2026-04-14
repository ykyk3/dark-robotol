import { WeaponHandler } from '../types';
import { cellCenter, lerp } from './utils';

const draw: WeaponHandler['draw'] = (ctx, anim, cs) => {
  const tgt = cellCenter(anim.targets[0], cs);

  if (anim.phase === 'projectile') {
    const t = anim.progress;
    const flashR = lerp(12, 4, t);
    ctx.save();
    ctx.globalAlpha = 1 - t * 0.5;
    ctx.fillStyle = '#ff3333';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(tgt.px, tgt.py, flashR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  } else {
    const t = anim.progress;
    const len = t * cs;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 6;
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      ctx.beginPath();
      ctx.moveTo(tgt.px, tgt.py);
      ctx.lineTo(tgt.px + dx * len, tgt.py + dy * len);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }
};

export const breakWeapon: WeaponHandler = {
  draw,
  speed: { projectile: 0.06, impact: 0.06 },
  flashAt: { phase: 'impact', progress: 0.1 },
  flashStagger: 0.15,
  hasImpact: true,
};
