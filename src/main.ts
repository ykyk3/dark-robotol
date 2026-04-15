import './style.css';
import { BattleState } from './battle/battle-state';
import {
  BattlePhase,
  Position,
  ActionKind,
  PartSlot,
  Team,
  BattleAction,
  MedabotState,
  GameEvent,
} from './models/types';
import { CanvasRenderer } from './ui/canvas-renderer';
import { HUD } from './ui/hud';
import { ActionMenu, ActionSelection } from './ui/action-menu';
import { MessageLog } from './ui/message-log';
import { executeAiTurnAnimated } from './battle/ai';
import { eventBus } from './utils/event-bus';
import { isAlive, canUseHead, getPartBySlot } from './models/medabot';
import { posEqual, getAutoTargetPreview, getBlastPositions, getScanPositions } from './battle/grid';
import { moveAction, healAction, skipAction } from './models/action';
import { getWeapon } from './data/weapons-db';
import { CONFIG } from './config';
import { ALL_PRESETS, MEDABOTS } from './data/medabots-db';
import { pick } from './utils/random';

// ── state ──

const state = new BattleState();
let renderer: CanvasRenderer;
let hud: HUD;
let actionMenu: ActionMenu;
let messageLog: MessageLog;
let selectedPlayerPreset = 0;

/** 入力・UI に関連する一時状態 */
const ui = {
  pending: null as ActionSelection | null,
  preview: null as BattleAction | null,
  previewCells: [] as Position[],
  previewType: 'attack' as 'attack' | 'scan' | 'support',
  previewLabel: undefined as string | undefined,
  aiRunning: false,
  cursorPos: null as Position | null,
  // pick3
  pickTargets: [] as Position[],
  pickMax: 0,
  pickPartSlot: null as PartSlot | null,
  // アニメーション完了後に表示するメッセージ
  pendingMessages: [] as string[],
  // 配置フェーズで次に配置するメダロットID
  deploySelectedId: null as string | null,
};

// eventBus リスナー解除関数
let unsubscribers: (() => void)[] = [];

function resetPick(): void {
  ui.pickTargets = [];
  ui.pickMax = 0;
  ui.pickPartSlot = null;
}

function clearInputState(): void {
  ui.pending = null;
  ui.preview = null;
  ui.previewCells = [];
  ui.previewLabel = undefined;
  ui.cursorPos = null;
  resetPick();
}

// ── init ──

function initGame(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  renderer = new CanvasRenderer(canvas);
  hud = new HUD(document.getElementById('hud')!, onUnitCardClick);
  actionMenu = new ActionMenu(document.getElementById('action-menu')!, onActionSelected);
  messageLog = new MessageLog(document.getElementById('message-log')!);

  unsubscribers.push(
    eventBus.on((event) => messageLog.handleEvent(event)),
    eventBus.on(handleAnimEvent),
  );

  canvas.addEventListener('click', onCanvasClick);
  document.addEventListener('keydown', onKeyDown);
  document.getElementById('start-btn')!.addEventListener('click', startBattle);
  document.getElementById('retry-btn')!.addEventListener('click', startBattle);
  buildTeamSelectUI();
  initLogResize();
  renderLoop();
}

function handleAnimEvent(event: GameEvent): void {
  switch (event.type) {
    case 'attack':
      ui.pendingMessages = event.messages;
      renderer.startWeaponAnim({
        weaponId: event.weaponId,
        origin: event.origin,
        targets: event.targets ?? [event.target],
        hasHits: event.hits.length > 0,
      });
      break;
    case 'setDevice':
      renderer.startWeaponAnim({
        weaponId: event.weaponId,
        origin: event.origin,
        targets: [event.target],
        hasHits: true,
      });
      break;
    case 'scan': {
      renderer.startScanEffect(event.center, event.team);
      const flashColor =
        event.team === Team.Enemy ? 'rgba(255, 100, 100, 0.4)' : 'rgba(57, 255, 20, 0.4)';
      renderer.flash(event.found, flashColor, 30);
      break;
    }
    case 'move':
      if (event.team === Team.Player) {
        renderer.startMoveAnim(event.from, event.to, CONFIG.COLORS.PLAYER_UNIT);
      }
      break;
    case 'guard':
      renderer.startEffectAnim('guard', event.position, event.team);
      break;
    case 'heal':
      renderer.startEffectAnim('heal', event.position, event.team, event.targetPosition);
      break;
    case 'assist':
      if (event.assistType !== 'scan') {
        renderer.startEffectAnim(event.assistType, event.position, event.team, event.targetPosition);
      }
      break;
    case 'destroy': {
      const team = event.team === Team.Player ? state.playerTeam : state.enemyTeam;
      if (team[event.unitIndex])
        renderer.flash([team[event.unitIndex].position], 'rgba(255, 255, 255, 0.6)', 25);
      break;
    }
  }
}

