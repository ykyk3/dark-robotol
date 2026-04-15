import { BattleState } from '../battle/battle-state';
import { BattlePhase, PartSlot, PartDef, MedabotState } from '../models/types';
import { canUseHead } from '../models/medabot';
import { getWeapon } from '../data/weapons-db';

export type ActionSelection =
  | { kind: 'attack'; partSlot: PartSlot }
  | { kind: 'assist'; partSlot: PartSlot }
  | { kind: 'setDevice'; partSlot: PartSlot }
  | { kind: 'guard' }
  | { kind: 'heal'; partSlot: PartSlot }
  | { kind: 'cancel' }
  | { kind: 'cancelMove' }
  | { kind: 'move' }
  | { kind: 'confirmPreview' }
  | { kind: 'cancelPreview' }
  | { kind: 'skip' }
  | { kind: 'deploySelect'; medabotId: string };

const ACTION_TYPE_LABELS: Record<string, string> = {
  こうげき: '攻撃',
  まもる: '防御',
  なおす: '回復',
  たすける: '補助',
  しかける: '設置',
};

export class ActionMenu {
  private container: HTMLElement;
  private onSelect: (action: ActionSelection) => void;
  currentSelection: ActionSelection | null = null;

  constructor(container: HTMLElement, onSelect: (action: ActionSelection) => void) {
    this.container = container;
    this.onSelect = onSelect;
  }

  render(
    state: BattleState,
    targeting?: { pickProgress?: { current: number; max: number }; moveMode?: boolean },
    preview?: { cells: number; type: 'attack' | 'scan' | 'support'; label?: string },
    activeAction?: ActionSelection | null,
    deploySelectedId?: string | null,
  ): void {
    this.container.innerHTML = '';
    this.currentSelection = activeAction ?? null;

    // ── 配置フェーズ ──
    if (state.phase === BattlePhase.Deploy) {
      const heading = document.createElement('span');
      heading.className = 'deploy-heading';
      const placed = state.deployIndex;
      const total = state.deployTotal;
      heading.textContent = `配置 (${placed}/${total}) - 配置順＝行動順`;
      this.container.appendChild(heading);

      const hint = document.createElement('span');
      hint.className = 'deploy-hint';
      hint.textContent = '選択: Tab / 1-3 ・ 配置: 方向キー+Enter ・ 戻す: Esc';
      this.container.appendChild(hint);

      const list = document.createElement('div');
      list.className = 'deploy-select';

      state.undeployedIds.forEach((id, i) => {
        const name = state.getMedabotName(id) ?? id;
        const nextNo = state.deployIndex + 1;
        const isSel = id === deploySelectedId;
        const label = isSel ? `▶ ${i + 1}. ${name} (${nextNo}番手)` : `${i + 1}. ${name}`;
        this.addButton(label, { kind: 'deploySelect', medabotId: id }, list);
        if (isSel) {
          const last = list.lastElementChild as HTMLElement | null;
          last?.classList.add('selected');
        }
      });
      this.container.appendChild(list);
      return;
    }

    // ── 敵ターン ──
    if (state.phase !== BattlePhase.PlayerTurn) {
      this.container.innerHTML =
        '<span style="color: var(--accent-red); padding: 4px;">敵ターン...</span>';
      return;
    }

    const unit = state.getCurrentUnit();
    if (!unit) return;

    const isLocked = !!targeting || !!preview;
    const hasMoved = state.preMovePosition !== null;

    // ── 十字配置（常に表示） ──
    const cross = document.createElement('div');
    cross.className = 'action-cross';

    // 頭 (上)
    if (canUseHead(unit)) {
      const hl = this.isPartHighlighted(unit.parts.head, PartSlot.Head);
      this.addPartButton(
        cross,
        'cross-top',
        unit.parts.head,
        PartSlot.Head,
        '頭',
        isLocked,
        hl,
        unit,
      );
    }

    // 左腕 (左)
    const leftHl = this.isPartHighlighted(unit.parts.leftArm, PartSlot.LeftArm);
    this.addPartButton(
      cross,
      'cross-left',
      unit.parts.leftArm,
      PartSlot.LeftArm,
      '左',
      isLocked,
      leftHl,
      unit,
    );

    // 右腕 (右)
    const rightHl = this.isPartHighlighted(unit.parts.rightArm, PartSlot.RightArm);
    this.addPartButton(
      cross,
      'cross-right',
      unit.parts.rightArm,
      PartSlot.RightArm,
      '右',
      isLocked,
      rightHl,
      unit,
    );

    // 移動 (下)
    const moveHl = this.currentSelection?.kind === 'move';
    this.addGridButton(
      cross,
      'cross-bottom',
      '移動',
      { kind: 'move' },
      isLocked || hasMoved,
      moveHl,
    );

    this.container.appendChild(cross);

    // ── 十字の下: 状態に応じた操作UI ──
    if (preview) {
      const span = document.createElement('span');
      const defaultLabel = preview.type === 'scan' ? '索敵範囲' : '攻撃範囲';
      const label = preview.label ?? defaultLabel;
      const color =
        preview.type === 'scan' || preview.type === 'support'
          ? 'var(--accent-green)'
          : 'var(--accent-red)';
      span.style.cssText = `color: ${color}; padding: 4px;`;
      const cellText = preview.cells > 0 ? ` (${preview.cells}マス)` : '';
      span.textContent = `${label}プレビュー${cellText}`;
      this.container.appendChild(span);
      this.addButton('実行', { kind: 'confirmPreview' });
      this.addButton('← キャンセル', { kind: 'cancelPreview' });
    } else if (targeting) {
      if (targeting.moveMode) {
        const span = document.createElement('span');
        span.style.cssText = 'color: var(--accent-blue); padding: 4px;';
        span.textContent = '移動先を選択';
        this.container.appendChild(span);
      } else if (targeting.pickProgress) {
        const span = document.createElement('span');
        span.style.cssText = 'color: var(--accent-red); padding: 4px;';
        span.textContent = `ターゲット選択: ${targeting.pickProgress.current}/${targeting.pickProgress.max}`;
        this.container.appendChild(span);
      }
      this.addButton('← キャンセル', { kind: 'cancel' });
    } else if (hasMoved) {
      this.addButton('← 移動キャンセル', { kind: 'cancelMove' });
    }
  }

