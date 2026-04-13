import { CONFIG } from '../config';
import { BattleState } from '../battle/battle-state';
import { Position, Team } from '../models/types';
import { isAlive } from '../models/medabot';
import { WeaponAnimation, drawWeaponAnimation, getWeaponSpeed, getWeaponFlashAt, hasImpactPhase } from './weapon-animations';

const C = CONFIG.COLORS;

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cellSize = CONFIG.CELL_PX;

  highlightMoveRange: Position[] = [];
  highlightAttackRange: Position[] = [];
  highlightScanRange: Position[] = [];
  /** pick3 等で選択済みのセル */
  highlightSelected: Position[] = [];
  selectedCell: Position | null = null;
  cursorCell: Position | null = null;

  private flashEffects: { pos: Position[]; color: string; frames: number }[] = [];
  private scanEffects: { rows: number[]; scannerTeam: Team; frames: number; totalFrames: number }[] = [];
  private moveAnim: { from: Position; to: Position; progress: number; color: string } | null = null;
  private weaponAnim: WeaponAnimation | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    this.canvas.width = CONFIG.GRID_COLS * this.cellSize;
    this.canvas.height = CONFIG.GRID_ROWS * this.cellSize;
  }

  render(state: BattleState): void {
    const ctx = this.ctx;
    const w = CONFIG.GRID_COLS * this.cellSize;
    const h = CONFIG.GRID_ROWS * this.cellSize;
    ctx.fillStyle = C.BG_DARK;
    ctx.fillRect(0, 0, w, h);
    this.drawGrid();
    this.drawTerritoryLine();
    this.drawHighlights();
    this.drawScanEffect();
    this.drawTraps(state);
    this.drawUnits(state);
    this.drawMoveAnim();
    this.drawWeaponAnim();
    this.drawFlashEffect();
    this.drawSelectedCell();
    this.drawCursor();
    this.drawScanlines(w, h);
  }

  private drawGrid(): void {
    const ctx = this.ctx;
    const cs = this.cellSize;
    for (let i = 0; i <= CONFIG.GRID_COLS; i++) {
      ctx.strokeStyle = C.GRID_LINE;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, CONFIG.GRID_ROWS * cs); ctx.stroke();
    }
    for (let j = 0; j <= CONFIG.GRID_ROWS; j++) {
      ctx.strokeStyle = C.GRID_LINE;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, j * cs); ctx.lineTo(CONFIG.GRID_COLS * cs, j * cs); ctx.stroke();
    }
  }

  private drawTerritoryLine(): void {
    const ctx = this.ctx;
    const x = CONFIG.TERRITORY_X * this.cellSize;
    ctx.save();
    ctx.strokeStyle = 'rgba(220, 20, 60, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CONFIG.GRID_ROWS * this.cellSize); ctx.stroke();
    ctx.restore();
  }

  private drawHighlights(): void {
    const ctx = this.ctx;
    const cs = this.cellSize;
    for (const p of this.highlightMoveRange) {
      ctx.fillStyle = C.MOVE_RANGE; ctx.fillRect(p.x * cs + 1, p.y * cs + 1, cs - 2, cs - 2);
    }
    for (const p of this.highlightAttackRange) {
      ctx.fillStyle = C.ATTACK_RANGE; ctx.fillRect(p.x * cs + 1, p.y * cs + 1, cs - 2, cs - 2);
    }
    for (const p of this.highlightScanRange) {
      ctx.fillStyle = C.SCAN_RANGE; ctx.fillRect(p.x * cs + 1, p.y * cs + 1, cs - 2, cs - 2);
    }
    // 選択済みセル（pick3）
    for (const p of this.highlightSelected) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x * cs + 3, p.y * cs + 3, cs - 6, cs - 6);
      ctx.restore();
    }
  }

  private drawUnits(state: BattleState): void {
    const cs = this.cellSize;
    for (const unit of state.playerTeam) {
      if (!isAlive(unit)) continue;
      const x = unit.position.x * cs + cs / 2;
      const y = unit.position.y * cs + cs / 2;
      this.drawBot(x, y, C.PLAYER_UNIT, unit.def.name[0], unit.isGuarding, unit.isConcealed ? 0.5 : 1);
    }
    for (let i = 0; i < state.enemyTeam.length; i++) {
      const unit = state.enemyTeam[i];
      if (!isAlive(unit) || !state.visibility.isRevealed(i)) continue;
      const x = unit.position.x * cs + cs / 2;
      const y = unit.position.y * cs + cs / 2;
      this.drawBot(x, y, C.ENEMY_SCANNED, '?', false, 1);
    }
    for (const unit of state.playerTeam) {
      if (isAlive(unit)) continue;
      this.drawDestroyedMarker(unit.position.x * cs + cs / 2, unit.position.y * cs + cs / 2, C.PLAYER_UNIT);
    }
  }

  private drawBot(cx: number, cy: number, color: string, label: string, guarding: boolean, alpha: number): void {
    const ctx = this.ctx;
    const r = this.cellSize * 0.35;
    ctx.save();
    ctx.globalAlpha = alpha * 0.2;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    if (guarding) {
      ctx.strokeStyle = C.ACCENT_GREEN; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.floor(this.cellSize * 0.3)}px 'DotGothic16', monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy);
    ctx.restore();
  }

  private drawDestroyedMarker(cx: number, cy: number, color: string): void {
    const ctx = this.ctx;
    const s = this.cellSize * 0.2;
    ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha = 0.3; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s);
    ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s);
    ctx.stroke(); ctx.restore();
  }

  private drawTraps(state: BattleState): void {
    const ctx = this.ctx;
    const cs = this.cellSize;
    for (const trap of state.traps) {
      if (trap.team !== Team.Player) continue;
      const x = trap.position.x * cs + cs / 2;
      const y = trap.position.y * cs + cs / 2;
      ctx.fillStyle = 'rgba(220, 20, 60, 0.3)';
      ctx.beginPath();
      ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y + 4); ctx.lineTo(x - 6, y + 4);
      ctx.closePath(); ctx.fill();
    }
  }

  private drawSelectedCell(): void {
    if (!this.selectedCell) return;
    const ctx = this.ctx; const cs = this.cellSize;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.strokeRect(this.selectedCell.x * cs + 2, this.selectedCell.y * cs + 2, cs - 4, cs - 4);
  }

  private drawCursor(): void {
    if (!this.cursorCell) return;
    const ctx = this.ctx;
    const cs = this.cellSize;
    const p = this.cursorCell;
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 150);
    ctx.save();
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + pulse * 0.6})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x * cs + 2, p.y * cs + 2, cs - 4, cs - 4);
    ctx.restore();
  }

  private drawScanlines(w: number, h: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  }

  private drawFlashEffect(): void {
    if (this.flashEffects.length === 0) return;
    const ctx = this.ctx; const cs = this.cellSize;
    for (const effect of this.flashEffects) {
      ctx.fillStyle = effect.color;
      for (const p of effect.pos) ctx.fillRect(p.x * cs, p.y * cs, cs, cs);
      effect.frames--;
    }
    this.flashEffects = this.flashEffects.filter(e => e.frames > 0);
  }

  flash(positions: Position[], color: string, frames = 15): void {
    this.flashEffects.push({ pos: positions, color, frames });
  }

  startScanEffect(center: Position, scannerTeam: Team, frames = 90): void {
    const rows: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      const y = center.y + dy;
      if (y >= 0 && y < CONFIG.GRID_ROWS) rows.push(y);
    }
    this.scanEffects.push({ rows, scannerTeam, frames, totalFrames: frames });
  }

  private drawScanEffect(): void {
    if (this.scanEffects.length === 0) return;
    const ctx = this.ctx;
    const cs = this.cellSize;
    for (const effect of this.scanEffects) {
      const t = effect.frames / effect.totalFrames;
      // パルス: 時間経過と位相で強弱
      const pulse = 0.5 + 0.5 * Math.sin((effect.totalFrames - effect.frames) * 0.2);
      const alpha = t * (0.25 + pulse * 0.25);

      // 対象陣地（相手側）を色付け、アイコンはスキャナー陣の敵側境界（最前列）に
      const scannedXStart = effect.scannerTeam === Team.Enemy ? 0 : CONFIG.TERRITORY_X;
      const scannedXEnd = effect.scannerTeam === Team.Enemy ? CONFIG.TERRITORY_X : CONFIG.GRID_COLS;
      const iconX = effect.scannerTeam === Team.Enemy ? CONFIG.TERRITORY_X : CONFIG.TERRITORY_X - 1;
      const dir = effect.scannerTeam === Team.Enemy ? -1 : 1; // 波の向き
      const rgb = effect.scannerTeam === Team.Enemy ? '255, 100, 100' : '57, 255, 20';

      ctx.save();
      for (const y of effect.rows) {
        // 対象行の被スキャン領域を着色
        ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
        ctx.fillRect(scannedXStart * cs, y * cs, (scannedXEnd - scannedXStart) * cs, cs);

        // スキャン対象領域にのみ薄いライン
        ctx.strokeStyle = `rgba(${rgb}, ${alpha * 1.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(scannedXStart * cs, y * cs + cs / 2);
        ctx.lineTo(scannedXEnd * cs, y * cs + cs / 2);
        ctx.stroke();

        // レーダー波アイコン: 実行側最前列に、敵側を向いた同心円弧×3
        const iconCx = iconX * cs + cs / 2;
        const iconCy = y * cs + cs / 2;
        const iconAlpha = 0.8 + pulse * 0.2 * t;

        // 背景円で視認性を確保
        ctx.globalAlpha = iconAlpha;
        ctx.fillStyle = 'rgba(10, 10, 20, 0.9)';
        ctx.beginPath();
        ctx.arc(iconCx, iconCy, cs * 0.38, 0, Math.PI * 2);
        ctx.fill();

        // 本体: 発信点の塗り丸
        ctx.fillStyle = `rgb(${rgb})`;
        ctx.beginPath();
        ctx.arc(iconCx, iconCy, cs * 0.08, 0, Math.PI * 2);
        ctx.fill();

        // 同心弧3本（敵方向に扇形、パルスで順に強調）
        ctx.strokeStyle = `rgb(${rgb})`;
        ctx.lineWidth = 2;
        const startAngle = dir > 0 ? -Math.PI / 3 : Math.PI - Math.PI / 3;
        const endAngle = dir > 0 ? Math.PI / 3 : Math.PI + Math.PI / 3;
        for (let i = 0; i < 3; i++) {
          const waveRadius = cs * (0.14 + i * 0.09);
          // 波ごとに位相をずらしたパルス
          const wavePulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin((effect.totalFrames - effect.frames) * 0.2 - i * 0.8));
          ctx.globalAlpha = iconAlpha * wavePulse;
          ctx.beginPath();
          ctx.arc(iconCx, iconCy, waveRadius, startAngle, endAngle);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      effect.frames--;
    }
    this.scanEffects = this.scanEffects.filter(e => e.frames > 0);
  }

  private drawMoveAnim(): void {
    if (!this.moveAnim) return;
    const ctx = this.ctx;
    const cs = this.cellSize;
    const a = this.moveAnim;
    const p = a.progress;

    const x1 = a.from.x * cs + cs / 2;
    const y1 = a.from.y * cs + cs / 2;
    const x2 = a.to.x * cs + cs / 2;
    const y2 = a.to.y * cs + cs / 2;
    const cx = x1 + (x2 - x1) * p;
    const cy = y1 + (y2 - y1) * p;

    ctx.save();
    ctx.globalAlpha = 0.6 * (1 - p);
    ctx.strokeStyle = a.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(cx, cy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    a.progress += 0.08;
    if (a.progress >= 1) this.moveAnim = null;
  }

  startMoveAnim(from: Position, to: Position, color: string): void {
    this.moveAnim = { from, to, progress: 0, color };
  }

  startWeaponAnim(params: {
    weaponId: string;
    origin: Position;
    targets: Position[];
    hasHits: boolean;
  }): Promise<void> {
    return new Promise(resolve => {
      const speeds = getWeaponSpeed(params.weaponId);
      this.weaponAnim = {
        weaponId: params.weaponId,
        origin: params.origin,
        targets: params.targets,
        phase: 'projectile',
        progress: 0,
        speed: speeds.projectile,
        impactSpeed: speeds.impact,
        hasHits: params.hasHits,
        flashFiredCount: 0,
        onComplete: () => {
          // miss 時のみ完了時にグレーフラッシュ
          if (!params.hasHits) {
            this.flash(params.targets, 'rgba(100, 100, 100, 0.3)', 8);
          }
          resolve();
        },
      };
    });
  }

  waitForAnimation(): Promise<void> {
    if (!this.weaponAnim) return Promise.resolve();
    return new Promise(resolve => {
      const orig = this.weaponAnim!.onComplete;
      this.weaponAnim!.onComplete = () => {
        orig?.();
        resolve();
      };
    });
  }

  private drawWeaponAnim(): void {
    if (!this.weaponAnim) return;
    const anim = this.weaponAnim;
    drawWeaponAnimation(this.ctx, anim, this.cellSize);

    // ターゲットごとの時間差フラッシュ発火
    if (anim.flashFiredCount < anim.targets.length && anim.hasHits) {
      const flashCfg = getWeaponFlashAt(anim.weaponId);
      if (anim.phase === flashCfg.phase) {
        for (let i = anim.flashFiredCount; i < anim.targets.length; i++) {
          const threshold = flashCfg.progress + i * flashCfg.stagger;
          if (anim.progress >= threshold) {
            this.flash([anim.targets[i]], 'rgba(220, 20, 60, 0.5)', 15);
            anim.flashFiredCount = i + 1;
          } else {
            break;
          }
        }
      }
    }

    // 進行更新
    anim.progress += anim.speed;
    if (anim.progress >= 1) {
      if (anim.phase === 'projectile' && hasImpactPhase(anim.weaponId)) {
        anim.phase = 'impact';
        anim.progress = 0;
        anim.speed = anim.impactSpeed;
      } else {
        const cb = anim.onComplete;
        this.weaponAnim = null;
        cb?.();
      }
    }
  }

  clearHighlights(): void {
    this.highlightMoveRange = [];
    this.highlightAttackRange = [];
    this.highlightScanRange = [];
    this.highlightSelected = [];
    this.selectedCell = null;
    this.cursorCell = null;
  }

  getCellFromPixel(px: number, py: number): Position | null {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = Math.floor((px - rect.left) * scaleX / this.cellSize);
    const y = Math.floor((py - rect.top) * scaleY / this.cellSize);
    if (x >= 0 && x < CONFIG.GRID_COLS && y >= 0 && y < CONFIG.GRID_ROWS) return { x, y };
    return null;
  }
}
