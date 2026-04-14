import { WeaponHandler } from '../types';
import { cellCenter, isPlayerSide, lerp, teamEdgePx } from './utils';

const draw: WeaponHandler['draw'] = (ctx, anim, cs) => {
  if (anim.phase === 'impact') return;
  const player = isPlayerSide(anim.origin);
  const edgeX = teamEdgePx(anim.origin, cs);
  const oy = anim.origin.y * cs + cs / 2;
  const farthest = player
    ? anim.targets.reduce((a, b) => (b.x > a.x ? b : a), anim.targets[0])
    : anim.targets.reduce((a, b) => (b.x < a.x ? b : a), anim.targets[0]);
  const endPt = cellCenter(farthest, cs);
  const t = anim.progress;
  const ex = lerp(edgeX, endPt.px, t);
  const ey = lerp(oy, endPt.py, t);

  ctx.save();
  ctx.strokeStyle = '#ff44ff';
  ctx.shadowColor = '#ff44ff';
  ctx.shadowBlur = 15;
  ctx.lineWidth = 8;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(edgeX, oy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.strokeStyle = '#ffccff';
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(edgeX, oy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
};

export const beam: WeaponHandler = {
  draw,
  speed: { projectile: 0.06, impact: 0.1 },
  flashAt: { phase: 'projectile', progress: 0.5 },
  flashStagger: 0.1,
  hasImpact: false,
};
