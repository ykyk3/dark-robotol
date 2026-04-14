import { CONFIG } from '../config';
import {
  BattlePhase,
  Team,
  MedabotState,
  BattleAction,
  Position,
  PartDef,
} from '../models/types';
import { createMedabot, isAlive, getMoveRange } from '../models/medabot';
import { MEDABOTS } from '../data/medabots-db';
import { getWeapon } from '../data/weapons-db';
import {
  getMovablePositions,
  posEqual,
  getTargetCells,
  getAutoTargetPreview,
  isInTerritory,
} from './grid';
import { VisibilityManager } from './visibility';
import { eventBus } from '../utils/event-bus';
import { dispatchAction } from './actions';

export class BattleState {
  phase: BattlePhase = BattlePhase.Title;
  playerTeam: MedabotState[] = [];
  enemyTeam: MedabotState[] = [];
  visibility = new VisibilityManager();
  enemyVisibility = new VisibilityManager();
  turnCount = 0;
  traps: { position: Position; team: Team; power: number }[] = [];

  currentUnitIndex = 0;
  /** 'move' = 移動選択中, 'action' = 行動選択中 */
  unitPhase: 'move' | 'action' | 'done' = 'move';
  preMovePosition: Position | null = null;

  // 配置フェーズ
  private playerDefs: string[] = [];
  deployIndex = 0;
  get deployTotal(): number {
    return this.playerDefs.length;
  }

  init(playerIds: string[], enemyIds: string[]): void {
    this.visibility.reset();
    this.enemyVisibility.reset();
    this.traps = [];
    this.turnCount = 0;
    this.preMovePosition = null;

    // 敵は自動配置（右端列＝後列）
    this.enemyTeam = enemyIds.map((id, i) => {
      const def = MEDABOTS[id];
      return createMedabot(def, { x: CONFIG.GRID_COLS - 1, y: 1 + i }, Team.Enemy);
    });

    // プレイヤーは配置フェーズで配置
    this.playerTeam = [];
    this.playerDefs = playerIds;
    this.deployIndex = 0;

    this.phase = BattlePhase.Deploy;
  }

  // ── 配置フェーズ ──

  getDeployingUnitName(): string | null {
    if (this.deployIndex >= this.playerDefs.length) return null;
    return MEDABOTS[this.playerDefs[this.deployIndex]]?.name ?? null;
  }

  getDeployableCells(): Position[] {
    const occupied = new Set(this.playerTeam.map((u) => `${u.position.x},${u.position.y}`));
    const cells: Position[] = [];
    for (let x = 0; x < CONFIG.TERRITORY_X; x++) {
      for (let y = 0; y < CONFIG.GRID_ROWS; y++) {
        if (!occupied.has(`${x},${y}`)) cells.push({ x, y });
      }
    }
    return cells;
  }

  deployUnit(pos: Position): boolean {
    if (this.phase !== BattlePhase.Deploy) return false;
    if (this.deployIndex >= this.playerDefs.length) return false;
    if (!isInTerritory(pos, Team.Player)) return false;
    if (this.playerTeam.some((u) => posEqual(u.position, pos))) return false;

    const def = MEDABOTS[this.playerDefs[this.deployIndex]];
    this.playerTeam.push(createMedabot(def, pos, Team.Player));
    this.deployIndex++;

    if (this.deployIndex >= this.playerDefs.length) {
      this.phase = BattlePhase.PlayerTurn;
      this.startTurn(Team.Player);
    }
    return true;
  }

  // ── ターン管理 ──

  private startTurn(team: Team): void {
    const units = team === Team.Player ? this.playerTeam : this.enemyTeam;
    for (const u of units) {
      u.hasActed = false;
      u.isGuarding = false;
      u.isCountering = false;
      u.counterRatio = 0;
      if (u.concealTurnsLeft > 0) {
        u.concealTurnsLeft--;
        if (u.concealTurnsLeft <= 0) u.isConcealed = false;
      }
      if (u.disarmTurnsLeft > 0) {
        u.disarmTurnsLeft--;
        if (u.disarmTurnsLeft <= 0) u.isDisarmed = false;
      }
      u.lastActionPartSlot = undefined;
      // 注: jammedPartSlot はターン開始時にはクリアしない
      // プレイヤーが前ターン終了時に敵にかけた妨害を、敵ターン開始時にすぐ解除させないため
    }
    this.currentUnitIndex = 0;
    this.unitPhase = 'action';
    this.preMovePosition = null;
    this.skipDeadUnits(team);
    // ラウンド数はプレイヤーターン開始時のみインクリメント（1ラウンド = 自軍→敵軍）
    if (team === Team.Player) this.turnCount++;
    eventBus.emit({ type: 'turnStart', team });
  }

  private skipDeadUnits(team: Team): void {
    const units = team === Team.Player ? this.playerTeam : this.enemyTeam;
    while (this.currentUnitIndex < units.length && !isAlive(units[this.currentUnitIndex])) {
      this.currentUnitIndex++;
    }
  }

