import { Position } from '../../../models/types';
import { eventBus } from '../../../utils/event-bus';
import { AssistHandler, SupportDrawFn } from '../types';

const drawDisarm: SupportDrawFn = (ctx, positions, t, cs) => {
  for (const pos of positions) {
    const cx = pos.x * cs + cs / 2;
    const cy = pos.y * cs + cs / 2;
    ctx.save();
    // 内向きに収束する六角形シールド
    const r = cs * 0.7 - t * cs * 0.3;
    ctx.globalAlpha = (1 - t) * 0.85;
    ctx.strokeStyle = '#cc66ff';
    ctx.shadowColor = '#cc66ff';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // 内側にもう1枚（位相ずれ）
    const r2 = cs * 0.5 - t * cs * 0.2;
    ctx.globalAlpha = (1 - t) * 0.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6;
      const x = cx + Math.cos(a) * r2;
      const y = cy + Math.sin(a) * r2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
};

export const disarm: AssistHandler = {
  resolve(unit, unitIndex, team, _allies, _enemies, part) {
    const turns = part.disarmTurns ?? 1;
    unit.isDisarmed = true;
    unit.disarmTurnsLeft = turns;
    eventBus.emit({
      type: 'assist',
      unitIndex,
      team,
      assistType: 'disarm',
      origin: { ...unit.position },
      targets: [{ ...unit.position } as Position],
    });
    eventBus.emit({
      type: 'message',
      text: `${unit.def.name}の${part.name}: 射撃ダメージを軽減！`,
    });
  },
  effect: { draw: drawDisarm, duration: 50 },
};
