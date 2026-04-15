import { BattleState } from './battle-state';
import {
  BattlePhase,
  ActionKind,
  PartSlot,
  BattleAction,
  MedabotState,
  Team,
} from '../models/types';
import { moveAction, attackAction, guardAction, skipAction } from '../models/action';
import { isAlive, canUseHead } from '../models/medabot';
import {
  getMovablePositions,
  posEqual,
  manhattan,
  getBlastShapePositions,
  getMeleeTargets,
  getShootingTargets,
} from './grid';
import { getWeapon } from '../data/weapons-db';
import { pick } from '../utils/random';
import { CONFIG } from '../config';

/** 敵から見えているプレイヤーユニットのリスト */
function getVisiblePlayers(state: BattleState): { unit: MedabotState; index: number }[] {
  return state.playerTeam
    .map((unit, index) => ({ unit, index }))
    .filter(({ unit, index }) => isAlive(unit) && state.enemyVisibility.isRevealed(index));
}

/** AI: 1ユニット分の行動を決定（移動 + 行動） */
function planUnitActions(state: BattleState): BattleAction[] {
  const unit = state.getCurrentUnit();
  if (!unit) return [];

  const idx = state.currentUnitIndex;
  const playerAlive = state.getAlivePlayerUnits();
  if (playerAlive.length === 0) return [];

  const visible = getVisiblePlayers(state);
  const actions: BattleAction[] = [];

  // ── 1) 移動（隣接1マス） ──
  if (!state.preMovePosition) {
    const movable = getMovablePositions(unit, state.getAllBots());
    if (movable.length > 0) {
      if (visible.length > 0) {
        let bestPos = unit.position;
        let bestDist = Infinity;
        for (const pos of movable) {
          for (const { unit: target } of visible) {
            const dist = manhattan(pos, target.position);
            if (dist < bestDist) {
              bestDist = dist;
              bestPos = pos;
            }
          }
        }
        if (!posEqual(bestPos, unit.position)) {
          actions.push(moveAction(idx, bestPos));
        }
      } else {
        // ランダム移動
        actions.push(moveAction(idx, pick(movable)));
      }
    }
  }

  // ── 2) 索敵（見えている敵がいない場合） ──
  if (
    visible.length === 0 &&
    canUseHead(unit) &&
    unit.parts.head.assistType === 'scan' &&
    unit.jammedPartSlot !== PartSlot.Head
  ) {
    actions.push({ kind: ActionKind.Assist, unitIndex: idx, partSlot: PartSlot.Head });
    return actions;
  }

  // ── 3) 攻撃 ──
  const attackAct = planAttack(unit, idx, visible);
  if (attackAct) {
    actions.push(attackAct);
    return actions;
  }

  // ── 4) 補助・防御 ──
  if (
    canUseHead(unit) &&
    unit.parts.head.actionType === 'たすける' &&
    unit.jammedPartSlot !== PartSlot.Head
  ) {
    actions.push({ kind: ActionKind.Assist, unitIndex: idx, partSlot: PartSlot.Head });
  } else if (unit.parts.leftArm.actionType === 'まもる') {
    actions.push(guardAction(idx));
  } else {
    actions.push(skipAction(idx));
  }

  return actions;
}

