import { ActionKind, BattlePhase, Team } from '../../models/types';
import { isAlive } from '../../models/medabot';
import type { BattleState } from '../battle-state';
import { ActionContext, ActionExecutor } from './types';
import { executeMove } from './move';
import { executeAttack } from './attack';
import { executeAssist } from './assist';
import { executeSetDevice } from './set-device';
import { executeGuard } from './guard';
import { executeHeal } from './heal';
import { executeSkip } from './skip';

const ACTION_EXECUTORS: Record<ActionKind, ActionExecutor> = {
  [ActionKind.Move]: executeMove,
  [ActionKind.Attack]: executeAttack,
  [ActionKind.Assist]: executeAssist,
  [ActionKind.SetDevice]: executeSetDevice,
  [ActionKind.Guard]: executeGuard,
  [ActionKind.Heal]: executeHeal,
  [ActionKind.Skip]: executeSkip,
};

export function dispatchAction(action: import('../../models/types').BattleAction, state: BattleState): void {
  const team = state.phase === BattlePhase.PlayerTurn ? Team.Player : Team.Enemy;
  const units = team === Team.Player ? state.playerTeam : state.enemyTeam;
  const enemies = team === Team.Player ? state.enemyTeam : state.playerTeam;
  const unit = units[action.unitIndex];
  if (!unit || !isAlive(unit)) return;

  const ctx: ActionContext = { team, unit, unitIndex: action.unitIndex, units, enemies };
  ACTION_EXECUTORS[action.kind](action, state, ctx);
}

// Re-exports for canvas-renderer
export { getAssistEffect } from './assists';
export { healEffect } from './heal';
export type { WeaponAnimation, SupportDrawFn, SupportEffect } from './types';
export {
  drawWeaponAnimation,
  getWeaponSpeed,
  getWeaponFlashAt,
  hasImpactPhase,
} from './weapons';
