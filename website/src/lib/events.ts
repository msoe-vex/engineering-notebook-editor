type Handler = (data?: any) => void;

class EventEmitter {
  private events: Record<string, Handler[]> = {};

  on(event: string, handler: Handler) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: Handler) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(h => h !== handler);
  }

  emit(event: string, data?: any) {
    if (!this.events[event]) return;
    this.events[event].forEach(handler => handler(data));
  }
}

export const events = new EventEmitter();

export const EventNames = {
  PROJECT_LOADED: "project:loaded",
  PROJECT_UPDATED: "project:updated",
  ENTRY_LOADED: "entry:loaded",
  ENTRY_UPDATED: "entry:updated",
  METADATA_UPDATED: "metadata:updated",
  LOADING_STATUS: "loading:status",
  PERSISTENCE_SYNC: "persistence:sync",
  PENDING_CHANGES_UPDATED: "pending:updated",
  STATE_CHANGED: "state:changed",
  SCROLL_TO_RESOURCE: "editor:scroll_to_resource",
  SHOW_NOTIFICATION: "ui:show_notification",
};
