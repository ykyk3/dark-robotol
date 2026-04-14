import { AssistType } from '../../../models/types';
import { AssistHandler, SupportEffect } from '../types';
import { scan } from './scan';
import { conceal } from './conceal';
import { disarm } from './disarm';
import { doubleAction } from './double-action';
import { jamming } from './jamming';

const ASSIST_REGISTRY: Record<AssistType, AssistHandler> = {
  scan,
  conceal,
  disarm,
  doubleAction,
  jamming,
};

export function getAssistHandler(assistType: AssistType): AssistHandler {
  return ASSIST_REGISTRY[assistType];
}

export function getAssistEffect(assistType: AssistType): SupportEffect | undefined {
  return ASSIST_REGISTRY[assistType].effect;
}
