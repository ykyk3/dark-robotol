import { CONFIG } from '../../config';
import {
  Position,
  Team,
  MedabotState,
  HitResult,
  PartDef,
  WeaponDef,
} from '../../models/types';
import { isAlive, getPartBySlot } from '../../models/medabot';
import { getWeapon } from '../../data/weapons-db';
import { getBlastPositions, getBlastShapePositions, posEqual } from '../grid';
import { calcDamage } from '../damage-calc';
import { eventBus } from '../../utils/event-bus';
import type { BattleState } from '../battle-state';
import { ActionExecutor } from './types';

function resolveAttack(
  attacker: MedabotState,
  attackerIndex: number,
  team: Team,
  enemies: MedabotState[],
  target: Position,
  part: PartDef,
  weapon: WeaponDef,
  state: BattleState,
  pickTargets?: Position[],
): void {
  let hitPositions: Position[];
  if (pickTargets) {
    hitPositions = pickTargets;
  } else if (weapon.blastShape) {
    hitPositions = getBlastShapePositions(attacker.position, target, team, weapon.blastShape);
  } else if (weapon.blastArea > 0) {
    hitPositions = getBlastPositions(target, weapon.blastArea);
  } else {
    hitPositions = [target];
  }

  const hits: HitResult[] = [];
  const messages: string[] = [];
  const hitCount = pickTargets ? 1 : weapon.hitCount || 1;
  const vis = team === Team.Player ? state.visibility : state.enemyVisibility;

  for (let h = 0; h < hitCount; h++) {
    for (const pos of hitPositions) {
      enemies.forEach((enemy, idx) => {
        if (!isAlive(enemy)) return;
        if (!posEqual(enemy.position, pos)) return;
        if (enemy.isDisarmed && weapon.category === 'shooting') {
          enemy.currentHp = Math.max(0, enemy.currentHp - 1);
          hits.push({
            targetIndex: idx,
            targetTeam: enemy.team,
            damage: 1,
            destroyed: enemy.currentHp <= 0,
          });
          vis.reveal(idx, CONFIG.SCAN_VISIBLE_DURATION);
          messages.push(
            `${attacker.def.name}の${part.name}！${enemy.def.name}に1ダメージ！（解除）`,
          );
          if (enemy.currentHp <= 0) {
            eventBus.emit({ type: 'destroy', unitIndex: idx, team: enemy.team });
            messages.push(`${enemy.def.name}は機能停止した！`);
          }
          return;
        }
        const result = calcDamage(part, enemy, 0, weapon);
        result.targetIndex = idx;
        hits.push(result);
        vis.reveal(idx, CONFIG.SCAN_VISIBLE_DURATION);
        messages.push(
          `${attacker.def.name}の${part.name}！${enemy.def.name}に${result.damage}ダメージ！`,
        );
        if (result.destroyed) {
          eventBus.emit({ type: 'destroy', unitIndex: idx, team: enemy.team });
          messages.push(`${enemy.def.name}は機能停止した！`);
        }
      });
    }
  }

  if (team === Team.Player) {
    messages.push(`${hits.length}ヒット！`);
  }
  eventBus.emit({
    type: 'attack',
    unitIndex: attackerIndex,
    team,
    origin: { ...attacker.position },
    target,
    targets: hitPositions,
    weaponId: weapon.id,
    hits,
    messages,
  });
  state.checkVictory();
}

export const executeAttack: ActionExecutor = (action, state, ctx) => {
  if (!action.partSlot) return;
  const part = getPartBySlot(ctx.unit, action.partSlot);
  if (!part || !part.weaponType) return;
  const weapon = getWeapon(part.weaponType);
  if (!weapon) return;
  ctx.unit.lastActionPartSlot = action.partSlot;

  if (weapon.blastShape === 'pick3' && action.targets) {
    resolveAttack(
      ctx.unit,
      ctx.unitIndex,
      ctx.team,
      ctx.enemies,
      action.targets[0] ?? ctx.unit.position,
      part,
      weapon,
      state,
      action.targets,
    );
  } else if (action.target) {
    resolveAttack(ctx.unit, ctx.unitIndex, ctx.team, ctx.enemies, action.target, part, weapon, state);
  } else if (weapon.blastShape) {
    resolveAttack(ctx.unit, ctx.unitIndex, ctx.team, ctx.enemies, ctx.unit.position, part, weapon, state);
  }
  state.advanceUnit(ctx.team);
};
