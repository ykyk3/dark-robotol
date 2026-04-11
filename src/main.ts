import './style.css';
import { BattleState } from './battle/battle-state';
import { BattlePhase, Position, ActionKind, PartSlot, Team } from './models/types';
import { CanvasRenderer } from './ui/canvas-renderer';
import { HUD } from './ui/hud';
import { ActionMenu, ActionSelection } from './ui/action-menu';
import { MessageLog } from './ui/message-log';
import { executeAiTurnAnimated } from './battle/ai';
import { eventBus } from './utils/event-bus';
import { isAlive, canUseHead } from './models/medabot';
import { posEqual, getAutoTargetPreview, getBlastPositions, getScanPositions } from './battle/grid';
import { moveAction, healAction, skipAction } from './models/action';
import { getWeapon } from './data/weapons-db';
import { CONFIG } from './config';
import { PLAYER_PRESETS, ENEMY_PRESETS, MEDABOTS } from './data/medabots-db';
import { pick } from './utils/random';

// ── helpers ──

function getPartFromSlot(unit: { parts: import('./models/types').ResolvedParts }, slot: PartSlot) {
  switch (slot) {
    case PartSlot.Head: return unit.parts.head;
    case PartSlot.RightArm: return unit.parts.rightArm;
    case PartSlot.LeftArm: return unit.parts.leftArm;
    default: return unit.parts.leftArm;
  }
}

// ── state ──

const state = new BattleState();
let renderer: CanvasRenderer;
let hud: HUD;
let actionMenu: ActionMenu;
let messageLog: MessageLog;
let pendingAction: ActionSelection | null = null;
let previewAction: import('./models/types').BattleAction | null = null;
let previewCells: Position[] = [];
let previewType: 'attack' | 'scan' = 'attack';
let selectedPlayerPreset = 0;
let selectedEnemyPreset = -1;
let aiRunning = false;

// pick3 用
let pickTargets: Position[] = [];
let pickMax = 0;
let pickPartSlot: PartSlot | null = null;

// キーボードカーソル
let cursorPos: Position | null = null;

// ── init ──

function initGame(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  renderer = new CanvasRenderer(canvas);
  hud = new HUD(document.getElementById('hud')!, onUnitCardClick);
  actionMenu = new ActionMenu(document.getElementById('action-menu')!, onActionSelected);
  messageLog = new MessageLog(document.getElementById('message-log')!);

  eventBus.on(event => messageLog.handleEvent(event));
  eventBus.on(handleAnimEvent);

  canvas.addEventListener('click', onCanvasClick);
  document.addEventListener('keydown', onKeyDown);
  document.getElementById('start-btn')!.addEventListener('click', startBattle);
  document.getElementById('retry-btn')!.addEventListener('click', startBattle);
  buildTeamSelectUI();
  initLogResize();
  renderLoop();
}

function handleAnimEvent(event: import('./models/types').GameEvent): void {
  switch (event.type) {
    case 'attack':
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
    case 'scan':
      renderer.flash(event.found, 'rgba(57, 255, 20, 0.4)', 20);
      break;
    case 'move':
      if (event.team === Team.Player) {
        renderer.startMoveAnim(event.from, event.to, CONFIG.COLORS.PLAYER_UNIT);
      }
      break;
    case 'destroy': {
      const team = event.team === Team.Player ? state.playerTeam : state.enemyTeam;
      if (team[event.unitIndex]) renderer.flash([team[event.unitIndex].position], 'rgba(255, 255, 255, 0.6)', 25);
      break;
    }
  }
}

function startBattle(): void {
  document.getElementById('title-screen')!.style.display = 'none';
  document.getElementById('battle-screen')!.classList.add('active');
  document.getElementById('result-overlay')!.classList.remove('active');
  messageLog.clear();

  const playerTeam = PLAYER_PRESETS[selectedPlayerPreset].team;
  const enemyTeam = selectedEnemyPreset >= 0
    ? ENEMY_PRESETS[selectedEnemyPreset].team
    : pick(ENEMY_PRESETS).team;

  state.init(playerTeam, enemyTeam);
  pendingAction = null;
  previewAction = null;
  previewCells = [];
  cursorPos = { x: 2, y: 2 };
  resetPick();
  aiRunning = false;
  updateUI();
}

