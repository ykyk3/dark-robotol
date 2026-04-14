import { eventBus } from '../../utils/event-bus';
import { Team } from '../../models/types';
import { ActionExecutor } from './types';

export const executeMove: ActionExecutor = (action, state, ctx) => {
  if (!action.target) return;
  const from = { ...ctx.unit.position };
  state.preMovePosition = { ...from };
  ctx.unit.position = { ...action.target };
  eventBus.emit({ type: 'move', unitIndex: ctx.unitIndex, team: ctx.team, from, to: ctx.unit.position });
  if (ctx.team === Team.Enemy) {
    eventBus.emit({ type: 'message', text: `${ctx.unit.def.name}が移動した` });
  }
  state.checkTraps(ctx.unit, ctx.unitIndex, ctx.team);
  state.unitPhase = 'action';
};
