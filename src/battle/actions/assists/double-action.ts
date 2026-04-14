import { Team } from '../../../models/types';
import { isAlive } from '../../../models/medabot';
import { eventBus } from '../../../utils/event-bus';
import { AssistHandler, SupportDrawFn } from '../types';

const drawDoubleAction: SupportDrawFn = (ctx, positions, t, cs) => {
  for (const pos of positions) {
    const cx = pos.x * cs + cs / 2;
    const cy = pos.y * cs + cs / 2;
    ctx.save();
    // 二重リングが上昇しながらフェード
    for (let k = 0; k < 2; k++) {
      const phase = (t + k * 0.5) % 1;
      const r = cs * 0.3 + phase * cs * 0.5;
      const oy = -phase * cs * 0.4;
      const alpha = (1 - phase) * 0.9;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ffcc44';
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy + oy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 上向き矢印
    const ay = -t * cs * 0.6;
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = '#ffee88';
    ctx.beginPath();
    ctx.moveTo(cx, cy + ay - 8);
    ctx.lineTo(cx + 6, cy + ay + 2);
    ctx.lineTo(cx - 6, cy + ay + 2);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
};

export const doubleAction: AssistHandler = {
  resolve(unit, unitIndex, team, _allies, _enemies, part, state) {
    const allies = team === Team.Player ? state.playerTeam : state.enemyTeam;
    let nextAlly = null as import('../../../models/types').MedabotState | null;
    for (let i = state.currentUnitIndex + 1; i < allies.length; i++) {
      if (isAlive(allies[i]) && !allies[i].hasActed) {
        nextAlly = allies[i];
        break;
      }
    }
    if (nextAlly) {
      nextAlly.hasDoubleAction = true;
      eventBus.emit({
        type: 'assist',
        unitIndex,
        team,
        assistType: 'doubleAction',
        origin: { ...unit.position },
        targets: [{ ...nextAlly.position }],
      });
      eventBus.emit({
        type: 'message',
        text: `${unit.def.name}の${part.name}: ${nextAlly.def.name}が2連続行動可能に！`,
      });
    } else {
      eventBus.emit({
        type: 'assist',
        unitIndex,
        team,
        assistType: 'doubleAction',
        origin: { ...unit.position },
        targets: [],
      });
      eventBus.emit({ type: 'message', text: `${unit.def.name}の${part.name}: 対象がいない…` });
    }
  },
  effect: { draw: drawDoubleAction, duration: 60 },
};
