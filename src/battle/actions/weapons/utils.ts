import { Position } from '../../../models/types';
import { CONFIG } from '../../../config';

export function cellCenter(pos: Position, cs: number): { px: number; py: number } {
  return { px: pos.x * cs + cs / 2, py: pos.y * cs + cs / 2 };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

export function parabola(t: number, height: number): number {
  return -4 * height * t * (t - 1);
}

export function isPlayerSide(origin: Position): boolean {
  return origin.x < CONFIG.TERRITORY_X;
}

export function teamCenterPx(origin: Position, cs: number): number {
  if (isPlayerSide(origin)) {
    return Math.floor(CONFIG.TERRITORY_X / 2) * cs + cs / 2;
  }
  return (
    (CONFIG.TERRITORY_X + Math.floor((CONFIG.GRID_COLS - CONFIG.TERRITORY_X) / 2)) * cs + cs / 2
  );
}

export function teamEdgePx(_origin: Position, cs: number): number {
  return CONFIG.TERRITORY_X * cs;
}