function startBattle(): void {
  // 旧リスナー解除 → 再登録
  for (const unsub of unsubscribers) unsub();
  unsubscribers = [
    eventBus.on((event) => messageLog.handleEvent(event)),
    eventBus.on(handleAnimEvent),
  ];

  document.getElementById('title-screen')!.style.display = 'none';
  document.getElementById('battle-screen')!.classList.add('active');
  document.getElementById('result-overlay')!.classList.remove('active');
  messageLog.clear();

  const playerTeam = ALL_PRESETS[selectedPlayerPreset].team;
  const remaining = ALL_PRESETS.filter((_, i) => i !== selectedPlayerPreset);
  const enemyTeam = pick(remaining).team;

  state.init(playerTeam, enemyTeam);
  clearInputState();
  ui.cursorPos = { x: 2, y: 2 };
  ui.aiRunning = false;
  // 最初は未配置リストの先頭を選択（好きな順で変更可能）
  ui.deploySelectedId = state.undeployedIds[0] ?? null;
  updateUI();
}

function renderLoop(): void {
  if (state.phase !== BattlePhase.Title) renderer.render(state);
  requestAnimationFrame(renderLoop);
}

// ── UI ──

function updateUI(): void {
  hud.render(state);
  const isMoveTargeting = ui.pending?.kind === 'move';
  const isAttackTargeting =
    ui.pending !== null && (ui.pending.kind === 'attack' || ui.pending.kind === 'setDevice');
  const targeting =
    isAttackTargeting || isMoveTargeting || ui.pickMax > 0
      ? {
          pickProgress:
            ui.pickMax > 0 ? { current: ui.pickTargets.length, max: ui.pickMax } : undefined,
          moveMode: isMoveTargeting,
        }
      : undefined;
  const preview = ui.preview
    ? { cells: ui.previewCells.length, type: ui.previewType, label: ui.previewLabel }
    : undefined;
  actionMenu.render(state, targeting, preview, ui.pending, ui.deploySelectedId);
  updateHighlights();

  const el = document.querySelector('#battle-header .turn-info');
  if (!el) return;
  const unit = state.getCurrentUnit();
  if (state.phase === BattlePhase.Deploy) el.textContent = '配置フェーズ';
  else if (state.phase === BattlePhase.PlayerTurn)
    el.textContent = `ターン${state.turnCount} - ${unit?.def.name ?? ''}`;
  else if (state.phase === BattlePhase.EnemyTurn)
    el.textContent = `ターン${state.turnCount} - 敵軍ターン`;
}

