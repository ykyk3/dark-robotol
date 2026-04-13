import { BattleState } from '../battle/battle-state';
import { isAlive } from '../models/medabot';
import { MedabotState } from '../models/types';

export class HUD {
  private container: HTMLElement;
  private onUnitClick: (index: number) => void;

  constructor(container: HTMLElement, onUnitClick: (index: number) => void) {
    this.container = container;
    this.onUnitClick = onUnitClick;
  }

  render(state: BattleState): void {
    this.container.innerHTML = '';
    state.playerTeam.forEach((unit, i) => {
      this.container.appendChild(this.createUnitCard(unit, i, i === state.currentUnitIndex));
    });
  }

  private createUnitCard(unit: MedabotState, index: number, isActive: boolean): HTMLElement {
    const card = document.createElement('div');
    card.className = 'unit-card';
    if (isActive) card.classList.add('active');
    if (!isAlive(unit)) card.classList.add('dead');

    const hpPercent = Math.max(0, (unit.currentHp / unit.def.hp) * 100);
    let barClass = '';
    if (hpPercent <= 25) barClass = 'critical';
    else if (hpPercent <= 50) barClass = 'low';

    const nameEl = document.createElement('div');
    nameEl.className = 'name';
    nameEl.textContent = unit.def.name;

    const hpBar = document.createElement('div');
    hpBar.className = 'hp-bar';
    const hpFill = document.createElement('div');
    hpFill.className = `hp-bar-fill ${barClass}`;
    hpFill.style.width = `${hpPercent}%`;
    hpBar.appendChild(hpFill);

    const hpText = document.createElement('div');
    hpText.className = 'hp-text';
    hpText.textContent = `HP ${unit.currentHp}/${unit.def.hp}`;

    const partsText = document.createElement('div');
    partsText.className = 'hp-text';
    partsText.style.marginTop = '2px';
    partsText.textContent = `右:${unit.parts.rightArm.name} 左:${unit.parts.leftArm.name}`;

    card.append(nameEl, hpBar, hpText, partsText);

    if (isAlive(unit)) card.addEventListener('click', () => this.onUnitClick(index));
    return card;
  }
}
