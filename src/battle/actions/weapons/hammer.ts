import { WeaponHandler } from '../types';
import { isPlayerSide, teamCenterPx } from './utils';

const draw: WeaponHandler['draw'] = (ctx, anim, cs) => {
  const centerX = teamCenterPx(anim.origin, cs);
  const centerY = anim.origin.y * cs + cs / 2;
  const player = isPlayerSide(anim.origin);
  const hitX = centerX + (player ? cs * 2 : -cs * 2);

  if (anim.phase === 'projectile') {
    const t = anim.progress;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = '#ff8800';
    ctx.lineWidth = 2;
    const shrink = (1 - t) * cs;
    ctx.beginPath();
    ctx.arc(hitX, centerY, shrink, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else {
    const t = anim.progress;
    const r = t * cs * 2.5;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = '#ff8800';
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 3 * (1 - t) + 1;
    ctx.beginPath();
    ctx.arc(hitX, centerY, r, 0, Math.PI * 2);
    ctx.stroke();
    if (t < 0.6) {
      ctx.strokeStyle = '#ffcc44';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hitX, centerY, r * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }
};

export const hammer: WeaponHandler = {
  draw,
  speed: { projectile: 0.06, impact: 0.06 },
  flashAt: { phase: 'impact', progress: 0.1 },
  flashStagger: 0.15,
  hasImpact: true,
};