  getAllBots(): MedabotState[] {
    return [...this.playerTeam, ...this.enemyTeam];
  }
  getAlivePlayerUnits(): MedabotState[] {
    return this.playerTeam.filter(isAlive);
  }
  getAliveEnemyUnits(): MedabotState[] {
    return this.enemyTeam.filter(isAlive);
  }

  getCurrentUnit(): MedabotState | null {
    const units = this.phase === BattlePhase.PlayerTurn ? this.playerTeam : this.enemyTeam;
    if (this.currentUnitIndex >= units.length) return null;
    const unit = units[this.currentUnitIndex];
    return isAlive(unit) ? unit : null;
  }

  undoMove(): boolean {
    if (this.unitPhase !== 'action' || !this.preMovePosition) return false;
    const unit = this.getCurrentUnit();
    if (!unit) return false;
    unit.position = { ...this.preMovePosition };
    this.preMovePosition = null;
    this.unitPhase = 'move';
    return true;
  }

  /** 移動可能マス（脚部 moveRange に応じる） */
  getMovableForCurrent(): Position[] {
    const unit = this.getCurrentUnit();
    if (!unit) return [];
    return getMovablePositions(unit, this.getAllBots(), getMoveRange(unit));
  }

  getTargetsForPart(part: PartDef): Position[] {
    if (!part.weaponType) return [];
    const weapon = getWeapon(part.weaponType);
    if (!weapon) return [];
    const team = this.phase === BattlePhase.PlayerTurn ? Team.Player : Team.Enemy;
    const unit = this.getCurrentUnit();
    return getTargetCells(weapon, team, unit?.position.x ?? 0);
  }

  getAutoTargetPreviewForPart(part: PartDef, from: Position): Position[] {
    if (!part.weaponType) return [];
    const weapon = getWeapon(part.weaponType);
    if (!weapon) return [];
    const team = this.phase === BattlePhase.PlayerTurn ? Team.Player : Team.Enemy;
    return getAutoTargetPreview(weapon, from, team);
  }

  // ── アクション実行 ──

  executeAction(action: BattleAction): void {
    dispatchAction(action, this);
  }

  checkTraps(unit: MedabotState, unitIndex: number, team: Team): void {
    const triggered = this.traps.filter(
      (t) => t.team !== team && posEqual(t.position, unit.position),
    );
    for (const trap of triggered) {
      const damage = Math.max(1, Math.floor(trap.power * 0.8));
      unit.currentHp = Math.max(0, unit.currentHp - damage);
      eventBus.emit({
        type: 'message',
        text: `${unit.def.name}がトラップを踏んだ！${damage}ダメージ！`,
      });
      if (unit.currentHp <= 0) {
        eventBus.emit({ type: 'destroy', unitIndex, team });
      }
    }
    this.traps = this.traps.filter(
      (t) => !(t.team !== team && posEqual(t.position, unit.position)),
    );
  }

  advanceUnit(team: Team): void {
    const units = team === Team.Player ? this.playerTeam : this.enemyTeam;
    const currentUnit = units[this.currentUnitIndex];

    // 2連続行動チェック
    if (currentUnit.hasDoubleAction) {
      currentUnit.hasDoubleAction = false;
      currentUnit.hasActed = false;
      this.unitPhase = 'action';
      this.preMovePosition = null;
      return;
    }

    currentUnit.hasActed = true;
    this.currentUnitIndex++;
    this.unitPhase = 'action';
    this.preMovePosition = null;
    this.skipDeadUnits(team);

    if (
      this.currentUnitIndex >= units.length ||
      this.getAliveUnitsForTeam(team).every((u) => u.hasActed)
    ) {
      this.endTurn(team);
    }
  }

  private getAliveUnitsForTeam(team: Team): MedabotState[] {
    return team === Team.Player ? this.getAlivePlayerUnits() : this.getAliveEnemyUnits();
  }

  private endTurn(team: Team): void {
    eventBus.emit({ type: 'turnEnd', team });
    if (team === Team.Player) this.visibility.tickTurn();
    if (team === Team.Enemy) this.enemyVisibility.tickTurn();
    // 自分のターンが終わる時点で、自ユニットに掛かっていた妨害を解除（1ターンのみ有効）
    const units = team === Team.Player ? this.playerTeam : this.enemyTeam;
    for (const u of units) u.jammedPartSlot = undefined;
    if (this.checkVictory()) return;

    if (team === Team.Player) {
      this.phase = BattlePhase.EnemyTurn;
      this.startTurn(Team.Enemy);
    } else {
      this.phase = BattlePhase.PlayerTurn;
      this.startTurn(Team.Player);
    }
  }

  checkVictory(): boolean {
    if (this.getAliveEnemyUnits().length === 0) {
      this.phase = BattlePhase.Victory;
      eventBus.emit({ type: 'victory', winner: Team.Player });
      return true;
    }
    if (this.getAlivePlayerUnits().length === 0) {
      this.phase = BattlePhase.Defeat;
      eventBus.emit({ type: 'victory', winner: Team.Enemy });
      return true;
    }
    return false;
  }
}