function renderLoop(): void {
  if (state.phase !== BattlePhase.Title) renderer.render(state);
  requestAnimationFrame(renderLoop);
}

// ── UI ──

function updateUI(): void {
  hud.render(state);
  const isMoveTargeting = pendingAction?.kind === 'move';
  const isAttackTargeting = pendingAction !== null &&
    (pendingAction.kind === 'attack' || pendingAction.kind === 'setDevice');
  const targeting = (isAttackTargeting || isMoveTargeting || pickMax > 0)
    ? {
        pickProgress: pickMax > 0 ? { current: pickTargets.length, max: pickMax } : undefined,
        moveMode: isMoveTargeting,
      }
    : undefined;
  const preview = previewAction ? { cells: previewCells.length, type: previewType } : undefined;
  actionMenu.render(state, targeting, preview, pendingAction);
  updateHighlights();

  const el = document.querySelector('#battle-header .turn-info');
  if (!el) return;
  const unit = state.getCurrentUnit();
  if (state.phase === BattlePhase.Deploy)
    el.textContent = '配置フェーズ';
  else if (state.phase === BattlePhase.PlayerTurn)
    el.textContent = `ターン${state.turnCount} - ${unit?.def.name ?? ''}`;
  else if (state.phase === BattlePhase.EnemyTurn)
    el.textContent = `ターン${state.turnCount} - 敵軍ターン`;
}

function updateHighlights(): void {
  renderer.clearHighlights();
  renderer.cursorCell = cursorPos;

  // プレビュー中
  if (previewAction && previewCells.length > 0) {
    if (previewType === 'scan') {
      renderer.highlightScanRange = previewCells;
    } else {
      renderer.highlightAttackRange = previewCells;
    }
    return;
  }

  // 配置フェーズ
  if (state.phase === BattlePhase.Deploy) {
    renderer.highlightMoveRange = state.getDeployableCells();
    return;
  }

  if (state.phase !== BattlePhase.PlayerTurn) return;
  const unit = state.getCurrentUnit();
  if (!unit) return;

  // 移動ターゲット選択中
  if (pendingAction?.kind === 'move') {
    renderer.highlightMoveRange = state.getMovableForCurrent();
    return;
  }

  // アクションフェーズ（ターゲット選択中）
  if (!pendingAction) return;
  if (pendingAction.kind === 'attack' || pendingAction.kind === 'setDevice') {
    const part = getPartFromSlot(unit, pendingAction.partSlot);
    const weapon = part.weaponType ? getWeapon(part.weaponType) : undefined;

    if (weapon?.blastShape && weapon.blastShape !== 'pick3') {
      renderer.highlightAttackRange = getAutoTargetPreview(weapon, unit.position, Team.Player);
    } else {
      renderer.highlightAttackRange = state.getTargetsForPart(part);
    }

    if (pickTargets.length > 0) {
      renderer.highlightSelected = [...pickTargets];
    }
  }
}

// ── input ──

function onCanvasClick(e: MouseEvent): void {
  if (aiRunning) return;
  if (previewAction) return;
  const cell = renderer.getCellFromPixel(e.clientX, e.clientY);
  if (!cell) return;
  handleCellClick(cell);
}

