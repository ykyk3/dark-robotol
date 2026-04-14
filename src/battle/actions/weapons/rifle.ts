import { WeaponHandler } from '../types';
import { cellCenter, clamp01, lerp } from './utils';

const draw: WeaponHandler['draw'] = (ctx, anim, cs) => {
  if (anim.phase === 'impact') return;
  const n = anim.targets.length;
  const t = anim.progress;

  ctx.save();
  for (let i = 0; i < n; i++) {
    const localT = clamp01((t - i * 0.2) / 0.6);
    if (localT <= 0) continue;
    const tgt = cellCenter(anim.targets[i], cs);

    const flashR = localT < 0.3 ? lerp(0, 10, localT / 0.3) : lerp(10, 2, (localT - 0.3) / 0.7);
    const alpha = localT < 0.3 ? 1 : 1 - (localT - 0.3) / 0.7;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffdd44';
    ctx.shadowColor = '#ffdd44';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(tgt.px, tgt.py, flashR, 0, Math.PI * 2);
    ctx.fill();

    if (localT < 0.5) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      for (let j = 0; j < 4; j++) {
        const angle = (Math.PI * 2 * j) / 4 + Math.PI / 4;
        const len = flashR * 1.5;
        ctx.beginPath();
        ctx.moveTo(tgt.px, tgt.py);
        ctx.lineTo(tgt.px + Math.cos(angle) * len, tgt.py + Math.sin(angle) * len);
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
  }
  ctx.restore();
};

export const rifle: WeaponHandler = {
  draw,
  speed: { projectile: 0.05, impact: 0.1 },
  flashAt: { phase: 'projectile', progress: 0.3 },
  flashStagger: 0.2,
  hasImpact: false,
};
