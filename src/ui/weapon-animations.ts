import { Position } from '../models/types';
import { CONFIG } from '../config';

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
  /** 武器固有の一時データ（稲妻の折れ線座標など） */
  extra?: unknown;
}

export type WeaponDrawFn = (
  ctx: CanvasRenderingContext2D,
  anim: WeaponAnimation,
  cellSize: number,
) => void;

// ── ユーティリティ ──

function cellCenter(pos: Position, cs: number): { px: number; py: number } {
  return { px: pos.x * cs + cs / 2, py: pos.y * cs + cs / 2 };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

function parabola(t: number, height: number): number {
  return -4 * height * t * (t - 1);
}

/** 攻撃者がプレイヤー側か判定 */
function isPlayerSide(origin: Position): boolean {
  return origin.x < CONFIG.TERRITORY_X;
}

/** 攻撃者の行の自陣中央ピクセルX座標 */
function teamCenterPx(origin: Position, cs: number): number {
  if (isPlayerSide(origin)) {
    return Math.floor(CONFIG.TERRITORY_X / 2) * cs + cs / 2;
  }
  return (CONFIG.TERRITORY_X + Math.floor((CONFIG.GRID_COLS - CONFIG.TERRITORY_X) / 2)) * cs + cs / 2;
}

/** 攻撃者の行の自陣境界ピクセルX座標（ビーム発射点） */
function teamEdgePx(origin: Position, cs: number): number {
  if (isPlayerSide(origin)) {
    return CONFIG.TERRITORY_X * cs; // 自陣右端
  }
  return CONFIG.TERRITORY_X * cs;   // 敵陣左端
}

// ── 武器別描画関数 ──

// --- rifle: ターゲットマスに弾着スパーク（位置を隠す） ---
const drawRifle: WeaponDrawFn = (ctx, anim, cs) => {
  if (anim.phase === 'impact') return;
  const n = anim.targets.length;
  const t = anim.progress;

  ctx.save();
  for (let i = 0; i < n; i++) {
    // 順次出現（少しずらす）
    const localT = clamp01((t - i * 0.2) / 0.6);
    if (localT <= 0) continue;
    const tgt = cellCenter(anim.targets[i], cs);

    // 閃光の拡大→縮小
    const flashR = localT < 0.3 ? lerp(0, 10, localT / 0.3) : lerp(10, 2, (localT - 0.3) / 0.7);
    const alpha = localT < 0.3 ? 1 : 1 - (localT - 0.3) / 0.7;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffdd44';
    ctx.shadowColor = '#ffdd44';
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(tgt.px, tgt.py, flashR, 0, Math.PI * 2); ctx.fill();

    // スパーク線
    if (localT < 0.5) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      for (let j = 0; j < 4; j++) {
        const angle = (Math.PI * 2 * j) / 4 + Math.PI / 4;
        const len = flashR * 1.5;
        ctx.beginPath();
        ctx.moveTo(tgt.px, tgt.py);
        ctx.lineTo(tgt.px + Math.cos(angle) * len, tgt.py + Math.sin(angle) * len);
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
  }
  ctx.restore();
};

// --- gatling: ターゲットマスに高速散弾スパーク群（位置を隠す） ---
const drawGatling: WeaponDrawFn = (ctx, anim, cs) => {
  if (anim.phase === 'impact') return;
  const n = anim.targets.length;
  const t = anim.progress;

  // ランダムオフセット生成（初回のみ）
  if (!anim.extra) {
    anim.extra = Array.from({ length: n * 6 }, () => ({
      dx: (Math.random() - 0.5) * cs * 0.6,
      dy: (Math.random() - 0.5) * cs * 0.6,
      delay: Math.random() * 0.3,
    }));
  }
  const sparks = anim.extra as { dx: number; dy: number; delay: number }[];

  ctx.save();
  for (let i = 0; i < n; i++) {
    const tgt = cellCenter(anim.targets[i], cs);
    for (let s = 0; s < 6; s++) {
      const spark = sparks[i * 6 + s];
      const localT = clamp01((t - spark.delay) / 0.5);
      if (localT <= 0 || localT >= 1) continue;
      const alpha = 1 - localT;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffaa';
      ctx.beginPath();
      ctx.arc(tgt.px + spark.dx * localT, tgt.py + spark.dy * localT, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
};

// --- missile: 自陣の縦列全マスから敵陣の縦列全マスへ放物線 ---
const drawMissile: WeaponDrawFn = (ctx, anim, cs) => {
  const originX = anim.origin.x;
  const targetX = anim.targets[0]?.x ?? (CONFIG.GRID_COLS - 1 - originX);

  // 発射元→着弾先のペアを生成（同じy座標同士で対応）
  if (!anim.extra) {
    const pairs: { from: Position; to: Position }[] = [];
    for (let y = 0; y < CONFIG.GRID_ROWS; y++) {
      pairs.push({ from: { x: originX, y }, to: { x: targetX, y } });
    }
    anim.extra = pairs;
  }
  const pairs = anim.extra as { from: Position; to: Position }[];

  if (anim.phase === 'projectile') {
    ctx.save();
    for (let idx = 0; idx < pairs.length; idx++) {
      const { from, to } = pairs[idx];
      // 上から順にタイミングをずらす
      const delay = idx * 0.08;
      const localT = clamp01((anim.progress - delay) / (1 - delay));
      if (localT <= 0) continue;

      const o = cellCenter(from, cs);
      const tgt = cellCenter(to, cs);
      const bx = lerp(o.px, tgt.px, localT);
      const by = lerp(o.py, tgt.py, localT) - parabola(localT, 35);

      // 排煙
      for (let i = 1; i <= 3; i++) {
        const st = clamp01(localT - i * 0.08);
        if (st <= 0) continue;
        const smx = lerp(o.px, tgt.px, st);
        const smy = lerp(o.py, tgt.py, st) - parabola(st, 35);
        ctx.fillStyle = `rgba(150, 150, 150, ${0.15 * (1 - i / 4)})`;
        ctx.beginPath(); ctx.arc(smx, smy, 2 + i, 0, Math.PI * 2); ctx.fill();
      }
      // 弾頭
      ctx.fillStyle = '#ff8844';
      ctx.shadowColor = '#ff4400';
      ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  } else {
    // 着弾爆発（上から順にタイミングずらし）
    ctx.save();
    for (let idx = 0; idx < pairs.length; idx++) {
      const delay = idx * 0.08;
      const localT = clamp01((anim.progress - delay) / (1 - delay));
      if (localT <= 0) continue;
      const r = localT * 25;
      const tgt = cellCenter(pairs[idx].to, cs);
      ctx.globalAlpha = 1 - localT;
      const grad = ctx.createRadialGradient(tgt.px, tgt.py, 0, tgt.px, tgt.py, r);
      grad.addColorStop(0, 'rgba(255, 100, 0, 0.8)');
      grad.addColorStop(0.6, 'rgba(255, 60, 0, 0.4)');
      grad.addColorStop(1, 'rgba(255, 60, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(tgt.px, tgt.py, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
};

// --- laser: 自陣端から最遠ターゲットまでビーム貫通 ---
const drawLaser: WeaponDrawFn = (ctx, anim, cs) => {
  if (anim.phase === 'impact') return;
  const player = isPlayerSide(anim.origin);
  const edgeX = teamEdgePx(anim.origin, cs);
  const oy = anim.origin.y * cs + cs / 2;
  // 最遠ターゲットを終点にする
  const farthest = player
    ? anim.targets.reduce((a, b) => b.x > a.x ? b : a, anim.targets[0])
    : anim.targets.reduce((a, b) => b.x < a.x ? b : a, anim.targets[0]);
  const endPt = cellCenter(farthest, cs);
  const t = anim.progress;
  const ex = lerp(edgeX, endPt.px, t);
  const ey = lerp(oy, endPt.py, t);

  ctx.save();
  ctx.strokeStyle = '#00ffff';
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.moveTo(edgeX, oy); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(edgeX, oy); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.shadowBlur = 0;

  // ビーム通過済みのターゲットマスにヒット閃光
  for (const pos of anim.targets) {
    const c = cellCenter(pos, cs);
    const ratio = endPt.px !== edgeX ? (c.px - edgeX) / (endPt.px - edgeX) : 0;
    if (t < ratio) continue;
    const flash = Math.max(0, 1 - (t - ratio) * 3);
    ctx.fillStyle = `rgba(200, 255, 255, ${flash * 0.5})`;
    ctx.fillRect(c.px - cs / 2, c.py - cs / 2, cs, cs);
  }
  ctx.restore();
};

// --- beam: 自陣端から最遠ターゲットまで太い光線貫通 ---
const drawBeam: WeaponDrawFn = (ctx, anim, cs) => {
  if (anim.phase === 'impact') return;
  const player = isPlayerSide(anim.origin);
  const edgeX = teamEdgePx(anim.origin, cs);
  const oy = anim.origin.y * cs + cs / 2;
  const farthest = player
    ? anim.targets.reduce((a, b) => b.x > a.x ? b : a, anim.targets[0])
    : anim.targets.reduce((a, b) => b.x < a.x ? b : a, anim.targets[0]);
  const endPt = cellCenter(farthest, cs);
  const t = anim.progress;
  const ex = lerp(edgeX, endPt.px, t);
  const ey = lerp(oy, endPt.py, t);

  ctx.save();
  ctx.strokeStyle = '#ff44ff';
  ctx.shadowColor = '#ff44ff';
  ctx.shadowBlur = 15;
  ctx.lineWidth = 8;
  ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.moveTo(edgeX, oy); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.strokeStyle = '#ffccff';
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.moveTo(edgeX, oy); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.shadowBlur = 0;

  // ビーム通過済みのターゲットマスにヒット閃光
  for (const pos of anim.targets) {
    const c = cellCenter(pos, cs);
    const ratio = endPt.px !== edgeX ? (c.px - edgeX) / (endPt.px - edgeX) : 0;
    if (t < ratio) continue;
    const flash = Math.max(0, 1 - (t - ratio) * 3);
    ctx.fillStyle = `rgba(255, 200, 255, ${flash * 0.5})`;
    ctx.fillRect(c.px - cs / 2, c.py - cs / 2, cs, cs);
  }
  ctx.restore();
};

// --- break: ターゲットマスに着弾閃光→十字衝撃波（位置を隠す） ---
const drawBreak: WeaponDrawFn = (ctx, anim, cs) => {
  const tgt = cellCenter(anim.targets[0], cs);

  if (anim.phase === 'projectile') {
    // 着弾閃光
    const t = anim.progress;
    const flashR = lerp(12, 4, t);
    ctx.save();
    ctx.globalAlpha = 1 - t * 0.5;
    ctx.fillStyle = '#ff3333';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(tgt.px, tgt.py, flashR, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  } else {
    // 十字衝撃波
    const t = anim.progress;
    const len = t * cs;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 6;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      ctx.beginPath();
      ctx.moveTo(tgt.px, tgt.py);
      ctx.lineTo(tgt.px + dx * len, tgt.py + dy * len);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }
};

// --- thunder: 上空からジグザグ稲妻（攻撃元の位置は不明） ---
const drawThunder: WeaponDrawFn = (ctx, anim, cs) => {
  // 稲妻パスを生成（初回のみ）
  if (!anim.extra) {
    const paths: { px: number; py: number }[][] = [];
    for (const pos of anim.targets) {
      const c = cellCenter(pos, cs);
      const segs: { px: number; py: number }[] = [{ px: c.px + (Math.random() - 0.5) * 20, py: -10 }];
      const steps = 4 + Math.floor(Math.random() * 3);
      for (let i = 1; i <= steps; i++) {
        segs.push({
          px: lerp(segs[0].px, c.px, i / steps) + (Math.random() - 0.5) * 20,
          py: lerp(-10, c.py, i / steps),
        });
      }
      segs.push({ px: c.px, py: c.py });
      paths.push(segs);
    }
    anim.extra = paths;
  }
  const paths = anim.extra as { px: number; py: number }[][];
  const t = anim.progress;

  ctx.save();
  if (anim.phase === 'projectile') {
    const drawLen = t < 0.4 ? t / 0.4 : 1;
    const alpha = t < 0.4 ? 1 : Math.max(0, 1 - (t - 0.4) / 0.6);
    ctx.globalAlpha = alpha;

    for (const segs of paths) {
      const n = Math.ceil(segs.length * drawLen);
      ctx.strokeStyle = '#ffff88';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(segs[0].px, segs[0].py);
      for (let i = 1; i < n; i++) ctx.lineTo(segs[i].px, segs[i].py);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(segs[0].px, segs[0].py);
      for (let i = 1; i < n; i++) ctx.lineTo(segs[i].px, segs[i].py);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // ヒット時フラッシュ
    if (t > 0.3 && t < 0.5) {
      const flashAlpha = (1 - Math.abs(t - 0.4) / 0.1) * 0.3;
      for (const pos of anim.targets) {
        const c = cellCenter(pos, cs);
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.fillRect(c.px - cs / 2, c.py - cs / 2, cs, cs);
      }
    }
  }
  ctx.restore();
};

// --- sword: 行の自陣中央から斬撃弧（行はバレるがx位置は不明） ---
const drawSword: WeaponDrawFn = (ctx, anim, cs) => {
  if (anim.phase === 'impact') return;
  const centerX = teamCenterPx(anim.origin, cs);
  const centerY = anim.origin.y * cs + cs / 2;
  const t = anim.progress;

  // 自陣中央の前方に弧を描く
  const player = isPlayerSide(anim.origin);
  const offsetX = player ? cs * 2 : -cs * 2;
  const arcCx = centerX + offsetX;
  const arcCy = centerY;
  const r = cs * 1.5;

  ctx.save();
  const sweepAngle = Math.PI * 0.9;
  const startAngle = -sweepAngle / 2;
  const currentAngle = startAngle + sweepAngle * clamp01(t * 2);
  const alpha = t < 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) / 0.5);

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#00ffff';
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 10;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(arcCx, arcCy, r, startAngle, currentAngle);
  ctx.stroke();

  // 先端に光点
  if (t < 0.6) {
    const tipX = arcCx + r * Math.cos(currentAngle);
    const tipY = arcCy + r * Math.sin(currentAngle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(tipX, tipY, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.restore();
};

// --- hammer: 行の自陣中央から衝撃波リング（行はバレるがx位置は不明） ---
const drawHammer: WeaponDrawFn = (ctx, anim, cs) => {
  const centerX = teamCenterPx(anim.origin, cs);
  const centerY = anim.origin.y * cs + cs / 2;
  const player = isPlayerSide(anim.origin);
  const hitX = centerX + (player ? cs * 2 : -cs * 2);

  if (anim.phase === 'projectile') {
    // 構え（集中エフェクト）
    const t = anim.progress;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = '#ff8800';
    ctx.lineWidth = 2;
    const shrink = (1 - t) * cs;
    ctx.beginPath(); ctx.arc(hitX, centerY, shrink, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  } else {
    // 衝撃波リング
    const t = anim.progress;
    const r = t * cs * 2.5;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = '#ff8800';
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 3 * (1 - t) + 1;
    ctx.beginPath(); ctx.arc(hitX, centerY, r, 0, Math.PI * 2); ctx.stroke();
    // 内側リング
    if (t < 0.6) {
      ctx.strokeStyle = '#ffcc44';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(hitX, centerY, r * 0.6, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }
};

// --- trap_shoot: 射撃トラップ投擲（自陣内なので位置バレは問題なし） ---
const drawTrapShoot: WeaponDrawFn = (ctx, anim, cs) => {
  if (anim.phase === 'impact') return;
  const o = cellCenter(anim.origin, cs);
  const tgt = cellCenter(anim.targets[0], cs);
  const t = anim.progress;
  const bx = lerp(o.px, tgt.px, t);
  const by = lerp(o.py, tgt.py, t) - parabola(t, 30);

  ctx.save();
  ctx.fillStyle = 'rgba(220, 20, 60, 0.8)';
  ctx.beginPath();
  ctx.moveTo(bx, by - 6); ctx.lineTo(bx + 5, by + 4); ctx.lineTo(bx - 5, by + 4);
  ctx.closePath(); ctx.fill();
  ctx.restore();
};

// --- trap_status: 状態トラップ投擲 ---
const drawTrapStatus: WeaponDrawFn = (ctx, anim, cs) => {
  if (anim.phase === 'impact') return;
  const o = cellCenter(anim.origin, cs);
  const tgt = cellCenter(anim.targets[0], cs);
  const t = anim.progress;
  const bx = lerp(o.px, tgt.px, t);
  const by = lerp(o.py, tgt.py, t) - parabola(t, 30);

  ctx.save();
  ctx.fillStyle = 'rgba(160, 60, 200, 0.8)';
  ctx.beginPath();
  ctx.moveTo(bx, by - 6); ctx.lineTo(bx + 5, by + 4); ctx.lineTo(bx - 5, by + 4);
  ctx.closePath(); ctx.fill();
  ctx.restore();
};

// --- repair_plant: 回復エリア設置 ---
const drawRepairPlant: WeaponDrawFn = (ctx, anim, cs) => {
  const o = cellCenter(anim.origin, cs);
  const tgt = cellCenter(anim.targets[0], cs);

  if (anim.phase === 'projectile') {
    const t = anim.progress;
    const bx = lerp(o.px, tgt.px, t);
    const by = lerp(o.py, tgt.py, t) - parabola(t, 25);
    ctx.save();
    ctx.fillStyle = '#44ff44';
    ctx.shadowColor = '#44ff44';
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  } else {
    // 緑十字マーク
    const t = anim.progress;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = '#44ff44';
    const s = 3 + t * 4;
    ctx.fillRect(tgt.px - s, tgt.py - s * 3, s * 2, s * 6);
    ctx.fillRect(tgt.px - s * 3, tgt.py - s, s * 6, s * 2);
    ctx.restore();
  }
};

// ── 描画関数マップ ──

const WEAPON_DRAW_MAP: Record<string, WeaponDrawFn> = {
  rifle: drawRifle,
  missile: drawMissile,
  gatling: drawGatling,
  laser: drawLaser,
  beam: drawBeam,
  break: drawBreak,
  thunder: drawThunder,
  sword: drawSword,
  hammer: drawHammer,
  trap_shoot: drawTrapShoot,
  trap_status: drawTrapStatus,
  repair_plant: drawRepairPlant,
};

// ── 武器アニメーション速度設定 ──

const WEAPON_SPEED: Record<string, { projectile: number; impact: number }> = {
  rifle:        { projectile: 0.05, impact: 0.10 },
  gatling:      { projectile: 0.06, impact: 0.10 },
  missile:      { projectile: 0.04, impact: 0.06 },
  laser:        { projectile: 0.08, impact: 0.10 },
  beam:         { projectile: 0.06, impact: 0.10 },
  break:        { projectile: 0.06, impact: 0.06 },
  thunder:      { projectile: 0.05, impact: 0.10 },
  sword:        { projectile: 0.05, impact: 0.10 },
  hammer:       { projectile: 0.06, impact: 0.06 },
  trap_shoot:   { projectile: 0.05, impact: 0.08 },
  trap_status:  { projectile: 0.05, impact: 0.08 },
  repair_plant: { projectile: 0.05, impact: 0.06 },
};

/** 武器アニメーションの描画を実行 */
export function drawWeaponAnimation(
  ctx: CanvasRenderingContext2D,
  anim: WeaponAnimation,
  cellSize: number,
): void {
  const drawFn = WEAPON_DRAW_MAP[anim.weaponId] ?? drawRifle;
  drawFn(ctx, anim, cellSize);
}

/** 武器IDからアニメーション速度を取得 */
export function getWeaponSpeed(weaponId: string): { projectile: number; impact: number } {
  return WEAPON_SPEED[weaponId] ?? { projectile: 0.06, impact: 0.08 };
}

/** impact フェーズがある武器かどうか */
export function hasImpactPhase(weaponId: string): boolean {
  return ['missile', 'break', 'hammer', 'repair_plant'].includes(weaponId);
}
