import { WeaponDef } from '../models/types';
import weaponsJson from './weapons.json';

export const WEAPONS: Record<string, WeaponDef> = weaponsJson as Record<string, WeaponDef>;

export function getWeapon(id: string): WeaponDef | undefined {
  return WEAPONS[id];
}
