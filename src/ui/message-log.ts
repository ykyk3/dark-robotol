import { GameEvent } from '../models/types';

export class MessageLog {
  private container: HTMLElement;
  private maxMessages = 50;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  addMessage(text: string, className = ''): void {
    const msg = document.createElement('div');
    msg.className = `msg ${className}`;
    msg.textContent = `> ${text}`;
    this.container.appendChild(msg);
    while (this.container.children.length > this.maxMessages) {
      this.container.removeChild(this.container.firstChild!);
    }
    this.container.scrollTop = this.container.scrollHeight;
  }

  handleEvent(event: GameEvent): void {
    switch (event.type) {
      case 'message':
        this.addMessage(event.text);
        break;
      case 'turnStart':
        this.addMessage(`--- ${event.team === 'player' ? '自軍' : '敵軍'}ターン ---`, 'info');
        break;
      case 'victory':
        this.addMessage(
          event.winner === 'player' ? '勝利！' : '敗北...',
          event.winner === 'player' ? 'scan' : 'hit',
        );
        break;
    }
  }

  clear(): void {
    this.container.innerHTML = '';
  }
}
