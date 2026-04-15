import { CONFIG } from '../config';
import { Position } from '../models/types';
import { MEDABOTS } from '../data/medabots-db';
import { PARTS } from '../data/parts-db';
import { WEAPONS } from '../data/weapons-db';
import { pick, shuffle } from '../utils/random';

type Role = 'melee' | 'support' | 'ranged';

const SUPPORT_ACTIONS = new Set(['たすける', 'なおす', 'しかける']);

function classifyRole(medabotId: string): Role {
  const def = MEDABOTS[medabotId];
  if (!def) return 'ranged';

  const slotIds = [def.head, def.rightArm, def.leftArm];
  const parts = slotIds.map((pid) => PARTS[pid]).filter((p) => !!p);

  // 前衛判定: 腕に近接武器
  const armParts = [PARTS[def.rightArm], PARTS[def.leftArm]].filter((p) => !!p);
  const hasMelee = armParts.some((p) => {
    const w = p.weaponType ? WEAPONS[p.weaponType] : undefined;
    return w?.category === 'melee';
  });
  if (hasMelee) return 'melee';

  // 後衛判定: 支援系アクションが2個以上
  const supportCount = parts.filter((p) => p.actionType && SUPPORT_ACTIONS.has(p.actionType)).length;
  if (supportCount >= 2) return 'support';

  return 'ranged';
}

function assertNever(value: never): never {
  throw new Error(`Unhandled role: ${String(value)}`);
}

function preferredColumns(role: Role): number[] {
  const front = CONFIG.TERRITORY_X;
  const back = CONFIG.GRID_COLS - 1;

  // 敵陣全体（フォールバック用）
  const all: number[] = [];
  for (let x = front; x <= back; x++) all.push(x);

  const inBounds = (xs: number[]) => {
    const unique = [...new Set(xs.filter((x) => x >= front && x <= back))];
    return unique.length > 0 ? unique : all;
  };

  switch (role) {
    case 'melee':
      // 最前線2列
      return inBounds([front, front + 1]);
    case 'support':
      // 最後尾2列
      return inBounds([back - 1, back]);
    case 'ranged':
      // 中央帯（前線の1つ奥～最後尾の1つ手前）
      return inBounds([front + 1, front + 2, back - 1]);
    default:
      return assertNever(role);
  }
}

export function planEnemyPositions(enemyIds: string[]): Position[] {
  const occupied = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;
  const result: Position[] = [];

  const allRows = Array.from({ length: CONFIG.GRID_ROWS }, (_, i) => i);
  const enemyXs: number[] = [];
  for (let x = CONFIG.TERRITORY_X; x < CONFIG.GRID_COLS; x++) enemyXs.push(x);

  for (const id of enemyIds) {
    const role = classifyRole(id);
    const cols = preferredColumns(role);

    // 帯内で x→y の順に候補を試す
    const colOrder = shuffle(cols);
    const rowOrder = shuffle(allRows);
    let placed: Position | null = null;

    outer: for (const x of colOrder) {
      for (const y of rowOrder) {
        if (!occupied.has(key(x, y))) {
          placed = { x, y };
          break outer;
        }
      }
    }

    // フォールバック: 敵陣全体から空きマスを探す
    if (!placed) {
      const fallback: Position[] = [];
      for (const x of enemyXs) {
        for (const y of allRows) {
          if (!occupied.has(key(x, y))) fallback.push({ x, y });
        }
      }
      placed = fallback.length > 0 ? pick(fallback) : { x: CONFIG.GRID_COLS - 1, y: 0 };
    }

    occupied.add(key(placed.x, placed.y));
    result.push(placed);
  }

  return result;
}
