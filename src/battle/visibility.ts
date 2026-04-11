export class VisibilityManager {
  private revealedEnemies = new Map<number, number>();

  reveal(enemyIndex: number, duration: number): void {
    this.revealedEnemies.set(enemyIndex, duration);
  }

  isRevealed(enemyIndex: number): boolean {
    return this.revealedEnemies.has(enemyIndex);
  }

  tickTurn(): void {
    for (const [idx, remaining] of this.revealedEnemies) {
      if (remaining <= 1) {
        this.revealedEnemies.delete(idx);
      } else {
        this.revealedEnemies.set(idx, remaining - 1);
      }
    }
  }

  reset(): void {
    this.revealedEnemies.clear();
  }
}
