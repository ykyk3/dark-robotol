import { WeaponHandler } from '../types';
import { clamp01, isPlayerSide, teamCenterPx } from './utils';

const draw: WeaponHandler['draw'] = (ctx, anim, cs) => {
  if (anim.phase === 'impact') return;
  const centerX = teamCenterPx(anim.origin, cs);
  const centerY = anim.origin.y * cs + cs / 2;
  const t = anim.progress;

  const player = isPlayerSide(anim.origin);
  const offsetX = player ? cs * 2 : -cs * 2;
  const arcCx = centerX + offsetX;
  const arcCy = centerY;
  const r = cs * 1.5;

  ctx.save();
  const sweepAngle = Math.PI * 0.9;
  const startAngle = -sweepAngle / 2;
  const currentAngle = startAngle + sweepAngle * clamp01(t * 2);
  const alpha = t < 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) / 0.5);

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#00ffff';
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 10;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(arcCx, arcCy, r, startAngle, currentAngle);
  ctx.stroke();

  if (t < 0.6) {
    const tipX = arcCx + r * Math.cos(currentAngle);
    const tipY = arcCy + r * Math.sin(currentAngle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(tipX, tipY, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.restore();
};

export const sword: WeaponHandler = {
  draw,
  speed: { projectile: 0.05, impact: 0.1 },
  flashAt: { phase: 'projectile', progress: 0.4 },
  flashStagger: 0.15,
  hasImpact: false,
};
