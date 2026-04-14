import { eventBus } from '../../utils/event-bus';
import { ActionExecutor } from './types';

export const executeGuard: ActionExecutor = (_action, state, ctx) => {
  ctx.unit.isGuarding = true;
  eventBus.emit({ type: 'guard', unitIndex: ctx.unitIndex, team: ctx.team });
  eventBus.emit({ type: 'message', text: `${ctx.unit.def.name}は防御態勢をとった` });
  state.advanceUnit(ctx.team);
};