function updateHighlights(): void {
  renderer.clearHighlights();
  renderer.cursorCell = ui.cursorPos;
  renderer.deployGhost = null;

  // プレビュー中
  if (ui.preview && ui.previewCells.length > 0) {
    if (ui.previewType === 'scan' || ui.previewType === 'support') {
      renderer.highlightScanRange = ui.previewCells;
    } else {
      renderer.highlightAttackRange = ui.previewCells;
    }
    return;
  }

  // 配置フェーズ
  if (state.phase === BattlePhase.Deploy) {
    // 出撃確定待ちでは配置可能セルのハイライトを消す（クリックしても配置されないため）
    if (state.isDeployReady()) return;
    const deployable = state.getDeployableCells();
    renderer.highlightMoveRange = deployable;
    // カーソル位置が配置可能セルなら、選択中メダロットのゴーストを表示
    if (ui.cursorPos && ui.deploySelectedId) {
      const onDeployable = deployable.some((p) => posEqual(p, ui.cursorPos!));
      if (onDeployable) {
        const name = state.getMedabotName(ui.deploySelectedId);
        if (name) {
          renderer.deployGhost = { position: ui.cursorPos, label: name[0] };
        }
      }
    }
    return;
  }

  if (state.phase !== BattlePhase.PlayerTurn) return;
  const unit = state.getCurrentUnit();
  if (!unit) return;

  // 移動ターゲット選択中
  if (ui.pending?.kind === 'move') {
    renderer.highlightMoveRange = state.getMovableForCurrent();
    return;
  }

  // アクションフェーズ（ターゲット選択中）
  if (!ui.pending) return;
  if (ui.pending.kind === 'attack' || ui.pending.kind === 'setDevice') {
    const part = getPartBySlot(unit, ui.pending.partSlot);
    const weapon = part.weaponType ? getWeapon(part.weaponType) : undefined;

    if (weapon?.blastShape && weapon.blastShape !== 'pick3') {
      renderer.highlightAttackRange = getAutoTargetPreview(weapon, unit.position, Team.Player);
    } else {
      renderer.highlightAttackRange = state.getTargetsForPart(part);
    }

    if (ui.pickTargets.length > 0) {
      renderer.highlightSelected = [...ui.pickTargets];
    }
  }
}

// ── input ──

function onCanvasClick(e: MouseEvent): void {
  if (ui.aiRunning) return;
  if (ui.preview) return;
  const cell = renderer.getCellFromPixel(e.clientX, e.clientY);
  if (!cell) return;
  handleCellClick(cell);
}

function handleCellClick(cell: Position): void {
  // ── 配置フェーズ ──
  if (state.phase === BattlePhase.Deploy) {
    // 全員配置済み（出撃確定待ち）ではセルクリックで配置しない
    if (state.isDeployReady()) return;
    if (!ui.deploySelectedId) return;
    if (state.deployUnit(cell, ui.deploySelectedId)) {
      // 次に配置するメダロットを未配置リストの先頭から自動選択
      ui.deploySelectedId = state.undeployedIds[0] ?? null;
      updateUI();
    }
    return;
  }

  if (state.phase !== BattlePhase.PlayerTurn) return;

  // ── ターゲット選択 ──
  if (!ui.pending) return;

  // 移動先選択
  if (ui.pending.kind === 'move') {
    const movable = state.getMovableForCurrent();
    if (movable.some((p) => posEqual(p, cell))) {
      ui.pending = null;
      ui.cursorPos = null;
      state.executeAction(moveAction(state.currentUnitIndex, cell));
      updateUI();
    }
    return;
  }
  const unit = state.getCurrentUnit();
  if (!unit) return;

  // pick3 モード
  if (ui.pickMax > 0 && ui.pending.kind === 'attack') {
    const part = getPartBySlot(unit, ui.pending.partSlot);
    const validTargets = state.getTargetsForPart(part);
    if (!validTargets.some((p) => posEqual(p, cell))) return;

    const existIdx = ui.pickTargets.findIndex((p) => posEqual(p, cell));
    if (existIdx >= 0) {
      ui.pickTargets.splice(existIdx, 1);
      updateUI();
      return;
    }

    ui.pickTargets.push(cell);
    updateUI();

    if (ui.pickTargets.length >= ui.pickMax) {
      const targets = [...ui.pickTargets];
      const slot = ui.pickPartSlot!;
      ui.cursorPos = null;
      enterPreview({
        kind: ActionKind.Attack,
        unitIndex: state.currentUnitIndex,
        targets,
        partSlot: slot,
      });
    }
    return;
  }

  // 通常の単体ターゲット選択 → プレビューへ
  const action = buildCellAction(ui.pending, cell, unit);
  if (action) {
    ui.cursorPos = null;
    enterPreview(action);
  }
}

function buildCellAction(
  sel: ActionSelection,
  cell: Position,
  unit: MedabotState,
): BattleAction | null {
  const idx = state.currentUnitIndex;
  switch (sel.kind) {
    case 'attack':
    case 'setDevice': {
      const part = getPartBySlot(unit, sel.partSlot);
      const targets = state.getTargetsForPart(part);
      if (!targets.some((p) => posEqual(p, cell))) return null;
      const kind = sel.kind === 'attack' ? ActionKind.Attack : ActionKind.SetDevice;
      return { kind, unitIndex: idx, target: cell, partSlot: sel.partSlot };
    }
    default:
      return null;
  }
}

