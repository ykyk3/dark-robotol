import { ActionKind, BattleAction, Position, PartSlot } from './types';

export function moveAction(unitIndex: number, target: Position): BattleAction {
  return { kind: ActionKind.Move, unitIndex, target };
}

export function attackAction(unitIndex: number, target: Position, partSlot: PartSlot): BattleAction {
  return { kind: ActionKind.Attack, unitIndex, target, partSlot };
}

export function assistAction(unitIndex: number, partSlot: PartSlot): BattleAction {
  return { kind: ActionKind.Assist, unitIndex, partSlot };
}

export function setDeviceAction(unitIndex: number, target: Position, partSlot: PartSlot): BattleAction {
  return { kind: ActionKind.SetDevice, unitIndex, target, partSlot };
}

export function guardAction(unitIndex: number): BattleAction {
  return { kind: ActionKind.Guard, unitIndex };
}

export function healAction(unitIndex: number, targetUnitIndex: number, partSlot: PartSlot): BattleAction {
  return { kind: ActionKind.Heal, unitIndex, targetUnitIndex, partSlot };
}

export function skipAction(unitIndex: number): BattleAction {
  return { kind: ActionKind.Skip, unitIndex };
}
