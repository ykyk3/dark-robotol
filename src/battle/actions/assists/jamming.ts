import { Position } from '../../../models/types';
import { isAlive } from '../../../models/medabot';
import { eventBus } from '../../../utils/event-bus';
import { AssistHandler, SupportDrawFn } from '../types';

const drawJamming: SupportDrawFn = (ctx, positions, t, cs) => {
  for (const pos of positions) {
    const x = pos.x * cs;
    const y = pos.y * cs;
    ctx.save();
    // 背景塗り（赤紫）
    ctx.globalAlpha = (1 - t) * 0.35;
    ctx.fillStyle = '#cc2266';
    ctx.fillRect(x, y, cs, cs);

    // ノイズライン: 上から下にスクロール
    ctx.globalAlpha = (1 - t) * 0.9;
    const lineCount = 6;
    for (let i = 0; i < lineCount; i++) {
      const py = y + ((t * cs * 2 + (i * cs) / lineCount) % cs);
      const offset = (Math.sin((t * 30 + i) * 1.7) * cs) / 4;
      ctx.fillStyle = i % 2 === 0 ? '#ff66aa' : '#ffffff';
      ctx.fillRect(x + 2 + Math.max(0, offset), py, cs - 4 - Math.abs(offset), 1);
    }
    // 枠
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = '#ff44aa';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#ff44aa';
    ctx.shadowBlur = 6;
    ctx.strokeRect(x + 1, y + 1, cs - 2, cs - 2);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
};

export const jamming: AssistHandler = {
  resolve(unit, unitIndex, team, _allies, enemies, part) {
    const jammedPositions: Position[] = [];
    for (const enemy of enemies) {
      if (isAlive(enemy) && enemy.lastActionPartSlot) {
        enemy.jammedPartSlot = enemy.lastActionPartSlot;
        jammedPositions.push({ ...enemy.position });
      }
    }
    eventBus.emit({
      type: 'assist',
      unitIndex,
      team,
      assistType: 'jamming',
      origin: { ...unit.position },
      targets: jammedPositions,
    });
    eventBus.emit({
      type: 'message',
      text:
        jammedPositions.length > 0
          ? `${unit.def.name}の${part.name}: ${jammedPositions.length}体の行動を妨害！`
          : `${unit.def.name}の${part.name}: 妨害対象なし…`,
    });
  },
  effect: { draw: drawJamming, duration: 70 },
};
