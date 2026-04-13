import { CONFIG } from '../config';
import {
  BattlePhase, Team, MedabotState, BattleAction, ActionKind,
  Position, HitResult, PartDef, PartSlot, WeaponDef,
} from '../models/types';
import { createMedabot, isAlive } from '../models/medabot';
import { MEDABOTS } from '../data/medabots-db';
import { getWeapon } from '../data/weapons-db';
import {
  getMovablePositions, getBlastPositions, getBlastShapePositions,
  posEqual, getScanPositions, getTargetCells, getAutoTargetPreview,
  isInTerritory,
} from './grid';
import { calcDamage } from './damage-calc';
import { VisibilityManager } from './visibility';
import { eventBus } from '../utils/event-bus';

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
  get deployTotal(): number { return this.playerDefs.length; }

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
    const occupied = new Set(this.playerTeam.map(u => `${u.position.x},${u.position.y}`));
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
    if (this.playerTeam.some(u => posEqual(u.position, pos))) return false;

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
      u.jammedPartSlot = undefined;
    }
    this.currentUnitIndex = 0;
    this.unitPhase = 'action';
    this.preMovePosition = null;
    this.skipDeadUnits(team);
    this.turnCount++;
    eventBus.emit({ type: 'turnStart', team });
  }

  private skipDeadUnits(team: Team): void {
    const units = team === Team.Player ? this.playerTeam : this.enemyTeam;
    while (this.currentUnitIndex < units.length && !isAlive(units[this.currentUnitIndex])) {
      this.currentUnitIndex++;
    }
  }

  getAllBots(): MedabotState[] { return [...this.playerTeam, ...this.enemyTeam]; }
  getAlivePlayerUnits(): MedabotState[] { return this.playerTeam.filter(isAlive); }
  getAliveEnemyUnits(): MedabotState[] { return this.enemyTeam.filter(isAlive); }

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

  /** 移動可能マス（1マス固定） */
  getMovableForCurrent(): Position[] {
    const unit = this.getCurrentUnit();
    if (!unit) return [];
    return getMovablePositions(unit, this.getAllBots(), 1);
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
    const team = this.phase === BattlePhase.PlayerTurn ? Team.Player : Team.Enemy;
    const units = team === Team.Player ? this.playerTeam : this.enemyTeam;
    const enemies = team === Team.Player ? this.enemyTeam : this.playerTeam;
    const unit = units[action.unitIndex];
    if (!unit || !isAlive(unit)) return;

    switch (action.kind) {
      case ActionKind.Move: {
        if (!action.target) break;
        const from = { ...unit.position };
        this.preMovePosition = { ...from };
        unit.position = { ...action.target };
        eventBus.emit({ type: 'move', unitIndex: action.unitIndex, team, from, to: unit.position });
        if (team === Team.Enemy) {
          eventBus.emit({ type: 'message', text: `${unit.def.name}が移動した` });
        }
        this.checkTraps(unit, action.unitIndex, team);
        this.unitPhase = 'action';
        break;
      }

      case ActionKind.Attack: {
        if (!action.partSlot) break;
        const part = this.getPartBySlot(unit, action.partSlot);
        if (!part || !part.weaponType) break;
        const weapon = getWeapon(part.weaponType);
        if (!weapon) break;
        unit.lastActionPartSlot = action.partSlot;

        if (weapon.blastShape === 'pick3' && action.targets) {
          this.resolveMultiAttack(unit, action.unitIndex, team, enemies, action.targets, part, weapon);
        } else if (action.target) {
          this.resolveAttack(unit, action.unitIndex, team, enemies, action.target, part, weapon);
        } else if (weapon.blastShape) {
          this.resolveAttack(unit, action.unitIndex, team, enemies, unit.position, part, weapon);
        }
        this.advanceUnit(team);
        break;
      }

      case ActionKind.Assist: {
        if (!action.partSlot) break;
        const part = this.getPartBySlot(unit, action.partSlot);
        if (!part) break;
        unit.lastActionPartSlot = action.partSlot;
        this.resolveAssist(unit, action.unitIndex, team, units, enemies, part);
        this.advanceUnit(team);
        break;
      }

      case ActionKind.SetDevice: {
        if (!action.target || !action.partSlot) break;
        const part = this.getPartBySlot(unit, action.partSlot);
        if (!part || !part.weaponType) break;
        unit.lastActionPartSlot = action.partSlot;
        const power = part.trapPower ?? part.attackPower ?? 30;
        this.traps.push({ position: { ...action.target }, team, power });
        eventBus.emit({ type: 'setDevice', unitIndex: action.unitIndex, team, origin: { ...unit.position }, target: action.target, weaponId: part.weaponType! });
        eventBus.emit({ type: 'message', text: `${unit.def.name}がトラップを設置した` });
        this.advanceUnit(team);
        break;
      }

      case ActionKind.Guard: {
        unit.isGuarding = true;
        eventBus.emit({ type: 'guard', unitIndex: action.unitIndex, team });
        eventBus.emit({ type: 'message', text: `${unit.def.name}は防御態勢をとった` });
        this.advanceUnit(team);
        break;
      }

      case ActionKind.Heal: {
        if (!action.target) break;
        const healTargetIdx = action.target.x;
        const healTarget = units[healTargetIdx];
        if (healTarget && isAlive(healTarget)) {
          const part = this.getPartBySlot(unit, action.partSlot ?? PartSlot.LeftArm);
          const amount = part?.healAmount ?? 20;
          healTarget.currentHp = Math.min(healTarget.def.hp, healTarget.currentHp + amount);
          eventBus.emit({ type: 'heal', unitIndex: action.unitIndex, team, target: healTargetIdx, amount });
          eventBus.emit({ type: 'message', text: `${unit.def.name}が${healTarget.def.name}を${amount}回復！` });
        }
        this.advanceUnit(team);
        break;
      }

      case ActionKind.Skip: {
        this.advanceUnit(team);
        break;
      }
    }
  }

  private getPartBySlot(unit: MedabotState, slot: PartSlot): PartDef | null {
    switch (slot) {
      case PartSlot.Head: return unit.parts.head;
      case PartSlot.RightArm: return unit.parts.rightArm;
      case PartSlot.LeftArm: return unit.parts.leftArm;
      case PartSlot.Legs: return unit.parts.legs;
    }
  }

  private resolveAssist(
    unit: MedabotState, unitIndex: number, team: Team,
    _allies: MedabotState[], enemies: MedabotState[], part: PartDef,
  ): void {
    const assistType = part.assistType;
    if (!assistType) return;

    switch (assistType) {
      case 'scan': {
        const scanArea = getScanPositions(unit.position, team);
        const vis = team === Team.Player ? this.visibility : this.enemyVisibility;
        const found: number[] = [];
        enemies.forEach((enemy, idx) => {
          if (!isAlive(enemy) || enemy.isConcealed) return;
          if (scanArea.some(p => posEqual(p, enemy.position))) {
            vis.reveal(idx, CONFIG.SCAN_VISIBLE_DURATION);
            found.push(idx);
          }
        });
        const foundPositions = found.map(i => ({ ...enemies[i].position }));
        eventBus.emit({ type: 'scan', unitIndex, team, center: unit.position, found: foundPositions });
        eventBus.emit({
          type: 'message',
          text: found.length > 0
            ? `${unit.def.name}の${part.name}: ${found.length}体発見！`
            : `${unit.def.name}の${part.name}: 反応なし`,
        });
        break;
      }
      case 'conceal': {
        const turns = part.concealTurns ?? 2;
        unit.isConcealed = true;
        unit.concealTurnsLeft = turns;
        eventBus.emit({ type: 'assist', unitIndex, team, assistType });
        eventBus.emit({ type: 'message', text: `${unit.def.name}の${part.name}: ${turns}ターン隠蔽！` });
        break;
      }
      case 'disarm': {
        const turns = part.disarmTurns ?? 1;
        unit.isDisarmed = true;
        unit.disarmTurnsLeft = turns;
        eventBus.emit({ type: 'assist', unitIndex, team, assistType });
        eventBus.emit({ type: 'message', text: `${unit.def.name}の${part.name}: 射撃ダメージを軽減！` });
        break;
      }
      case 'doubleAction': {
        const allies = team === Team.Player ? this.playerTeam : this.enemyTeam;
        let nextAlly: MedabotState | null = null;
        for (let i = this.currentUnitIndex + 1; i < allies.length; i++) {
          if (isAlive(allies[i]) && !allies[i].hasActed) { nextAlly = allies[i]; break; }
        }
        if (nextAlly) {
          nextAlly.hasDoubleAction = true;
          eventBus.emit({ type: 'assist', unitIndex, team, assistType });
          eventBus.emit({ type: 'message', text: `${unit.def.name}の${part.name}: ${nextAlly.def.name}が2連続行動可能に！` });
        } else {
          eventBus.emit({ type: 'message', text: `${unit.def.name}の${part.name}: 対象がいない…` });
        }
        break;
      }
      case 'jamming': {
        let jammed = 0;
        for (const enemy of enemies) {
          if (isAlive(enemy) && enemy.lastActionPartSlot) {
            enemy.jammedPartSlot = enemy.lastActionPartSlot;
            jammed++;
          }
        }
        eventBus.emit({ type: 'assist', unitIndex, team, assistType });
        eventBus.emit({ type: 'message', text: jammed > 0
          ? `${unit.def.name}の${part.name}: ${jammed}体の行動を妨害！`
          : `${unit.def.name}の${part.name}: 妨害対象なし…` });
        break;
      }
    }
  }

  private resolveAttack(
    attacker: MedabotState, attackerIndex: number, team: Team,
    enemies: MedabotState[], target: Position,
    part: PartDef, weapon: WeaponDef,
  ): void {
    let hitPositions: Position[];
    if (weapon.blastShape) {
      hitPositions = getBlastShapePositions(attacker.position, target, team, weapon.blastShape);
    } else if (weapon.blastArea > 0) {
      hitPositions = getBlastPositions(target, weapon.blastArea);
    } else {
      hitPositions = [target];
    }

    const hits: HitResult[] = [];
    const messages: string[] = [];
    const hitCount = weapon.hitCount || 1;

    for (let h = 0; h < hitCount; h++) {
      for (const pos of hitPositions) {
        enemies.forEach((enemy, idx) => {
          if (!isAlive(enemy)) return;
          if (!posEqual(enemy.position, pos)) return;
          // 解除状態: 射撃ダメージを1に固定
          if (enemy.isDisarmed && weapon.category === 'shooting') {
            enemy.currentHp = Math.max(0, enemy.currentHp - 1);
            hits.push({ targetIndex: idx, targetTeam: enemy.team, damage: 1, destroyed: enemy.currentHp <= 0 });
            const vis = team === Team.Player ? this.visibility : this.enemyVisibility;
            vis.reveal(idx, CONFIG.SCAN_VISIBLE_DURATION);
            messages.push(`${attacker.def.name}の${part.name}！${enemy.def.name}に1ダメージ！（解除）`);
            if (enemy.currentHp <= 0) {
              eventBus.emit({ type: 'destroy', unitIndex: idx, team: enemy.team });
              messages.push(`${enemy.def.name}は機能停止した！`);
            }
            return;
          }
          const result = calcDamage(part, enemy, 0, weapon);
          result.targetIndex = idx;
          hits.push(result);
          // ヒットした敵を可視化（索敵と同様）
          const vis = team === Team.Player ? this.visibility : this.enemyVisibility;
          vis.reveal(idx, CONFIG.SCAN_VISIBLE_DURATION);
          messages.push(`${attacker.def.name}の${part.name}！${enemy.def.name}に${result.damage}ダメージ！`);
          if (result.destroyed) {
            eventBus.emit({ type: 'destroy', unitIndex: idx, team: enemy.team });
            messages.push(`${enemy.def.name}は機能停止した！`);
          }
        });
      }
    }

    if (team === Team.Player) {
      messages.push(`${hits.length}ヒット！`);
    }
    eventBus.emit({ type: 'attack', unitIndex: attackerIndex, team, origin: { ...attacker.position }, target, targets: hitPositions, weaponId: weapon.id, hits, messages });
    this.checkVictory();
  }

  private resolveMultiAttack(
    attacker: MedabotState, attackerIndex: number, team: Team,
    enemies: MedabotState[], targets: Position[],
    part: PartDef, weapon: WeaponDef,
  ): void {
    const hits: HitResult[] = [];
    const messages: string[] = [];

    for (const pos of targets) {
      enemies.forEach((enemy, idx) => {
        if (!isAlive(enemy)) return;
        if (!posEqual(enemy.position, pos)) return;
        // 解除状態: 射撃ダメージを1に固定
        if (enemy.isDisarmed && weapon.category === 'shooting') {
          enemy.currentHp = Math.max(0, enemy.currentHp - 1);
          hits.push({ targetIndex: idx, targetTeam: enemy.team, damage: 1, destroyed: enemy.currentHp <= 0 });
          const vis = team === Team.Player ? this.visibility : this.enemyVisibility;
          vis.reveal(idx, CONFIG.SCAN_VISIBLE_DURATION);
          messages.push(`${attacker.def.name}の${part.name}！${enemy.def.name}に1ダメージ！（解除）`);
          if (enemy.currentHp <= 0) {
            eventBus.emit({ type: 'destroy', unitIndex: idx, team: enemy.team });
            messages.push(`${enemy.def.name}は機能停止した！`);
          }
          return;
        }
        const result = calcDamage(part, enemy, 0, weapon);
        result.targetIndex = idx;
        hits.push(result);
        // ヒットした敵を可視化（索敵と同様）
        const vis = team === Team.Player ? this.visibility : this.enemyVisibility;
        vis.reveal(idx, CONFIG.SCAN_VISIBLE_DURATION);
        messages.push(`${attacker.def.name}の${part.name}！${enemy.def.name}に${result.damage}ダメージ！`);
        if (result.destroyed) {
          eventBus.emit({ type: 'destroy', unitIndex: idx, team: enemy.team });
          messages.push(`${enemy.def.name}は機能停止した！`);
        }
      });
    }

    if (team === Team.Player) {
      messages.push(`${hits.length}ヒット！`);
    }
    eventBus.emit({ type: 'attack', unitIndex: attackerIndex, team, origin: { ...attacker.position }, target: targets[0] ?? attacker.position, targets: [...targets], weaponId: weapon.id, hits, messages });
    this.checkVictory();
  }

  private checkTraps(unit: MedabotState, unitIndex: number, team: Team): void {
    const triggered = this.traps.filter(t => t.team !== team && posEqual(t.position, unit.position));
    for (const trap of triggered) {
      const damage = Math.max(1, Math.floor(trap.power * 0.8));
      unit.currentHp = Math.max(0, unit.currentHp - damage);
      eventBus.emit({ type: 'message', text: `${unit.def.name}がトラップを踏んだ！${damage}ダメージ！` });
      if (unit.currentHp <= 0) {
        eventBus.emit({ type: 'destroy', unitIndex, team });
      }
    }
    this.traps = this.traps.filter(t => !(t.team !== team && posEqual(t.position, unit.position)));
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

    if (this.currentUnitIndex >= units.length || this.getAliveUnitsForTeam(team).every(u => u.hasActed)) {
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
    if (this.checkVictory()) return;

    if (team === Team.Player) {
      this.phase = BattlePhase.EnemyTurn;
      this.startTurn(Team.Enemy);
    } else {
      this.phase = BattlePhase.PlayerTurn;
      this.startTurn(Team.Player);
    }
  }

  private checkVictory(): boolean {
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
