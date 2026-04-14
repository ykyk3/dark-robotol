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
  ctx.strokeStyle = '#00ffff';
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(edgeX, oy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(edgeX, oy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
};

export const laser: WeaponHandler = {
  draw,
  speed: { projectile: 0.08, impact: 0.1 },
  flashAt: { phase: 'projectile', progress: 0.5 },
  flashStagger: 0.1,
  hasImpact: false,
};
