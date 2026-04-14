import { WeaponHandler, WeaponAnimation } from '../types';
import { rifle } from './rifle';
import { gatling } from './gatling';
import { missile } from './missile';
import { laser } from './laser';
import { beam } from './beam';
import { breakWeapon } from './break';
import { thunder } from './thunder';
import { sword } from './sword';
import { hammer } from './hammer';
import { trapShoot } from './trap-shoot';
import { trapStatus } from './trap-status';
import { repairPlant } from './repair-plant';

const DEFAULT: WeaponHandler = rifle;

const WEAPON_REGISTRY: Record<string, WeaponHandler> = {
  rifle,
  gatling,
  missile,
  laser,
  beam,
  break: breakWeapon,
  thunder,
  sword,
  hammer,
  trap_shoot: trapShoot,
  trap_status: trapStatus,
  repair_plant: repairPlant,
};

export function getWeaponHandler(weaponId: string): WeaponHandler {
  return WEAPON_REGISTRY[weaponId] ?? DEFAULT;
}

export function drawWeaponAnimation(
  ctx: CanvasRenderingContext2D,
  anim: WeaponAnimation,
  cellSize: number,
): void {
  getWeaponHandler(anim.weaponId).draw(ctx, anim, cellSize);
}

export function getWeaponSpeed(weaponId: string): { projectile: number; impact: number } {
  return getWeaponHandler(weaponId).speed;
}

export function hasImpactPhase(weaponId: string): boolean {
  return getWeaponHandler(weaponId).hasImpact;
}

export function getWeaponFlashAt(weaponId: string): {
  phase: 'projectile' | 'impact';
  progress: number;
  stagger: number;
} {
  const h = getWeaponHandler(weaponId);
  return { ...h.flashAt, stagger: h.flashStagger };
}
