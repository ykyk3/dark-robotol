export enum PartSlot {
  Head = 'head',
  RightArm = 'rightArm',
  LeftArm = 'leftArm',
  Legs = 'legs',
}

/** 行動タイプ（ダークロボトル準拠） */
export type ActionType =
  | 'こうげき' // 攻撃（weaponTypeで種別が決まる）
  | 'まもる' // 防御: 味方をかばう
  | 'なおす' // 回復: 味方HP回復
  | 'たすける' // 補助: 索敵・隠蔽・解除・応援・妨害
  | 'しかける'; // 設置: トラップ・プラント

/** 武器種別の射程パターン */
export type TargetingType =
  | 'line' // 4方向直線
  | 'adjacent' // 隣接4マス（格闘）
  | 'free'; // 射程内の任意マス（ミサイル・トラップ等）

/** 武器カテゴリ */
export type WeaponCategory = 'shooting' | 'melee' | 'trap' | 'plant';

/** 武器種別定義（weapons.jsonの1エントリ） */
export interface WeaponDef {
  id: string;
  name: string;
  category: WeaponCategory;
  targeting: TargetingType;
  defaultRange: number;
  blastArea: number; // 0=単体, 1=十字, 2=3x3
  blastShape?: 'pick3' | 'same_col' | 'mirror_col' | 'front4' | 'front2' | 'vertical_line';
  hitCount: number; // 攻撃回数（ガトリング=3等）
  pierce: boolean; // 貫通（直線上の全敵ヒット）
  specialEffect?: string;
  description?: string;
}

/** たすけるのサブタイプ（ダークロボトル準拠） */
export type AssistType =
  | 'scan' // 索敵
  | 'conceal' // 隠蔽
  | 'disarm' // 解除（射撃ダメージ1に軽減）
  | 'doubleAction' // 変化/応援（次の味方が2連続行動）
  | 'jamming'; // 妨害（敵の前ターン行動を封印）

/** 索敵パターン */
export type ScanType = 'cross' | 'area' | 'line';

/** 脚部タイプ */
export type LegType = 'bipedal' | 'multiLeg' | 'vehicle' | 'tank' | 'flight' | 'hover';

export enum ActionKind {
  Move = 'move',
  Attack = 'attack', // 攻撃（武器種別で挙動決定）
  Assist = 'assist', // 補助（たすける）
  SetDevice = 'setDevice', // 設置（しかける）
  Guard = 'guard', // 防御（まもる）
  Heal = 'heal', // 回復（なおす）
  Skip = 'skip',
}

export enum Team {
  Player = 'player',
  Enemy = 'enemy',
}

export enum BattlePhase {
  Title = 'title',
  Deploy = 'deploy',
  PlayerTurn = 'playerTurn',
  EnemyTurn = 'enemyTurn',
  Victory = 'victory',
  Defeat = 'defeat',
}

export interface Position {
  x: number;
  y: number;
}

// ── パーツ定義 ──

export interface PartDef {
  id: string;
  name: string;
  slot: PartSlot;
  description?: string;
  defense?: number;

  // 行動タイプ（このパーツで何ができるか）
  actionType?: ActionType;

  // 攻撃系（こうげき）
  weaponType?: string; // weapons.json の id を参照
  attackPower?: number;
  accuracy?: number;
  rangeOverride?: number; // 武器種別のdefaultRangeを上書き

  // 頭部の使用回数（原作では頭部は回数制限あり）
  headUses?: number;

  // 補助系（たすける）
  assistType?: AssistType;
  scanRange?: number;
  scanType?: ScanType;
  concealTurns?: number;
  disarmTurns?: number; // 解除の持続ターン数（デフォルト1）

  // 防御系（まもる）
  guardDefenseBonus?: number;

  // 回復系（なおす）
  healAmount?: number;

  // 設置系（しかける）
  // weaponType で trap_shoot / repair_plant 等を参照
  trapPower?: number;

  // 脚部
  legType?: LegType;
  moveRange?: number;
  evasion?: number;
}

// ── メダロット定義 ──

export interface MedabotDef {
  id: string;
  name: string;
  hp: number;
  head: string;
  rightArm: string;
  leftArm: string;
  legs: string;
}

export interface MedabotState {
  def: MedabotDef;
  currentHp: number;
  position: Position;
  team: Team;
  hasActed: boolean;
  isGuarding: boolean;
  isConcealed: boolean;
  concealTurnsLeft: number;
  isCountering: boolean;
  counterRatio: number;
  isDisarmed: boolean;
  disarmTurnsLeft: number;
  hasDoubleAction: boolean;
  lastActionPartSlot?: PartSlot;
  jammedPartSlot?: PartSlot;
  parts: ResolvedParts;
}

export interface ResolvedParts {
  head: PartDef;
  rightArm: PartDef;
  leftArm: PartDef;
  legs: PartDef;
}

// ── バトル ──

export interface BattleAction {
  kind: ActionKind;
  unitIndex: number;
  target?: Position;
  targets?: Position[]; // 複数対象攻撃（ライフル pick3）
  partSlot?: PartSlot; // どのパーツで行動するか
  targetUnitIndex?: number; // 回復対象のユニットインデックス
}

export type GameEvent =
  | { type: 'move'; unitIndex: number; team: Team; from: Position; to: Position }
  | {
      type: 'attack';
      unitIndex: number;
      team: Team;
      origin: Position;
      target: Position;
      targets?: Position[];
      weaponId: string;
      hits: HitResult[];
      messages: string[];
    }
  | { type: 'scan'; unitIndex: number; team: Team; center: Position; found: Position[] }
  | { type: 'assist'; unitIndex: number; team: Team; assistType: AssistType }
  | {
      type: 'setDevice';
      unitIndex: number;
      team: Team;
      origin: Position;
      target: Position;
      weaponId: string;
    }
  | { type: 'guard'; unitIndex: number; team: Team }
  | { type: 'heal'; unitIndex: number; team: Team; target: number; amount: number }
  | { type: 'destroy'; unitIndex: number; team: Team }
  | { type: 'turnStart'; team: Team }
  | { type: 'turnEnd'; team: Team }
  | { type: 'victory'; winner: Team }
  | { type: 'message'; text: string };

export interface HitResult {
  targetIndex: number;
  targetTeam: Team;
  damage: number;
  destroyed: boolean;
}
