import { BattleAction, MedabotState, Position, Team } from '../../models/types';
import type { BattleState } from '../battle-state';

// ── ActionExecutor ──

export interface ActionContext {
  team: Team;
  unit: MedabotState;
  unitIndex: number;
  units: MedabotState[];
  enemies: MedabotState[];
}

export type ActionExecutor = (action: BattleAction, state: BattleState, ctx: ActionContext) => void;

// ── WeaponHandler ──

export interface WeaponAnimation {
  weaponId: string;
  origin: Position;
  targets: Position[];
  phase: 'projectile' | 'impact';
  progress: number;
  speed: number;
  impactSpeed: number;
  hasHits: boolean;
  onComplete?: () => void;
  flashFiredCount: number;
  extra?: unknown;
}

export type WeaponDrawFn = (
  ctx: CanvasRenderingContext2D,
  anim: WeaponAnimation,
  cellSize: number,
) => void;

export interface WeaponHandler {
  draw: WeaponDrawFn;
  speed: { projectile: number; impact: number };
  flashAt: { phase: 'projectile' | 'impact'; progress: number };
  flashStagger: number;
  hasImpact: boolean;
}

// ── SupportHandler (assists + heal) ──

export type SupportDrawFn = (
  ctx: CanvasRenderingContext2D,
  positions: Position[],
  t: number,
  cellSize: number,
) => void;

export interface SupportEffect {
  draw: SupportDrawFn;
  duration: number;
}

// ── AssistHandler ──

export type AssistResolver = (
  unit: MedabotState,
  unitIndex: number,
  team: Team,
  allies: MedabotState[],
  enemies: MedabotState[],
  part: import('../../models/types').PartDef,
  state: BattleState,
) => void;

export interface AssistHandler {
  resolve: AssistResolver;
  effect?: SupportEffect;
}