function onActionSelected(action: ActionSelection): void {
  // 配置フェーズのメダロット選択は ui.pending を汚さずに処理
  if (action.kind === 'deploySelect') {
    ui.deploySelectedId = action.medabotId;
    updateUI();
    return;
  }
  // 配置完了 → 出撃確定
  if (action.kind === 'deployConfirm') {
    confirmDeploy();
    return;
  }

  ui.pending = action;

  switch (action.kind) {
    case 'attack':
      handleAttackAction(action);
      break;
    case 'setDevice':
      initCursor();
      updateUI();
      break;
    case 'assist':
      handleAssistAction(action);
      break;
    case 'guard':
      enterPreview({ kind: ActionKind.Guard, unitIndex: state.currentUnitIndex });
      break;
    case 'heal':
      handleHealAction(action);
      break;
    case 'move':
      initCursor();
      updateUI();
      break;
    case 'skip':
      ui.pending = null;
      resetPick();
      submit(skipAction(state.currentUnitIndex));
      break;
    case 'cancelMove':
      ui.pending = null;
      ui.cursorPos = null;
      resetPick();
      state.undoMove();
      updateUI();
      break;
    case 'confirmPreview':
      handleConfirmPreview();
      break;
    case 'cancelPreview':
      clearInputState();
      updateUI();
      break;
    case 'cancel':
      clearInputState();
      updateUI();
      break;
  }
}

function handleAttackAction(action: ActionSelection & { kind: 'attack' }): void {
  const unit = state.getCurrentUnit();
  if (!unit) return;
  const part = getPartBySlot(unit, action.partSlot);
  const weapon = part.weaponType ? getWeapon(part.weaponType) : undefined;

  // 自動照準: プレビューへ
  const autoShapes = ['same_col', 'mirror_col', 'front4', 'front2', 'vertical_line'];
  if (weapon?.blastShape && autoShapes.includes(weapon.blastShape)) {
    enterPreview({
      kind: ActionKind.Attack,
      unitIndex: state.currentUnitIndex,
      partSlot: action.partSlot,
    });
    return;
  }

  // pick3
  if (weapon?.blastShape === 'pick3') {
    ui.pickTargets = [];
    ui.pickMax = 3;
    ui.pickPartSlot = action.partSlot;
    initCursor();
    updateUI();
    return;
  }

  // 通常ターゲット選択
  initCursor();
  updateUI();
}

function handleAssistAction(action: ActionSelection & { kind: 'assist' }): void {
  enterPreview({
    kind: ActionKind.Assist,
    unitIndex: state.currentUnitIndex,
    partSlot: action.partSlot,
  });
}

function handleHealAction(action: ActionSelection & { kind: 'heal' }): void {
  let lowestIdx = -1;
  let lowestHp = Infinity;
  state.playerTeam.forEach((u, i) => {
    if (isAlive(u) && u.currentHp < u.def.hp && u.currentHp < lowestHp) {
      lowestHp = u.currentHp;
      lowestIdx = i;
    }
  });
  // targetUnitIndex=-1 は「対象なし」を表す（preview にラベル表示、confirm で何もせずターン消費）
  enterPreview(healAction(state.currentUnitIndex, lowestIdx, action.partSlot));
}

function handleConfirmPreview(): void {
  if (!ui.preview) return;
  const a = ui.preview;
  clearInputState();
  submit(a);
}

function initCursor(): void {
  const unit = state.getCurrentUnit();
  if (!unit) {
    ui.cursorPos = null;
    return;
  }

  if (ui.pending?.kind === 'move') {
    ui.cursorPos = { ...unit.position };
  } else if (
    ui.pending &&
    'partSlot' in ui.pending &&
    (ui.pending.kind === 'attack' || ui.pending.kind === 'setDevice')
  ) {
    const part = getPartBySlot(unit, ui.pending.partSlot);
    const targets = state.getTargetsForPart(part);
    if (targets.length > 0) {
      let nearest = targets[0];
      let minDist = Infinity;
      for (const t of targets) {
        const dx = t.x - unit.position.x;
        const dy = t.y - unit.position.y;
        const dist = dx * dx + dy * dy;
        if (dist < minDist) {
          minDist = dist;
          nearest = t;
        }
      }
      ui.cursorPos = { ...nearest };
    } else {
      ui.cursorPos = { ...unit.position };
    }
  } else {
    ui.cursorPos = null;
  }
}