  /** パーツのactionTypeに応じたActionSelectionを生成 */
  static partAction(part: PartDef, slot: PartSlot): ActionSelection | null {
    switch (part.actionType) {
      case 'こうげき':
        return { kind: 'attack', partSlot: slot };
      case 'まもる':
        return { kind: 'guard' };
      case 'なおす':
        return { kind: 'heal', partSlot: slot };
      case 'たすける':
        return { kind: 'assist', partSlot: slot };
      case 'しかける':
        return { kind: 'setDevice', partSlot: slot };
      default:
        return null;
    }
  }

  private isPartHighlighted(part: PartDef, slot: PartSlot): boolean {
    if (!this.currentSelection) return false;
    const action = ActionMenu.partAction(part, slot);
    if (!action) return false;
    if (action.kind !== this.currentSelection.kind) return false;
    if ('partSlot' in action && 'partSlot' in this.currentSelection) {
      return action.partSlot === this.currentSelection.partSlot;
    }
    return true;
  }

  private addPartButton(
    parent: HTMLElement,
    cssClass: string,
    part: PartDef,
    slot: PartSlot,
    prefix: string,
    disabled = false,
    highlighted = false,
    unit?: MedabotState,
  ): void {
    const actionType = part.actionType;
    if (!actionType) return;

    // 妨害されたパーツは無効化
    const isJammed = unit?.jammedPartSlot === slot;

    let typeLabel: string;
    if (actionType === 'こうげき' && part.weaponType) {
      const weapon = getWeapon(part.weaponType);
      typeLabel = weapon?.name ?? '攻撃';
    } else {
      typeLabel = ACTION_TYPE_LABELS[actionType] ?? actionType;
    }
    let extra = '';
    if (part.weaponType) {
      const weapon = getWeapon(part.weaponType);
      if (weapon?.blastShape === 'same_col') extra = ' [同軸]';
      else if (weapon?.blastShape === 'mirror_col') extra = ' [ミラー]';
      else if (weapon?.blastShape === 'front4') extra = ' [前列4]';
      else if (weapon?.blastShape === 'front2') extra = ' [前列2]';
      else if (weapon?.blastShape === 'vertical_line') extra = ' [縦列]';
      else if (weapon?.blastShape === 'pick3') extra = ' [3点]';
    }
    if (isJammed) extra += ' [妨害]';

    const label = `${prefix}: ${part.name} [${typeLabel}]${extra}`;
    const action = ActionMenu.partAction(part, slot);
    if (!action) return;

    this.addGridButton(parent, cssClass, label, action, disabled || isJammed, highlighted);
  }

  private addGridButton(
    parent: HTMLElement,
    cssClass: string,
    label: string,
    action: ActionSelection,
    disabled = false,
    highlighted = false,
  ): void {
    const btn = document.createElement('button');
    btn.className = `action-btn ${cssClass}`;
    if (highlighted) btn.classList.add('selected');
    btn.textContent = label;
    if (disabled) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => {
        this.container
          .querySelectorAll('.action-btn')
          .forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.currentSelection = action;
        this.onSelect(action);
      });
    }
    parent.appendChild(btn);
  }

  private addButton(label: string, action: ActionSelection, parent?: HTMLElement): void {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      this.container.querySelectorAll('.action-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      this.currentSelection = action;
      this.onSelect(action);
    });
    (parent ?? this.container).appendChild(btn);
  }
}
