import { MedabotDef, MedabotState, Position, Team, ResolvedParts, PartDef, PartSlot } from './types';
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
  const head = PARTS[def.head];
  const rightArm = PARTS[def.rightArm];
  const leftArm = PARTS[def.leftArm];
  const legs = PARTS[def.legs];
  const missing = [
    !head && def.head,
    !rightArm && def.rightArm,
    !leftArm && def.leftArm,
    !legs && def.legs,
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`[${def.id}] パーツ未定義: ${missing.join(', ')}`);
  }
  return { head, rightArm, leftArm, legs };
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

export function getPartBySlot(unit: { parts: ResolvedParts }, slot: PartSlot): PartDef {
  switch (slot) {
    case PartSlot.Head: return unit.parts.head;
    case PartSlot.RightArm: return unit.parts.rightArm;
    case PartSlot.LeftArm: return unit.parts.leftArm;
    case PartSlot.Legs: return unit.parts.legs;
  }
}

export function getAttackRange(part: PartDef, weapon: { defaultRange: number } | undefined): number {
  if (part.rangeOverride != null) return part.rangeOverride;
  return weapon?.defaultRange ?? 1;
}