function moveCursor(dx: number, dy: number): void {
  if (!ui.cursorPos) return;
  const nx = ui.cursorPos.x + dx;
  const ny = ui.cursorPos.y + dy;
  if (nx >= 0 && nx < CONFIG.GRID_COLS && ny >= 0 && ny < CONFIG.GRID_ROWS) {
    ui.cursorPos = { x: nx, y: ny };
    renderer.cursorCell = ui.cursorPos;
  }
}

/** 配置フェーズ: 未配置メダロットを循環選択 (dir=+1で次、-1で前) */
function cycleDeploySelection(dir: 1 | -1): void {
  const ids = state.undeployedIds;
  if (ids.length === 0) return;
  const current = ui.deploySelectedId;
  const idx = current ? ids.indexOf(current) : -1;
  const next = idx < 0 ? 0 : (idx + dir + ids.length) % ids.length;
  ui.deploySelectedId = ids[next];
  updateUI();
}

/** 配置フェーズ: 未配置メダロットリストの N番目を直接選択 (0-indexed) */
function selectDeployByIndex(i: number): void {
  const ids = state.undeployedIds;
  if (i < 0 || i >= ids.length) return;
  ui.deploySelectedId = ids[i];
  updateUI();
}

/** 配置フェーズ: 全員配置完了後に PlayerTurn へ確定遷移 */
function confirmDeploy(): void {
  if (!state.finalizeDeploy()) return;
  ui.cursorPos = null;
  ui.deploySelectedId = null;
  updateUI();
}

function enterPreview(action: BattleAction): void {
  ui.preview = action;
  ui.previewLabel = undefined;

  const unit = state.getCurrentUnit();
  if (!unit) {
    ui.previewCells = [];
    ui.previewType = 'attack';
    updateUI();
    return;
  }

  // 防御プレビュー
  if (action.kind === ActionKind.Guard) {
    ui.previewCells = [{ ...unit.position }];
    ui.previewType = 'support';
    ui.previewLabel = '防御態勢';
    updateUI();
    return;
  }

  // 回復プレビュー
  if (action.kind === ActionKind.Heal) {
    if (action.targetUnitIndex != null && action.targetUnitIndex >= 0) {
      const target = state.playerTeam[action.targetUnitIndex];
      ui.previewCells = target ? [{ ...target.position }] : [];
      ui.previewLabel = `${target?.def.name ?? ''}を回復`;
    } else {
      ui.previewCells = [];
      ui.previewLabel = '回復対象なし';
    }
    ui.previewType = 'support';
    updateUI();
    return;
  }

  if (!action.partSlot) {
    ui.previewCells = action.target ? [action.target] : [];
    ui.previewType = 'attack';
    updateUI();
    return;
  }

  const part = getPartBySlot(unit, action.partSlot);

  // 補助プレビュー（assistType 別）
  if (action.kind === ActionKind.Assist) {
    if (part.assistType === 'scan') {
      ui.previewCells = getScanPositions(unit.position, Team.Player);
      ui.previewType = 'scan';
      updateUI();
      return;
    }
    if (part.assistType === 'conceal') {
      ui.previewCells = [{ ...unit.position }];
      ui.previewType = 'support';
      ui.previewLabel = '隠蔽';
      updateUI();
      return;
    }
    if (part.assistType === 'disarm') {
      ui.previewCells = [{ ...unit.position }];
      ui.previewType = 'support';
      ui.previewLabel = '解除';
      updateUI();
      return;
    }
    if (part.assistType === 'doubleAction') {
      // 次の行動可能な味方を検索
      let nextAlly = null;
      for (let i = state.currentUnitIndex + 1; i < state.playerTeam.length; i++) {
        const a = state.playerTeam[i];
        if (isAlive(a) && !a.hasActed) {
          nextAlly = a;
          break;
        }
      }
      if (nextAlly) {
        ui.previewCells = [{ ...nextAlly.position }];
        ui.previewLabel = `${nextAlly.def.name}を応援`;
      } else {
        ui.previewCells = [];
        ui.previewLabel = '応援対象なし';
      }
      ui.previewType = 'support';
      updateUI();
      return;
    }
    if (part.assistType === 'jamming') {
      // 敵陣全域を表示
      const cells: Position[] = [];
      for (let x = CONFIG.TERRITORY_X; x < CONFIG.GRID_COLS; x++) {
        for (let y = 0; y < CONFIG.GRID_ROWS; y++) {
          cells.push({ x, y });
        }
      }
      ui.previewCells = cells;
      ui.previewType = 'attack';
      ui.previewLabel = '妨害範囲';
      updateUI();
      return;
    }
  }

  // 攻撃プレビュー
  ui.previewType = 'attack';
  const weapon = part.weaponType ? getWeapon(part.weaponType) : undefined;

  if (action.targets) {
    ui.previewCells = action.targets;
  } else if (weapon?.blastShape && weapon.blastShape !== 'pick3') {
    ui.previewCells = getAutoTargetPreview(weapon, unit.position, Team.Player);
  } else if (action.target && weapon) {
    ui.previewCells = getBlastPositions(action.target, weapon.blastArea);
  } else if (action.target) {
    ui.previewCells = [action.target];
  } else {
    ui.previewCells = [];
  }

  updateUI();
}

