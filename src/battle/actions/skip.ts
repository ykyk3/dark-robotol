import { ActionExecutor } from './types';

export const executeSkip: ActionExecutor = (_action, state, ctx) => {
  state.advanceUnit(ctx.team);
};
