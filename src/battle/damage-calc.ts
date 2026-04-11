import { CONFIG } from '../config';
import { MedabotState, PartDef, HitResult, WeaponDef } from '../models/types';
import { totalDefense, getEvasion } from '../models/medabot';
import { randFloat, rollHit } from '../utils/random';

export function calcDamage(
  attackPart: PartDef,
  target: MedabotState,
  disruptPenalty = 0,
  weapon?: WeaponDef,
): HitResult | null {
  const accuracy = (attackPart.accuracy ?? 80) - disruptPenalty;
  const evasion = getEvasion(target);
  const hitChance = accuracy - evasion;

  if (!rollHit(hitChance)) return null;

  let power = attackPart.attackPower ?? 0;
  const defense = totalDefense(target);
  const reduction = defense / (defense + CONFIG.DEFENSE_FACTOR);

  // ブレイク: 高装甲ほど威力UP
  if (weapon?.specialEffect === 'antiArmor') {
    power += Math.floor(defense * 0.3);
  }

  // パイル: 防御無視
  const effectiveReduction = weapon?.specialEffect === 'ignoreDefense' ? 0 : reduction;

  const variance = randFloat(CONFIG.DAMAGE_VARIANCE_MIN, CONFIG.DAMAGE_VARIANCE_MAX);
  const damage = Math.max(1, Math.floor(power * (1 - effectiveReduction) * variance));

  target.currentHp = Math.max(0, target.currentHp - damage);

  return {
    targetIndex: -1,
    targetTeam: target.team,
    damage,
    destroyed: target.currentHp <= 0,
  };
}