function onKeyDown(e: KeyboardEvent): void {
  if (ui.aiRunning) return;

  const key = e.key;

  // ── 配置フェーズ ──
  if (state.phase === BattlePhase.Deploy) {
    // メダロット選択（カーソル有無に関係なく動作）
    if (key === 'Tab') {
      e.preventDefault();
      cycleDeploySelection(e.shiftKey ? -1 : 1);
      return;
    }
    if (key >= '1' && key <= '9') {
      const n = Number(key);
      if (n <= state.deployTotal) {
        e.preventDefault();
        selectDeployByIndex(n - 1);
        return;
      }
    }
    // 直前に配置した1体を取り消し
    if (key === 'Escape') {
      e.preventDefault();
      const undone = state.undoDeploy();
      if (undone) {
        ui.deploySelectedId = undone;
        // 出撃確定待ち状態から戻した場合、カーソルを復活させる
        if (!ui.cursorPos) ui.cursorPos = { x: 2, y: 2 };
        updateUI();
      }
      return;
    }

    // 全員配置完了 → Enter/Space で出撃確定
    if (state.isDeployReady() && (key === ' ' || key === 'Enter')) {
      e.preventDefault();
      confirmDeploy();
      return;
    }

    if (!ui.cursorPos) return;
    switch (key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault();
        moveCursor(0, -1);
        return;
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        moveCursor(0, 1);
        return;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        moveCursor(-1, 0);
        return;
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        moveCursor(1, 0);
        return;
      case ' ':
      case 'Enter':
        e.preventDefault();
        handleCellClick(ui.cursorPos);
        return;
    }
    return;
  }

  if (state.phase !== BattlePhase.PlayerTurn) return;

  // プレビュー中
  if (ui.preview) {
    if (key === ' ' || key === 'Enter') {
      e.preventDefault();
      onActionSelected({ kind: 'confirmPreview' });
    } else if (key === 'Escape') {
      onActionSelected({ kind: 'cancelPreview' });
    }
    return;
  }

  // ターゲット選択中（攻撃 or 移動）
  if (ui.pending) {
    if (key === 'Escape') {
      onActionSelected({ kind: 'cancel' });
      return;
    }
    if (ui.cursorPos) {
      switch (key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          moveCursor(0, -1);
          return;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          moveCursor(0, 1);
          return;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          moveCursor(-1, 0);
          return;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          moveCursor(1, 0);
          return;
        case ' ':
        case 'Enter':
          e.preventDefault();
          handleCellClick(ui.cursorPos);
          return;
      }
    }
    return;
  }

  // 十字メニュー
  const unit = state.getCurrentUnit();
  if (!unit) return;

  // 移動済み → Escape で取り消し
  if (key === 'Escape' && state.preMovePosition) {
    onActionSelected({ kind: 'cancelMove' });
    return;
  }

  switch (key) {
    case 'ArrowUp':
    case 'w':
    case 'W': {
      e.preventDefault();
      if (!canUseHead(unit)) return;
      const action = ActionMenu.partAction(unit.parts.head, PartSlot.Head);
      if (action) onActionSelected(action);
      break;
    }
    case 'ArrowLeft':
    case 'a':
    case 'A': {
      e.preventDefault();
      const action = ActionMenu.partAction(unit.parts.leftArm, PartSlot.LeftArm);
      if (action) onActionSelected(action);
      break;
    }
    case 'ArrowRight':
    case 'd':
    case 'D': {
      e.preventDefault();
      const action = ActionMenu.partAction(unit.parts.rightArm, PartSlot.RightArm);
      if (action) onActionSelected(action);
      break;
    }
    case 'ArrowDown':
    case 's':
    case 'S': {
      e.preventDefault();
      if (!state.preMovePosition) {
        onActionSelected({ kind: 'move' });
      }
      break;
    }
  }
}

