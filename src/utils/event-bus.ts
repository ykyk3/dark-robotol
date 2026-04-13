import { GameEvent } from '../models/types';

type Listener = (event: GameEvent) => void;

class EventBus {
  private listeners: Listener[] = [];

  on(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  emit(event: GameEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export const eventBus = new EventBus();
