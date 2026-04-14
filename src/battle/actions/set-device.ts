import { getPartBySlot } from '../../models/medabot';
import { eventBus } from '../../utils/event-bus';
import { ActionExecutor } from './types';

export const executeSetDevice: ActionExecutor = (action, state, ctx) => {
  if (!action.target || !action.partSlot) return;
  const part = getPartBySlot(ctx.unit, action.partSlot);
  if (!part || !part.weaponType) return;
  ctx.unit.lastActionPartSlot = action.partSlot;
  const power = part.trapPower ?? part.attackPower ?? 30;
  state.traps.push({ position: { ...action.target }, team: ctx.team, power });
  eventBus.emit({
    type: 'setDevice',
    unitIndex: ctx.unitIndex,
    team: ctx.team,
    origin: { ...ctx.unit.position },
    target: action.target,
    weaponId: part.weaponType!,
  });
  eventBus.emit({ type: 'message', text: `${ctx.unit.def.name}がトラップを設置した` });
  state.advanceUnit(ctx.team);
};