function onUnitCardClick(_index: number): void {}

// ── 共通実行パス ──

function flushPendingMessages(): void {
  for (const text of ui.pendingMessages) {
    messageLog.addMessage(text);
  }
  ui.pendingMessages = [];
}

async function submit(action: BattleAction): Promise<void> {
  state.executeAction(action);
  await renderer.waitForAnimation();
  flushPendingMessages();
  afterAction();
}

function afterAction(): void {
  if (state.phase === BattlePhase.Victory || state.phase === BattlePhase.Defeat) {
    showResult();
    return;
  }

  if (state.phase === BattlePhase.EnemyTurn) {
    updateUI();
    ui.aiRunning = true;
    executeAiTurnAnimated(
      state,
      () => updateUI(),
      300,
      async () => {
        await renderer.waitForAnimation();
        flushPendingMessages();
      },
    ).then(() => {
      ui.aiRunning = false;
      if (state.phase === BattlePhase.Victory || state.phase === BattlePhase.Defeat) {
        showResult();
        return;
      }
      updateUI();
    });
    return;
  }

  updateUI();
}

function showResult(): void {
  const overlay = document.getElementById('result-overlay')!;
  const heading = overlay.querySelector('h2')!;
  overlay.classList.add('active');
  heading.textContent = state.phase === BattlePhase.Victory ? 'VICTORY' : 'DEFEAT';
  heading.className = state.phase === BattlePhase.Victory ? 'victory' : 'defeat';
}

function buildTeamSelectUI(): void {
  const container = document.getElementById('team-select')!;

  const playerGroup = document.createElement('div');
  playerGroup.className = 'select-group';
  playerGroup.innerHTML = '<div class="select-label">▼ チーム選択</div>';
  const playerList = document.createElement('div');
  playerList.className = 'preset-list';
  const playerDetail = document.createElement('div');
  playerDetail.className = 'preset-detail';

  ALL_PRESETS.forEach((preset, i) => {
    const btn = document.createElement('button');
    btn.className = 'preset-btn' + (i === selectedPlayerPreset ? ' selected' : '');
    btn.textContent = preset.name;
    btn.addEventListener('click', () => {
      selectedPlayerPreset = i;
      playerList.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      playerDetail.textContent = preset.team.map((id) => MEDABOTS[id]?.name ?? id).join(' / ');
    });
    playerList.appendChild(btn);
  });

  playerDetail.textContent = ALL_PRESETS[0].team.map((id) => MEDABOTS[id]?.name ?? id).join(' / ');
  playerGroup.appendChild(playerList);
  playerGroup.appendChild(playerDetail);

  const enemyNote = document.createElement('div');
  enemyNote.className = 'preset-detail';
  enemyNote.textContent = '※ 敵軍は残りのチームからランダムで選出';
  playerGroup.appendChild(enemyNote);

  container.appendChild(playerGroup);
}

function initLogResize(): void {
  const handle = document.getElementById('message-log-handle')!;
  const log = document.getElementById('message-log')!;
  let dragging = false;
  let startY = 0;
  let startH = 0;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    startY = e.clientY;
    startH = log.offsetHeight;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const delta = startY - e.clientY;
    log.style.height = `${Math.max(40, Math.min(400, startH + delta))}px`;
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
  });
}

document.addEventListener('DOMContentLoaded', initGame);
