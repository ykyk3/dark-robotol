import { CONFIG } from '../../../config';
import { Position, Team } from '../../../models/types';
import { isAlive } from '../../../models/medabot';
import { getScanPositions, posEqual } from '../../grid';
import { eventBus } from '../../../utils/event-bus';
import { AssistHandler } from '../types';

export const scan: AssistHandler = {
  resolve(unit, unitIndex, team, _allies, enemies, part, state) {
    const scanArea = getScanPositions(unit.position, team);
    const vis = team === Team.Player ? state.visibility : state.enemyVisibility;
    const found: number[] = [];
    enemies.forEach((enemy, idx) => {
      if (!isAlive(enemy) || enemy.isConcealed) return;
      if (scanArea.some((p: Position) => posEqual(p, enemy.position))) {
        vis.reveal(idx, CONFIG.SCAN_VISIBLE_DURATION);
        found.push(idx);
      }
    });
    const foundPositions = found.map((i) => ({ ...enemies[i].position }));
    eventBus.emit({
      type: 'scan',
      unitIndex,
      team,
      center: unit.position,
      found: foundPositions,
    });
    const foundNames = found.map((i) => enemies[i].def.name).join('\u30FB');
    eventBus.emit({
      type: 'message',
      text:
        found.length > 0
          ? `${unit.def.name}の${part.name}: ${foundNames}を発見！`
          : `${unit.def.name}の${part.name}: 反応なし`,
    });
  },
  // scan の描画は canvas-renderer.ts の startScanEffect で独自処理
};
