import { getPartBySlot } from '../../models/medabot';
import { getAssistHandler } from './assists';
import { ActionExecutor } from './types';

export const executeAssist: ActionExecutor = (action, state, ctx) => {
  if (!action.partSlot) return;
  const part = getPartBySlot(ctx.unit, action.partSlot);
  if (!part || !part.assistType) return;
  ctx.unit.lastActionPartSlot = action.partSlot;
  const handler = getAssistHandler(part.assistType);
  handler.resolve(ctx.unit, ctx.unitIndex, ctx.team, ctx.units, ctx.enemies, part, state);
  state.advanceUnit(ctx.team);
};
