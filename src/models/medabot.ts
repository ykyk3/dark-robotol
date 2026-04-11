import { MedabotDef, MedabotState, Position, Team, ResolvedParts, PartDef } from './types';
import { PARTS } from '../data/parts-db';

export function createMedabot(def: MedabotDef, position: Position, team: Team): MedabotState {
  const parts = resolveParts(def);
  return {
    def,
    currentHp: def.hp,
    position,
    team,
    hasActed: false,
    isGuarding: false,
    isConcealed: false,
    concealTurnsLeft: 0,
    isCountering: false,
    counterRatio: 0,
    isDisarmed: false,
    disarmTurnsLeft: 0,
    hasDoubleAction: false,
    lastActionPartSlot: undefined,
    jammedPartSlot: undefined,
    parts,
  };
}

function resolveParts(def: MedabotDef): ResolvedParts {
  return {
    head: PARTS[def.head],
    rightArm: PARTS[def.rightArm],
    leftArm: PARTS[def.leftArm],
    legs: PARTS[def.legs],
  };
}

export function isAlive(bot: MedabotState): boolean {
  return bot.currentHp > 0;
}

export function totalDefense(bot: MedabotState): number {
  const base =
    (bot.parts.head.defense ?? 0) +
    (bot.parts.rightArm.defense ?? 0) +
    (bot.parts.leftArm.defense ?? 0) +
    (bot.parts.legs.defense ?? 0);
  const guardBonus = bot.isGuarding ? (bot.parts.leftArm.guardDefenseBonus ?? 0) : 0;
  return base + guardBonus;
}

export function getMoveRange(bot: MedabotState): number {
  return bot.parts.legs.moveRange ?? 2;
}

export function getEvasion(bot: MedabotState): number {
  return bot.parts.legs.evasion ?? 0;
}

export function canUseHead(bot: MedabotState): boolean {
  return bot.parts.head.actionType != null;
}

export function getAttackRange(part: PartDef, weapon: { defaultRange: number } | undefined): number {
  if (part.rangeOverride != null) return part.rangeOverride;
  return weapon?.defaultRange ?? 1;
}