function planAttack(
  unit: MedabotState,
  idx: number,
  visible: { unit: MedabotState; index: number }[],
): BattleAction | null {
  for (const slot of [PartSlot.RightArm, PartSlot.LeftArm, PartSlot.Head]) {
    const part =
      slot === PartSlot.Head
        ? unit.parts.head
        : slot === PartSlot.RightArm
          ? unit.parts.rightArm
          : unit.parts.leftArm;

    if (slot === PartSlot.Head && !canUseHead(unit)) continue;
    if (!part.weaponType) continue;

    const actionType = part.actionType;
    if (!actionType || (actionType !== 'こうげき' && actionType !== 'しかける')) continue;
    if (unit.jammedPartSlot === slot) continue;

    if (actionType === 'しかける') {
      // 敵陣最前列（自陣側から見た前線）にトラップ設置
      const frontX = CONFIG.TERRITORY_X;
      const trapTargets = [];
      for (let y = 0; y < CONFIG.GRID_ROWS; y++) trapTargets.push({ x: frontX, y });
      return {
        kind: ActionKind.SetDevice,
        unitIndex: idx,
        target: pick(trapTargets),
        partSlot: slot,
      };
    }

    const weapon = getWeapon(part.weaponType);
    if (!weapon) continue;

    // 自動照準
    if (
      weapon.blastShape === 'same_col' ||
      weapon.blastShape === 'mirror_col' ||
      weapon.blastShape === 'front4' ||
      weapon.blastShape === 'front2' ||
      weapon.blastShape === 'vertical_line'
    ) {
      const hitPositions = getBlastShapePositions(
        unit.position,
        unit.position,
        Team.Enemy,
        weapon.blastShape,
      );
      const canHit = visible.some(({ unit: p }) =>
        hitPositions.some((hp) => posEqual(hp, p.position)),
      );
      if (canHit || (visible.length === 0 && Math.random() < 0.3)) {
        return { kind: ActionKind.Attack, unitIndex: idx, partSlot: slot };
      }
      continue;
    }

    // pick3
    if (weapon.blastShape === 'pick3') {
      if (visible.length > 0) {
        const targets: { x: number; y: number }[] = visible
          .slice(0, 3)
          .map(({ unit: p }) => ({ ...p.position }));
        // 3枠に満たない分は敵陣のランダムな空きマスで埋める（重複禁止）
        if (targets.length < 3) {
          const area = getShootingTargets(Team.Enemy);
          const isTaken = (p: { x: number; y: number }) => targets.some((t) => posEqual(t, p));
          const candidates = area.filter((p) => !isTaken(p));
          while (targets.length < 3 && candidates.length > 0) {
            const idx2 = Math.floor(Math.random() * candidates.length);
            targets.push(candidates.splice(idx2, 1)[0]);
          }
        }
        return { kind: ActionKind.Attack, unitIndex: idx, targets, partSlot: slot };
      }
      if (Math.random() < 0.2) {
        const area = getShootingTargets(Team.Enemy);
        // 重複なしで3マスランダム抽出
        const pool = [...area];
        const targets: { x: number; y: number }[] = [];
        for (let k = 0; k < 3 && pool.length > 0; k++) {
          const idx2 = Math.floor(Math.random() * pool.length);
          targets.push(pool.splice(idx2, 1)[0]);
        }
        if (targets.length > 0) {
          return { kind: ActionKind.Attack, unitIndex: idx, targets, partSlot: slot };
        }
      }
      continue;
    }

    // 格闘
    if (weapon.category === 'melee') {
      const meleeTargets = getMeleeTargets(Team.Enemy, unit.position.x);
      const target = visible.find(({ unit: p }) =>
        meleeTargets.some((t) => posEqual(t, p.position)),
      );
      if (target) return attackAction(idx, target.unit.position, slot);
      continue;
    }

    // 通常射撃
    if (visible.length > 0) {
      return attackAction(idx, pick(visible).unit.position, slot);
    }
    if (Math.random() < 0.2) {
      return attackAction(idx, pick(getShootingTargets(Team.Enemy)), slot);
    }
  }

  return null;
}

export async function executeAiTurnAnimated(
  state: BattleState,
  onStep: () => void,
  delay: number,
  waitForAnim?: () => Promise<void>,
): Promise<void> {
  while (state.phase === BattlePhase.EnemyTurn) {
    const unit = state.getCurrentUnit();
    if (!unit) break;

    const actions = planUnitActions(state);
    if (actions.length === 0) {
      state.executeAction(skipAction(state.currentUnitIndex));
      onStep();
      await sleep(delay);
      continue;
    }

    for (const action of actions) {
      state.executeAction(action);
      onStep();
      if (waitForAnim) await waitForAnim();
      await sleep(delay);
      if (state.phase !== BattlePhase.EnemyTurn) return;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
