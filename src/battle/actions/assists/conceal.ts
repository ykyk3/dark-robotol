import { Position } from '../../../models/types';
import { eventBus } from '../../../utils/event-bus';
import { AssistHandler, SupportDrawFn } from '../types';

const drawConceal: SupportDrawFn = (ctx, positions, t, cs) => {
  for (const pos of positions) {
    const cx = pos.x * cs + cs / 2;
    const cy = pos.y * cs + cs / 2;
    const r = cs * 0.3 + t * cs * 0.3;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.8;
    ctx.strokeStyle = '#88ccff';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
};

export const conceal: AssistHandler = {
  resolve(unit, unitIndex, team, _allies, _enemies, part) {
    const turns = part.concealTurns ?? 2;
    unit.isConcealed = true;
    unit.concealTurnsLeft = turns;
    eventBus.emit({
      type: 'assist',
      unitIndex,
      team,
      assistType: 'conceal',
      origin: { ...unit.position },
      targets: [{ ...unit.position } as Position],
    });
    eventBus.emit({
      type: 'message',
      text: `${unit.def.name}の${part.name}: ${turns}ターン隠蔽！`,
    });
  },
  effect: { draw: drawConceal, duration: 40 },
};