function handleCellClick(cell: Position): void {
  // ── 配置フェーズ ──
  if (state.phase === BattlePhase.Deploy) {
    if (state.deployUnit(cell)) {
      if (state.phase !== BattlePhase.Deploy) cursorPos = null;
      updateUI();
    }
    return;
  }

  if (state.phase !== BattlePhase.PlayerTurn) return;

  // ── ターゲット選択 ──
  if (!pendingAction) return;

  // 移動先選択
  if (pendingAction.kind === 'move') {
    const movable = state.getMovableForCurrent();
    if (movable.some(p => posEqual(p, cell))) {
      pendingAction = null;
      cursorPos = null;
      state.executeAction(moveAction(state.currentUnitIndex, cell));
      updateUI();
    }
    return;
  }
  const unit = state.getCurrentUnit();
  if (!unit) return;

  // pick3 モード
  if (pickMax > 0 && pendingAction.kind === 'attack') {
    const part = getPartFromSlot(unit, pendingAction.partSlot);
    const validTargets = state.getTargetsForPart(part);
    if (!validTargets.some(p => posEqual(p, cell))) return;

    const existIdx = pickTargets.findIndex(p => posEqual(p, cell));
    if (existIdx >= 0) {
      pickTargets.splice(existIdx, 1);
      updateUI();
      return;
    }

    pickTargets.push(cell);
    updateUI();

    if (pickTargets.length >= pickMax) {
      const targets = [...pickTargets];
      const slot = pickPartSlot!;
      cursorPos = null;
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
  const action = buildCellAction(pendingAction, cell, unit);
  if (action) {
    cursorPos = null;
    enterPreview(action);
  }
}

function buildCellAction(
  sel: ActionSelection,
  cell: Position,
  unit: import('./models/types').MedabotState,
): import('./models/types').BattleAction | null {
  const idx = state.currentUnitIndex;
  switch (sel.kind) {
    case 'attack':
    case 'setDevice': {
      const part = getPartFromSlot(unit, sel.partSlot);
      const targets = state.getTargetsForPart(part);
      if (!targets.some(p => posEqual(p, cell))) return null;
      const kind = sel.kind === 'attack' ? ActionKind.Attack : ActionKind.SetDevice;
      return { kind, unitIndex: idx, target: cell, partSlot: sel.partSlot };
    }
    default:
      return null;
  }
}

function onActionSelected(action: ActionSelection): void {
  pendingAction = action;

  switch (action.kind) {
    case 'attack': {
      const unit = state.getCurrentUnit();
      if (!unit) break;
      const part = getPartFromSlot(unit, action.partSlot);
      const weapon = part.weaponType ? getWeapon(part.weaponType) : undefined;

      // 自動照準: プレビューへ
      if (weapon?.blastShape === 'same_col' || weapon?.blastShape === 'mirror_col' || weapon?.blastShape === 'front4' || weapon?.blastShape === 'front2' || weapon?.blastShape === 'vertical_line') {
        enterPreview({
          kind: ActionKind.Attack,
          unitIndex: state.currentUnitIndex,
          partSlot: action.partSlot,
        });
        break;
      }

      // pick3
      if (weapon?.blastShape === 'pick3') {
        pickTargets = [];
        pickMax = 3;
        pickPartSlot = action.partSlot;
        initCursor();
        updateUI();
        break;
      }

      // 通常ターゲット選択
      initCursor();
      updateUI();
      break;
    }

    case 'setDevice':
      initCursor();
      updateUI();
      break;

    case 'assist': {
      const unit = state.getCurrentUnit();
      if (!unit) break;
      const part = getPartFromSlot(unit, action.partSlot);
      if (part.assistType === 'scan') {
        // 索敵はプレビューへ
        enterPreview({ kind: ActionKind.Assist, unitIndex: state.currentUnitIndex, partSlot: action.partSlot });
      } else {
        pendingAction = null;
        submit({ kind: ActionKind.Assist, unitIndex: state.currentUnitIndex, partSlot: action.partSlot });
      }
      break;
    }

    case 'guard':
      pendingAction = null;
      submit({ kind: ActionKind.Guard, unitIndex: state.currentUnitIndex });
      break;

    case 'heal': {
      let lowestIdx = -1;
      let lowestHp = Infinity;
      state.playerTeam.forEach((u, i) => {
        if (isAlive(u) && u.currentHp < u.def.hp && u.currentHp < lowestHp) {
          lowestHp = u.currentHp; lowestIdx = i;
        }
      });
      pendingAction = null;
      if (lowestIdx >= 0) submit(healAction(state.currentUnitIndex, lowestIdx));
      else submit(skipAction(state.currentUnitIndex));
      break;
    }

    case 'move':
      initCursor();
      updateUI();
      break;

    case 'cancelMove':
      pendingAction = null;
      cursorPos = null;
      resetPick();
      state.undoMove();
      updateUI();
      break;

    case 'confirmPreview':
      if (previewAction) {
        const a = previewAction;
        previewAction = null;
        previewCells = [];
        pendingAction = null;
        cursorPos = null;
        resetPick();
        submit(a);
      }
      break;

    case 'cancelPreview':
      previewAction = null;
      previewCells = [];
      pendingAction = null;
      cursorPos = null;
      resetPick();
      updateUI();
      break;

    case 'cancel':
      pendingAction = null;
      cursorPos = null;
      resetPick();
      updateUI();
      break;

    case 'skip':
      pendingAction = null;
      resetPick();
      submit(skipAction(state.currentUnitIndex));
      break;
  }
}

function resetPick(): void {
  pickTargets = [];
  pickMax = 0;
  pickPartSlot = null;
}

function initCursor(): void {
  const unit = state.getCurrentUnit();
  if (!unit) { cursorPos = null; return; }

  if (pendingAction?.kind === 'move') {
    cursorPos = { ...unit.position };
  } else if (pendingAction && 'partSlot' in pendingAction &&
    (pendingAction.kind === 'attack' || pendingAction.kind === 'setDevice')) {
    const part = getPartFromSlot(unit, pendingAction.partSlot);
    const targets = state.getTargetsForPart(part);
    if (targets.length > 0) {
      // ユニットに最も近いターゲットセルを初期位置に
      let nearest = targets[0];
      let minDist = Infinity;
      for (const t of targets) {
        const dx = t.x - unit.position.x;
        const dy = t.y - unit.position.y;
        const dist = dx * dx + dy * dy;
        if (dist < minDist) { minDist = dist; nearest = t; }
      }
      cursorPos = { ...nearest };
    } else {
      cursorPos = { ...unit.position };
    }
  } else {
    cursorPos = null;
  }
}

function moveCursor(dx: number, dy: number): void {
  if (!cursorPos) return;
  const nx = cursorPos.x + dx;
  const ny = cursorPos.y + dy;
  if (nx >= 0 && nx < CONFIG.GRID_COLS && ny >= 0 && ny < CONFIG.GRID_ROWS) {
    cursorPos = { x: nx, y: ny };
    renderer.cursorCell = cursorPos;
  }
}

function enterPreview(action: import('./models/types').BattleAction): void {
  previewAction = action;

  const unit = state.getCurrentUnit();
  if (!unit || !action.partSlot) {
    previewCells = action.target ? [action.target] : [];
    previewType = 'attack';
    updateUI();
    return;
  }

  const part = getPartFromSlot(unit, action.partSlot);

  // 索敵プレビュー
  if (action.kind === ActionKind.Assist && part.assistType === 'scan') {
    previewCells = getScanPositions(unit.position, Team.Player);
    previewType = 'scan';
    updateUI();
    return;
  }

  // 攻撃プレビュー
  previewType = 'attack';
  const weapon = part.weaponType ? getWeapon(part.weaponType) : undefined;

  if (action.targets) {
    // pick3: 選択した各ターゲット
    previewCells = action.targets;
  } else if (weapon?.blastShape && weapon.blastShape !== 'pick3') {
    // 自動照準: blastShapeから計算
    previewCells = getAutoTargetPreview(weapon, unit.position, Team.Player);
  } else if (action.target && weapon) {
    // 通常攻撃: blastAreaから計算
    previewCells = getBlastPositions(action.target, weapon.blastArea);
  } else if (action.target) {
    previewCells = [action.target];
  } else {
    previewCells = [];
  }

  updateUI();
}

function onKeyDown(e: KeyboardEvent): void {
  if (aiRunning) return;

  const key = e.key;

  // ── 配置フェーズ ──
  if (state.phase === BattlePhase.Deploy) {
    if (!cursorPos) return;
    switch (key) {
      case 'ArrowUp': case 'w': case 'W':
        e.preventDefault(); moveCursor(0, -1); return;
      case 'ArrowDown': case 's': case 'S':
        e.preventDefault(); moveCursor(0, 1); return;
      case 'ArrowLeft': case 'a': case 'A':
        e.preventDefault(); moveCursor(-1, 0); return;
      case 'ArrowRight': case 'd': case 'D':
        e.preventDefault(); moveCursor(1, 0); return;
      case ' ': case 'Enter':
        e.preventDefault(); handleCellClick(cursorPos); return;
    }
    return;
  }

  if (state.phase !== BattlePhase.PlayerTurn) return;

  // プレビュー中
  if (previewAction) {
    if (key === ' ' || key === 'Enter') {
      e.preventDefault();
      onActionSelected({ kind: 'confirmPreview' });
    } else if (key === 'Escape') {
      onActionSelected({ kind: 'cancelPreview' });
    }
    return;
  }

  // ターゲット選択中（攻撃 or 移動）
  if (pendingAction) {
    if (key === 'Escape') {
      onActionSelected({ kind: 'cancel' });
      return;
    }
    if (cursorPos) {
      switch (key) {
        case 'ArrowUp': case 'w': case 'W':
          e.preventDefault(); moveCursor(0, -1); return;
        case 'ArrowDown': case 's': case 'S':
          e.preventDefault(); moveCursor(0, 1); return;
        case 'ArrowLeft': case 'a': case 'A':
          e.preventDefault(); moveCursor(-1, 0); return;
        case 'ArrowRight': case 'd': case 'D':
          e.preventDefault(); moveCursor(1, 0); return;
        case ' ': case 'Enter':
          e.preventDefault(); handleCellClick(cursorPos); return;
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

async function submit(action: import('./models/types').BattleAction): Promise<void> {
  state.executeAction(action);
  await renderer.waitForAnimation();
  afterAction();
}

function afterAction(): void {
  if (state.phase === BattlePhase.Victory || state.phase === BattlePhase.Defeat) {
    showResult();
    return;
  }

  if (state.phase === BattlePhase.EnemyTurn) {
    updateUI();
    aiRunning = true;
    executeAiTurnAnimated(state, () => updateUI(), 300, () => renderer.waitForAnimation()).then(() => {
      aiRunning = false;
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
  playerGroup.innerHTML = '<div class="select-label">▼ 自軍チーム</div>';
  const playerList = document.createElement('div');
  playerList.className = 'preset-list';
  const playerDetail = document.createElement('div');
  playerDetail.className = 'preset-detail';

  PLAYER_PRESETS.forEach((preset, i) => {
    const btn = document.createElement('button');
    btn.className = 'preset-btn' + (i === selectedPlayerPreset ? ' selected' : '');
    btn.textContent = preset.name;
    btn.addEventListener('click', () => {
      selectedPlayerPreset = i;
      playerList.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      playerDetail.textContent = preset.team.map(id => MEDABOTS[id]?.name ?? id).join(' / ');
    });
    playerList.appendChild(btn);
  });

  playerDetail.textContent = PLAYER_PRESETS[0].team.map(id => MEDABOTS[id]?.name ?? id).join(' / ');
  playerGroup.appendChild(playerList);
  playerGroup.appendChild(playerDetail);

  const enemyGroup = document.createElement('div');
  enemyGroup.className = 'select-group';
  enemyGroup.innerHTML = '<div class="select-label">▼ 敵軍チーム</div>';
  const enemyList = document.createElement('div');
  enemyList.className = 'preset-list';
  const enemyDetail = document.createElement('div');
  enemyDetail.className = 'preset-detail';

  const randBtn = document.createElement('button');
  randBtn.className = 'preset-btn selected';
  randBtn.textContent = 'ランダム';
  randBtn.addEventListener('click', () => {
    selectedEnemyPreset = -1;
    enemyList.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
    randBtn.classList.add('selected');
    enemyDetail.textContent = '???';
  });
  enemyList.appendChild(randBtn);

  ENEMY_PRESETS.forEach((preset, i) => {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.textContent = preset.name;
    btn.addEventListener('click', () => {
      selectedEnemyPreset = i;
      enemyList.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      enemyDetail.textContent = preset.team.map(id => MEDABOTS[id]?.name ?? id).join(' / ');
    });
    enemyList.appendChild(btn);
  });

  enemyDetail.textContent = '???';
  enemyGroup.appendChild(enemyList);
  enemyGroup.appendChild(enemyDetail);

  container.appendChild(playerGroup);
  container.appendChild(enemyGroup);
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

  window.addEventListener('mouseup', () => { dragging = false; });
}

document.addEventListener('DOMContentLoaded', initGame);
