// src/components/map/engine/HistoryManager.ts

export interface UndoableCommand {
  undo(): void;
  redo(): void;
}

/**
 * Unified undo/redo command stack for all map editing operations:
 * markers (PTP/MPTP), area rectangles, and brush strokes.
 */
export class HistoryManager {
  private undoStack: UndoableCommand[] = [];
  private redoStack: UndoableCommand[] = [];
  private readonly MAX = 100;

  push(cmd: UndoableCommand): void {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.MAX) this.undoStack.shift();
    this.redoStack.length = 0; // any new action clears redo
  }

  undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo();
    this.redoStack.push(cmd);
    return true;
  }

  redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.redo();
    this.undoStack.push(cmd);
    return true;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
}
