// src/components/map/engine/EditBuffer.ts
export type PatchCell = { idx: number; prev: number; next: number };

export class EditBuffer {
  width: number;
  height: number;
  /** -32768 = no override; 0 = free, 100 = occupied */
  override: Int16Array;
  stack: PatchCell[][] = [];
  redoStack: PatchCell[][] = [];
  static readonly NO = -32768;

  constructor(w: number, h: number) {
    this.width = w; this.height = h;
    this.override = new Int16Array(w * h).fill(EditBuffer.NO);
  }

  resize(w: number, h: number) {
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h;
    this.override = new Int16Array(w * h).fill(EditBuffer.NO);
    this.stack.length = 0;
    this.redoStack.length = 0;
  }

  /**
   * Applies a patch of changes to the undo stack.
   * This is the new primary method for MapEngine.
   */
  pushToUndoStack(patch: PatchCell[]) {
    if (!patch.length) return;
    this.stack.push(patch);
    this.redoStack.length = 0; // Clear redo stack on new action
  }

  /**
   * Undoes the last action, reverts the buffer, and returns the patch.
   */
  undo(): PatchCell[] | null {
    const patch = this.stack.pop();
    if (!patch) return null;
    // Apply the "prev" value for each cell in the patch
    for (const p of patch) this.override[p.idx] = p.prev;
    this.redoStack.push(patch);
    return patch;
  }

  /**
   * Redoes the last undone action, reapplies to buffer, and returns the patch.
   */
  redo(): PatchCell[] | null {
    const patch = this.redoStack.pop();
    if (!patch) return null;
    // Apply the "next" value for each cell in the patch
    for (const p of patch) this.override[p.idx] = p.next;
    this.stack.push(patch);
    return patch;
  }
}