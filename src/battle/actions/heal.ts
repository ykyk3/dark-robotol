import { isAlive, getPartBySlot } from '../../models/medabot';
import { eventBus } from '../../utils/event-bus';
import { ActionExecutor, SupportEffect, SupportDrawFn } from './types';

const drawHeal: SupportDrawFn = (ctx, positions, t, cs) => {
  for (const pos of positions) {
    const cx = pos.x * cs + cs / 2;
    const cy = pos.y * cs + cs / 2;
    ctx.save();
    // 拡大リング
    const r = cs * 0.2 + t * cs * 0.6;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = '#44ff88';
    ctx.shadowColor = '#44ff88';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 上昇する + マーク × 4
    for (let i = 0; i < 4; i++) {
      const phase = (t + i * 0.25) % 1;
      const ox = (i - 1.5) * cs * 0.18;
      const oy = -phase * cs * 0.8;
      const alpha = (1 - phase) * 0.9;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#88ffaa';
      const s = 2;
      ctx.fillRect(cx + ox - s, cy + oy - s * 3, s * 2, s * 6);
      ctx.fillRect(cx + ox - s * 3, cy + oy - s, s * 6, s * 2);
    }
    ctx.restore();
  }
};

export const healEffect: SupportEffect = { draw: drawHeal, duration: 60 };

export const executeHeal: ActionExecutor = (action, state, ctx) => {
  if (action.targetUnitIndex == null || !action.partSlot) return;
  const healTarget = ctx.units[action.targetUnitIndex];
  if (healTarget && isAlive(healTarget)) {
    const part = getPartBySlot(ctx.unit, action.partSlot);
    const amount = part.healAmount ?? 20;
    ctx.unit.lastActionPartSlot = action.partSlot;
    healTarget.currentHp = Math.min(healTarget.def.hp, healTarget.currentHp + amount);
    eventBus.emit({
      type: 'heal',
      unitIndex: ctx.unitIndex,
      team: ctx.team,
      target: action.targetUnitIndex,
      amount,
      origin: { ...ctx.unit.position },
      targetPosition: { ...healTarget.position },
    });
    eventBus.emit({
      type: 'message',
      text: `${ctx.unit.def.name}の${part.name}：${healTarget.def.name}を${amount}回復！`,
    });
  }
  state.advanceUnit(ctx.team);
};
