import { CONFIG } from '../config';
import { Position, MedabotState, Team, WeaponDef } from '../models/types';

export function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function inBounds(p: Position): boolean {
  return p.x >= 0 && p.x < CONFIG.GRID_COLS && p.y >= 0 && p.y < CONFIG.GRID_ROWS;
}

export function posEqual(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

/** 左が自陣(x<6)、右が敵陣(x>=6) */
export function isInTerritory(p: Position, team: Team): boolean {
  if (team === Team.Player) return p.x < CONFIG.TERRITORY_X;
  return p.x >= CONFIG.TERRITORY_X;
}

/** 敵陣の最前列 x 座標（相手に最も近い列） */
export function enemyFrontCol(team: Team): number {
  // Player が攻撃する場合: 敵陣の左端 x=6
  // Enemy が攻撃する場合: 自陣の右端 x=5
  return team === Team.Player ? CONFIG.TERRITORY_X : CONFIG.TERRITORY_X - 1;
}

/** 敵陣の全セルを返す */
export function getEnemyTerritoryCells(team: Team): Position[] {
  const cells: Position[] = [];
  for (let x = 0; x < CONFIG.GRID_COLS; x++) {
    for (let y = 0; y < CONFIG.GRID_ROWS; y++) {
      if (!isInTerritory({ x, y }, team)) cells.push({ x, y });
    }
  }
  return cells;
}

// ── 移動 ──

export function getMovablePositions(
  bot: MedabotState,
  allBots: MedabotState[],
  moveRange: number,
): Position[] {
  const occupied = new Set(
    allBots
      .filter(b => b.currentHp > 0 && b !== bot)
      .map(b => `${b.position.x},${b.position.y}`),
  );

  const result: Position[] = [];
  for (let x = 0; x < CONFIG.GRID_COLS; x++) {
    for (let y = 0; y < CONFIG.GRID_ROWS; y++) {
      const p = { x, y };
      if (
        manhattan(bot.position, p) <= moveRange &&
        manhattan(bot.position, p) > 0 &&
        !occupied.has(`${x},${y}`) &&
        isInTerritory(p, bot.team)
      ) {
        result.push(p);
      }
    }
  }
  return result;
}

// ── 攻撃対象マス（UI ハイライト用） ──

export function getShootingTargets(team: Team): Position[] {
  return getEnemyTerritoryCells(team);
}

/** 格闘系: 自分の位置から前方4マス、縦は全行 */
export function getMeleeTargets(team: Team, attackerX: number): Position[] {
  const result: Position[] = [];
  for (let d = 1; d <= 4; d++) {
    const x = team === Team.Player ? attackerX + d : attackerX - d;
    if (x < 0 || x >= CONFIG.GRID_COLS) continue;
    if (isInTerritory({ x, y: 0 }, team)) continue;
    for (let y = 0; y < CONFIG.GRID_ROWS; y++) {
      result.push({ x, y });
    }
  }
  return result;
}

/** 武器に応じたターゲット候補（UI ハイライト用） */
export function getTargetCells(weapon: WeaponDef, team: Team, attackerX = 0): Position[] {
  if (weapon.blastShape === 'same_col' || weapon.blastShape === 'mirror_col' || weapon.blastShape === 'front4' || weapon.blastShape === 'front2' || weapon.blastShape === 'vertical_line') {
    return []; // 自動照準
  }
  if (weapon.category === 'melee') return getMeleeTargets(team, attackerX);
  return getShootingTargets(team);
}

// ── 着弾パターン ──

export function getBlastShapePositions(
  attacker: Position, target: Position, team: Team, shape: string,
): Position[] {
  switch (shape) {
    case 'pick3':
      return [target];

    case 'same_col': {
      // 同軸上: 自分と同じ y ラインの敵陣全マス
      const positions: Position[] = [];
      for (let x = 0; x < CONFIG.GRID_COLS; x++) {
        const p = { x, y: attacker.y };
        if (!isInTerritory(p, team)) positions.push(p);
      }
      return positions;
    }

    case 'mirror_col': {
      // ミラーライン: y を反転した敵陣全マス
      const mirrorY = CONFIG.GRID_ROWS - 1 - attacker.y;
      const positions: Position[] = [];
      for (let x = 0; x < CONFIG.GRID_COLS; x++) {
        const p = { x, y: mirrorY };
        if (!isInTerritory(p, team)) positions.push(p);
      }
      return positions;
    }

    case 'front4':
    case 'front2': {
      // 前方Nライン: 自分の位置から前方N列、縦は全行
      const depth = shape === 'front2' ? 2 : 4;
      const positions: Position[] = [];
      for (let d = 1; d <= depth; d++) {
        const x = team === Team.Player ? attacker.x + d : attacker.x - d;
        if (x < 0 || x >= CONFIG.GRID_COLS) continue;
        if (isInTerritory({ x, y: 0 }, team)) continue;
        for (let y = 0; y < CONFIG.GRID_ROWS; y++) {
          positions.push({ x, y });
        }
      }
      return positions;
    }

    case 'vertical_line': {
      // ミラー列: 自陣最後列→敵陣最後列、自陣最前列→敵陣最前列
      const targetX = CONFIG.GRID_COLS - 1 - attacker.x;
      const positions: Position[] = [];
      for (let y = 0; y < CONFIG.GRID_ROWS; y++) {
        const p = { x: targetX, y };
        if (inBounds(p) && !isInTerritory(p, team)) positions.push(p);
      }
      return positions;
    }

    default:
      return [target];
  }
}

export function getBlastPositions(center: Position, area: number): Position[] {
  if (area === 0) return [center];

  const positions = [center];
  if (area >= 1) {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const p = { x: center.x + dx, y: center.y + dy };
      if (inBounds(p)) positions.push(p);
    }
  }
  if (area >= 2) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const p = { x: center.x + dx, y: center.y + dy };
        if (inBounds(p) && !positions.some(q => posEqual(q, p))) {
          positions.push(p);
        }
      }
    }
  }
  return positions;
}

// ── 索敵: 同軸(同 y)＋上下1ラインの敵陣全域 ──

export function getScanPositions(attacker: Position, team: Team): Position[] {
  const positions: Position[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    const y = attacker.y + dy;
    if (y < 0 || y >= CONFIG.GRID_ROWS) continue;
    for (let x = 0; x < CONFIG.GRID_COLS; x++) {
      const p = { x, y };
      if (!isInTerritory(p, team)) positions.push(p);
    }
  }
  return positions;
}

// ── 自動照準プレビュー（UI 用） ──

export function getAutoTargetPreview(
  weapon: WeaponDef, attacker: Position, team: Team,
): Position[] {
  if (!weapon.blastShape) return [];
  return getBlastShapePositions(attacker, attacker, team, weapon.blastShape);
}
