import { MedabotDef } from '../models/types';
import data from './medabots.json';

export const MEDABOTS: Record<string, MedabotDef> = data.medabots as Record<string, MedabotDef>;

export interface TeamPreset {
  name: string;
  description?: string;
  team: string[];
}

export const PLAYER_PRESETS: TeamPreset[] = data.presets as TeamPreset[];
export const ENEMY_PRESETS: TeamPreset[] = data.enemyPresets as TeamPreset[];

// デフォルト（最初のプリセット）
export const DEFAULT_PLAYER_TEAM: string[] = PLAYER_PRESETS[0].team;
export const DEFAULT_ENEMY_TEAM: string[] = ENEMY_PRESETS[0].team;
