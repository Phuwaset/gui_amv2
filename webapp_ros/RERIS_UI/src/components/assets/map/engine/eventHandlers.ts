// src/components/map/engine/eventHandlers.ts
import type { MapState, SelectedKind, AreaRect } from '../state/mapState';
import type { MapEngine } from './MapEngine';
import type { ToolType } from '../toolbox/ToolBox.vue';
import type { SocketClient } from '../io/SocketClient';
import type { IPosition } from 'src/interfaces/robot_interfaces';

// ── Snapshot helpers (deep-copy only the fields needed for undo/redo) ──────────
function snapMulti(arr: IPosition[]): IPosition[] {
  return arr.map(g => ({ ...g }));
}
function snapSingle(g: IPosition): IPosition {
  return { ...g };
}
function snapAreas(arr: AreaRect[]): AreaRect[] {
  return arr.map(r => ({
    ...r,
    p1: { ...r.p1 },
    p2: { ...r.p2 },
    dockPosition: r.dockPosition ? r.dockPosition.map(d => ({ ...d })) : [],
  }));
}

export class EventHandlers {
  private state: MapState;
  private engine: MapEngine;
  private socketClient: SocketClient;

  /** Snapshot captured at drag-start, used to build an undo command on drag-end */
  private _dragSnapshot: {
    single: IPosition;
    multi: IPosition[];
    areas: AreaRect[];
  } | null = null;

  constructor(state: MapState, engine: MapEngine, socketClient: SocketClient) {
    this.state = state;
    this.engine = engine;
    this.socketClient = socketClient;
  }



  // Cursor Tool
  // ---- Pointer helpers ----
  private getPrimaryTouch(e: TouchEvent): Touch | null {
    if (e.touches && e.touches.length > 0) return e.touches[0];
    if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0];
    return null;
  }

  private getClientXY(e: MouseEvent | Touch | TouchEvent): { clientX: number; clientY: number } {
    if (typeof TouchEvent !== 'undefined' && e instanceof TouchEvent) {
      const t = this.getPrimaryTouch(e);
      return t ? { clientX: t.clientX, clientY: t.clientY } : { clientX: 0, clientY: 0 };
    }
    if (typeof Touch !== 'undefined' && e instanceof Touch) {
      return { clientX: e.clientX, clientY: e.clientY };
    }
    const me = e as MouseEvent;
    return { clientX: me.clientX, clientY: me.clientY };
  }

  // ---- Pixel distance ----
  private dist2(a: { x: number; y: number }, b: { x: number; y: number }) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  public getCloseIconRectForSelection(): { x: number; y: number; w: number; h: number } | null {
    const sel = this.state.selectedObject.value;
    if (!sel) return null;

    const sz = this.state.closeIconSize.value;
    const off = this.state.closeIconOffsetPx.value;

    if (sel.type === 'single') {
      const p = this.engine.worldToCanvas(this.state.singleGoal.value.x, this.state.singleGoal.value.y);
      return { x: p.x + off, y: p.y - off - sz, w: sz, h: sz };
    }
    if (sel.type === 'multi') {
      const g = this.state.multiGoal.value[sel.index];
      if (!g) return null;
      const p = this.engine.worldToCanvas(g.x, g.y);
      return { x: p.x + off, y: p.y - off - sz, w: sz, h: sz };

    }
    if (sel.type === 'rect' || sel.type === 'rect-handle') {
      const r = this.state.areaRects.value.find(it => it.id === sel.id);
      if (!r) return null;
      const c1 = this.engine.worldToCanvas(r.p1.x, r.p1.y);
      const c2 = this.engine.worldToCanvas(r.p2.x, r.p2.y);
      const x = Math.min(c1.x, c2.x), y = Math.min(c1.y, c2.y);
      return { x: x + Math.abs(c2.x - c1.x) - sz - off, y: y + off, w: sz, h: sz };
    }

    return null;
  }


  private hitCloseIcon(canvasX: number, canvasY: number): boolean {
    const r = this.getCloseIconRectForSelection();
    if (!r) return false;
    return canvasX >= r.x && canvasX <= r.x + r.w && canvasY >= r.y && canvasY <= r.y + r.h;
  }

  // ---- Hit-test object บนแคนวาส ----
  private hitTestSelection(canvasX: number, canvasY: number): SelectedKind | null {
    const radius2 = ((this.state.hitRadiusPx.value * this.state.hitRadiusPx.value) + 500) * this.state.transform.value.scale;

    // single
    if (this.state.singleGoal.value) {
      const p = this.engine.worldToCanvas(this.state.singleGoal.value.x, this.state.singleGoal.value.y);

      // console.log(`hit single goal : ${this.dist2({ x: canvasX, y: canvasY - 150 }, p)} <= ${radius2}`);
      if (this.dist2({ x: canvasX, y: canvasY }, p) <= radius2) return { type: 'single' };
    }

    // multi (วนจากบนสุด)
    for (let i = this.state.multiGoal.value.length - 1; i >= 0; --i) {
      const g = this.state.multiGoal.value[i];
      const p = this.engine.worldToCanvas(g.x, g.y);
      //  console.log(`multi single goal : ${this.dist2({ x: canvasX, y: canvasY +50 }, p)} <= ${radius2}`);
      if (this.dist2({ x: canvasX, y: canvasY + 45 }, p) <= radius2) return { type: 'multi', index: i };
    }

    // rect handles & body (วนจากบนสุด)
    for (let i = this.state.areaRects.value.length - 1; i >= 0; --i) {
      const r = this.state.areaRects.value[i];
      const c1 = this.engine.worldToCanvas(r.p1.x, r.p1.y); // p1 = world minX/minY = canvas bottom-left
      const c2 = this.engine.worldToCanvas(r.p2.x, r.p2.y); // p2 = world maxX/maxY = canvas top-right

      const minCX = Math.min(c1.x, c2.x), minCY = Math.min(c1.y, c2.y);
      const maxCX = Math.max(c1.x, c2.x), maxCY = Math.max(c1.y, c2.y);

      // Hit-test all 4 corners (nw=top-left, ne=top-right, sw=bottom-left, se=bottom-right on canvas)
      const cornerHits: Array<[{ x: number; y: number }, 'nw' | 'ne' | 'sw' | 'se']> = [
        [{ x: minCX, y: minCY }, 'nw'],
        [{ x: maxCX, y: minCY }, 'ne'],
        [{ x: minCX, y: maxCY }, 'sw'],
        [{ x: maxCX, y: maxCY }, 'se'],
      ];
      for (const [pt, handle] of cornerHits) {
        if (this.dist2({ x: canvasX, y: canvasY }, pt) <= radius2)
          return { type: 'rect-handle', id: r.id, handle };
      }

      const x = minCX, y = minCY, w = maxCX - minCX, h = maxCY - minCY;
      if (canvasX >= x && canvasX <= x + w && canvasY >= y && canvasY <= y + h) {
        return { type: 'rect', id: r.id };
      }
    }
    return null;
  }

  // ---- ลบ object ที่เลือก ----
  private deleteSelected(): void {
    const sel = this.state.selectedObject.value;
    if (!sel) return;

    // Capture before-state for undo
    const beforeSingle = snapSingle(this.state.singleGoal.value);
    const beforeMulti  = snapMulti(this.state.multiGoal.value);
    const beforeAreas  = snapAreas(this.state.areaRects.value);

    if (sel.type === 'single') {
      this.state.singleGoal.value = { x: 0, y: 0, yaw: 0, id: '', label: '', action: '' };
    } else if (sel.type === 'multi') {
      const arr = this.state.multiGoal.value;
      if (sel.index >= 0 && sel.index < arr.length) {
        arr.splice(sel.index, 1);
        this.state.multiGoal.value = [...arr];
        this.socketClient.sendGoalCommand(this.state.multiGoal.value);
      }
    } else if (sel.type === 'rect' || sel.type === 'rect-handle') {
      this.state.areaRects.value = this.state.areaRects.value.filter(r => r.id !== sel.id);
    }
    this.state.selectedObject.value = null;
    this.engine.buildGoalHash();

    // Push undo command
    const afterSingle = snapSingle(this.state.singleGoal.value);
    const afterMulti  = snapMulti(this.state.multiGoal.value);
    const afterAreas  = snapAreas(this.state.areaRects.value);
    const state = this.state;
    const engine = this.engine;
    engine.history.push({
      undo: () => {
        state.singleGoal.value = beforeSingle;
        state.multiGoal.value  = beforeMulti;
        state.areaRects.value  = beforeAreas;
        engine.buildGoalHash();
        engine.forceRedraw();
      },
      redo: () => {
        state.singleGoal.value = afterSingle;
        state.multiGoal.value  = afterMulti;
        state.areaRects.value  = afterAreas;
        engine.buildGoalHash();
        engine.forceRedraw();
      },
    });
  }
  //

  // Mouse events
  handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    this.useSelectTarget(event);
  };

  handleMouseMove = (event: MouseEvent): void => {
    if (this.state.isSettingYaw.value || this.state.isSettingArea.value
      || this.state.activeTool.value == 'cursor'
      || this.state.activeTool.value == 'select'
      || this.state.activeTool.value == 'editor'
      || this.state.activeTool.value == 'editor_brush_erase'
      || this.state.activeTool.value == 'editor_erase') {
      this.useSelectTargetMove(event);
      return;
    }

    if (this.state.isDragging.value) {
      // ===== MODIFICATION 1: Use panBy for correct delta panning =====
      const dx = event.clientX - this.state.lastPointerPos.value.x;
      const dy = event.clientY - this.state.lastPointerPos.value.y;
      this.engine.getSmoothTransform().panBy(dx, dy);
      this.state.lastPointerPos.value = { x: event.clientX, y: event.clientY };
      // ==============================================================
    }
  };

  handleMouseUp = (): void => {
    this.useSelectTargetEnd();
    this.state.isDragging.value = false;
  };

  // Wheel event
  handleWheel = (event: WheelEvent): void => {
    event.preventDefault();

    const rect = this.state.canvas.value?.getBoundingClientRect();
    if (!rect) return;

    const centerX = event.clientX - rect.left;
    const centerY = event.clientY - rect.top;

    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    this.engine.smoothZoom(zoomFactor, centerX, centerY);
  };

  // Touch events
  handleTouchStart = (event: TouchEvent): void => {
    // ===== MODIFICATION 2: Stop any existing animation to prevent spikes =====
    // Commit to the target state to stop all "drifting"
    this.engine.getSmoothTransform().setCurrent(this.engine.getSmoothTransform().getTarget());
    // =======================================================================
    
    event.preventDefault();

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      this.useSelectTarget(touch);
      this.state.touchState.value.lastPos = { x: touch.clientX, y: touch.clientY };
      this.state.isDragging.value = true;
      return;
    }

    if (event.touches.length === 2) {
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];

      // ===== MODIFIED: Store lastDist =====
      const startDist = Math.hypot(
        touch1.clientX - touch2.clientX,
        touch1.clientY - touch2.clientY
      );
      this.state.touchState.value.startDist = startDist;
      this.state.touchState.value.lastDist = startDist; // <-- ADD THIS

      this.state.touchState.value.startZoom = this.engine.getSmoothTransform().getCurrent().scale;
      this.state.touchState.value.startPos = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2,
      };

      this.state.touchState.value.lastPosMulti = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2,
      };
      // ======================================

      this.state.touchState.value.active = true;
      this.state.isDragging.value = false;
      return;
    }
  };

  handleTouchMove = (event: TouchEvent): void => {
    event.preventDefault();

    if ((this.state.isSettingYaw.value || this.state.isSettingArea) && event.touches.length === 1) {
      if (!this.state.canvas.value) return;
      this.useSelectTargetMove(event.touches[0]);
      return;
    }

    if (event.touches.length === 1 && this.state.isDragging.value) {
      const touch = event.touches[0];
      // ===== MODIFICATION 3: Use panBy for correct delta panning =====
      const dx = touch.clientX - this.state.touchState.value.lastPos.x;
      const dy = touch.clientY - this.state.touchState.value.lastPos.y;
      this.engine.getSmoothTransform().panBy(dx, dy);
      this.state.touchState.value.lastPos = { x: touch.clientX, y: touch.clientY };
      // ==============================================================
      return;
    }

    // ===== (This is the 2-finger pinch logic from the previous step, it's correct) =====
    if (event.touches.length === 2 && this.state.touchState.value.active) {
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];

      // --- 1. Calculate current center and distance ---
      const currentCenterX = (touch1.clientX + touch2.clientX) / 2;
      const currentCenterY = (touch1.clientY + touch2.clientY) / 2;
      const currentDist = Math.hypot(
        touch1.clientX - touch2.clientX,
        touch1.clientY - touch2.clientY
      );
      
      // --- 2. Get last center and distance ---
      const lastCenterX = this.state.touchState.value.lastPosMulti.x;
      const lastCenterY = this.state.touchState.value.lastPosMulti.y;
      
      // @ts-expect-error We are adding lastDist dynamically
      const lastDist = this.state.touchState.value.lastDist || this.state.touchState.value.startDist; 

      // --- 3. Calculate deltas ---
      const dx = currentCenterX - lastCenterX; // Pan delta
      const dy = currentCenterY - lastCenterY; // Pan delta
      
      // Zoom delta (relative factor)
      const dscale = (lastDist > 1) ? (currentDist / lastDist) : 1; 

      // --- 4. Get the *initial* pivot point (as requested) ---
      const pivotX = this.state.touchState.value.startPos.x;
      const pivotY = this.state.touchState.value.startPos.y;

      // --- 5. Apply deltas using SmoothTransform.addDelta ---
      this.engine.getSmoothTransform().addDelta({
        dx: dx,
        dy: dy,
        dscale: dscale,
        pivotX: pivotX, // Using startPos
        pivotY: pivotY  // Using startPos
      });
      
      // --- 6. Update last state ---
      this.state.touchState.value.lastPosMulti = { x: currentCenterX, y: currentCenterY };
      this.state.touchState.value.lastDist = currentDist;
      return;
    }
    // ========================================================
  };

  handleTouchEnd = (event: TouchEvent): void => {
    // ===== MODIFICATION 4: Stop any existing animation to prevent spikes =====
    // Commit to the target state to stop all "drifting"
    this.engine.getSmoothTransform().setCurrent(this.engine.getSmoothTransform().getTarget());
    // =======================================================================

    event.preventDefault();

    if ((this.state.isSettingYaw.value || this.state.isSettingArea || this.state.activeTool.value == 'cursor') && event.touches.length === 0) {
      this.useSelectTargetEnd();
      return;
    }

    if (event.touches.length === 0) {
      this.state.isDragging.value = false;
      this.state.touchState.value.active = false;
      return;
    }

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      this.state.touchState.value.active = false;
      this.state.touchState.value.lastPos = { x: touch.clientX, y: touch.clientY };
      this.state.isDragging.value = true;
    }
  };

  // ========== START ==========
  public useSelectTarget = (event: MouseEvent | Touch | TouchEvent): void => {
    const rect = this.state.canvas.value!.getBoundingClientRect();
    const { clientX, clientY } = this.getClientXY(event);
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;

    const worldPos = this.engine.canvasToWorld(canvasX, canvasY);

    // === Dashboard Read-Only Mode Override ===
    if (this.state.mode.value === 'dashboard') {
      this.state.isDraggingSelection.value = false;
      this.state.dragOffsetWorld.value = null;
      this.state.isDragging.value = true;
      this.state.lastPointerPos.value = { x: clientX, y: clientY };
      this.engine.forceRedraw();
      return;
    }

    // === Select (multi-select) mode ===
    if (this.state.activeTool.value === 'select') {
      const world = this.engine.canvasToWorld(canvasX, canvasY);
      const sel = this.state.multiSelection.value;

      // Check if click is over a currently-selected marker → start group move
      const hitSelected = sel.markerIndices.some(i => {
        const g = this.state.multiGoal.value[i];
        const p = this.engine.worldToCanvas(g.x, g.y);
        return this.dist2({ x: canvasX, y: canvasY + 45 }, p) <= 3600;
      }) || sel.areaIds.some(id => {
        const r = this.state.areaRects.value.find(a => a.id === id);
        if (!r) return false;
        const p1 = this.engine.worldToCanvas(r.p1.x, r.p1.y);
        const p2 = this.engine.worldToCanvas(r.p2.x, r.p2.y);
        const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
        return canvasX >= x && canvasX <= x + Math.abs(p2.x - p1.x) && canvasY >= y && canvasY <= y + Math.abs(p2.y - p1.y);
      });

      if (hitSelected && (sel.markerIndices.length || sel.areaIds.length)) {
        // Begin group move
        this._dragSnapshot = {
          single: snapSingle(this.state.singleGoal.value),
          multi:  snapMulti(this.state.multiGoal.value),
          areas:  snapAreas(this.state.areaRects.value),
        };
        this.state.isMovingMultiSelection.value = true;
        this.state.multiSelectionDragLastWorld.value = { x: world.x, y: world.y };
      } else {
        // Begin rubber-band selection
        this.state.multiSelection.value = { markerIndices: [], areaIds: [] };
        this.state.selectionDragRect.value = { x1: world.x, y1: world.y, x2: world.x, y2: world.y };
        this.state.isMultiSelecting.value = true;
      }
      this.engine.forceRedraw();
      return;
    }

    // === Cursor mode: เลือก/เตรียมลาก/ลบ ===
    if (this.state.activeTool.value === 'cursor') {
      // ปุ่มลบ (ถ้าเลือกอยู่)
      if (this.state.selectedObject.value && this.hitCloseIcon(canvasX, canvasY)) {
        this.deleteSelected();
        this.engine.forceRedraw();
        return;
      }

      // หา selection ใหม่
      const sel = this.hitTestSelection(canvasX, canvasY);
      this.state.selectedObject.value = sel;

      if (sel) {
        // Capture pre-drag snapshot for undo
        this._dragSnapshot = {
          single: snapSingle(this.state.singleGoal.value),
          multi:  snapMulti(this.state.multiGoal.value),
          areas:  snapAreas(this.state.areaRects.value),
        };

        // เตรียมลาก object
        const world = this.engine.canvasToWorld(canvasX, canvasY);
        if (sel.type === 'single') {
          const g = this.state.singleGoal.value;
          this.state.dragOffsetWorld.value = { dx: g.x - world.x, dy: g.y - world.y };
        } else if (sel.type === 'multi') {
          const g = this.state.multiGoal.value[sel.index];
          this.state.dragOffsetWorld.value = { dx: g.x - world.x, dy: g.y - world.y };
        } else if (sel.type === 'rect') {
          const r = this.state.areaRects.value.find(it => it.id === sel.id)!;
          const p = { x: Math.min(r.p1.x, r.p2.x), y: Math.min(r.p1.y, r.p2.y) };
          this.state.dragOffsetWorld.value = { dx: p.x - world.x, dy: p.y - world.y };
        } else {
          // rect-handle
          this.state.dragOffsetWorld.value = null;
        }
        this.state.isDraggingSelection.value = true;
        this.engine.forceRedraw();
        return;
      }

      // <<< Fallback: คลิกว่าง -> เริ่มแพนแผนที่ >>>
      this.state.isDraggingSelection.value = false;
      this.state.dragOffsetWorld.value = null;

      this.state.isDragging.value = true;
      this.state.lastPointerPos.value = { x: clientX, y: clientY };
      this.engine.forceRedraw();
      return;
    }

    // === Area mode: เริ่มลากสี่เหลี่ยม ===
    if (this.state.activeTool.value === 'area') {
      const world = this.engine.canvasToWorld(canvasX, canvasY);
      this.state.selectGoal.value = { x: world.x, y: world.y, yaw: 0 };
      this.state.areaStartWorld.value = { x: world.x, y: world.y };
      this.state.areaPreviewWorld.value = { x: world.x, y: world.y };
      this.state.isSettingArea.value = true;

      this.engine.forceRedraw();
      return;
    }

    if (this.state.activeTool.value == 'editor') {
      const cx = clientX - rect.left;       // พิกัดบนแคนวาส
      const cy = clientY - rect.top;

      this.engine.setBrushMode('brush');     // หรือสลับจาก UI
      this.engine.setBrushSizeMeters(0.0001);
      this.engine.beginBrushStrokeAtCanvasXY(cx, cy);   // <-- สำคัญ
      return;
    } else if (this.state.activeTool.value == 'editor_erase') {
      const cx = clientX - rect.left;       // พิกัดบนแคนวาส
      const cy = clientY - rect.top;

      this.engine.setBrushMode('erase');     // หรือสลับจาก UI
      this.engine.setBrushSizeMeters(0.0001);
      this.engine.beginBrushStrokeAtCanvasXY(cx, cy);   // <-- สำคัญ
      return;
    }
    else if (this.state.activeTool.value == 'editor_brush_erase') {
      const cx = clientX - rect.left;       // พิกัดบนแคนวาส
      const cy = clientY - rect.top;

      this.engine.setBrushMode('brush_eraser');     // หรือสลับจาก UI
      this.engine.setBrushSizeMeters(0.0001);
      this.engine.beginBrushStrokeAtCanvasXY(cx, cy);   // <-- สำคัญ
      return;
    }







    // if (this.state.activeTool.value !== 'cursor' && this.state.activeTool.value !== 'area') {
    //   this.state.showTargetAngle.value = true;
    //   this.state.selectGoal.value = { x: worldPos.x, y: worldPos.y - 0.25, yaw: 0 };
    //   this.state.isSettingYaw.value = true;
    //   this.state.yawPreview.value = 0;
    //   this.state.isSettingArea.value = false;
    //   this.engine.forceRedraw();
    // } else if (this.state.activeTool.value === 'area') {
    //   this.state.selectGoal.value = { x: worldPos.x, y: worldPos.y, yaw: 0 };
    //   this.state.areaStartWorld.value = { x: worldPos.x, y: worldPos.y };
    //   this.state.areaPreviewWorld.value = { x: worldPos.x, y: worldPos.y };
    //   this.state.isSettingArea.value = true;
    //   console.log("areaMode activated")
    //   this.engine.forceRedraw();

    // } else {
    //   this.state.isDragging.value = true;
    //   this.state.lastPointerPos.value = { x: event.clientX, y: event.clientY };
    // }


    // === PTP/MPTP: เริ่มตั้ง yaw (ตรรกะเดิม) ===
    // const worldPos = this.engine.canvasToWorld(canvasX, canvasY);
    this.state.cursorPosition.value.x = canvasX;
    this.state.cursorPosition.value.y = -(canvasY);
    this.state.showTargetAngle.value = true;
    this.state.selectGoal.value = { x: worldPos.x, y: worldPos.y, yaw: 0 };
    this.state.isSettingYaw.value = true;
    this.state.yawPreview.value = 0;
    this.state.isDragging.value = false;
    this.state.isSettingArea.value = false;
    this.engine.forceRedraw();



  };

  // ========== MOVE ==========
  public useSelectTargetMove = (event: MouseEvent | Touch | TouchEvent): void => {
    const rect = this.state.canvas.value!.getBoundingClientRect();
    const { clientX, clientY } = this.getClientXY(event);

    // --- คงรูปแบบแกน Y กลับด้านของคุณ ---
    const cx = clientX - rect.left;
    const cy = -(clientY - rect.top);

    // world จาก (-cy) ตามเดิม
    const world = this.engine.canvasToWorld(cx, -cy);

    // cursor pos (กลับ y)
    this.state.cursorPosition.value.x = cx;
    this.state.cursorPosition.value.y = cy;

    // yaw preview (เดิม)
    const pos = this.engine.worldToCanvas(this.state.selectGoal.value.x, this.state.selectGoal.value.y);
    pos.y = -pos.y;
    this.state.yawPreview.value = Math.atan2(cy - pos.y, cx - pos.x);


    if (this.state.activeTool.value == 'editor' || this.state.activeTool.value == 'editor_brush_erase' || this.state.activeTool.value == 'editor_erase') {
      const cx = clientX - rect.left;
      const cy = clientY - rect.top;
      console.log("moving")
      this.engine.moveBrushStrokeAtCanvasXY(cx, cy);
      return;
    }

    // === Select: rubber-band update OR group move ===
    if (this.state.activeTool.value === 'select') {
      if (this.state.isMultiSelecting.value && this.state.selectionDragRect.value) {
        this.state.selectionDragRect.value = {
          ...this.state.selectionDragRect.value,
          x2: world.x, y2: world.y,
        };
        this.engine.forceRedraw();
        return;
      }
      if (this.state.isMovingMultiSelection.value) {
        const last = this.state.multiSelectionDragLastWorld.value;
        if (last) {
          const dx = world.x - last.x;
          const dy = world.y - last.y;
          const sel = this.state.multiSelection.value;
          const arr = this.state.multiGoal.value.map((g, i) =>
            sel.markerIndices.includes(i) ? { ...g, x: g.x + dx, y: g.y + dy } : g
          );
          this.state.multiGoal.value = arr;
          this.state.areaRects.value = this.state.areaRects.value.map(r =>
            sel.areaIds.includes(r.id)
              ? { ...r, p1: { x: r.p1.x + dx, y: r.p1.y + dy }, p2: { x: r.p2.x + dx, y: r.p2.y + dy } }
              : r
          );
          this.state.multiSelectionDragLastWorld.value = { x: world.x, y: world.y };
        }
        this.engine.forceRedraw();
        return;
      }
      return;
    }

    // === Area: อัปเดตพรีวิว ===
    if (this.state.isSettingArea.value) {
      this.state.areaPreviewWorld.value = { x: world.x, y: world.y };
      this.engine.forceRedraw();
      return;
    }

    // === Cursor: ลาก object ที่เลือก ===
    if (this.state.activeTool.value === 'cursor' && this.state.isDraggingSelection.value && this.state.selectedObject.value) {
      const sel = this.state.selectedObject.value;

      if (sel.type === 'single') {
        const off = this.state.dragOffsetWorld.value ?? { dx: 0, dy: 0 };
        this.state.singleGoal.value = { x: world.x + off.dx, y: world.y + off.dy, yaw: this.state.singleGoal.value.yaw ?? 0 };
      } else if (sel.type === 'multi') {
        const off = this.state.dragOffsetWorld.value ?? { dx: 0, dy: 0 };
        const arr = this.state.multiGoal.value;

        arr[sel.index] = { x: world.x + off.dx, y: world.y + off.dy, yaw: arr[sel.index].yaw ?? 0, label: arr[sel.index]?.label ?? "", id: arr[sel.index]?.id ?? "", action: arr[sel.index]?.action ?? "" };
        this.state.multiGoal.value = arr;
        
        // this.sendPositionGoal(this.state.activeTool.value,true); // <-- REMOVED: Spammy
      } else if (sel.type === 'rect') {
        const r = this.state.areaRects.value.find(it => it.id === sel.id)!;
        const off = this.state.dragOffsetWorld.value ?? { dx: 0, dy: 0 };
        const w = Math.abs(r.p2.x - r.p1.x);
        const h = Math.abs(r.p2.y - r.p1.y);
        const x0 = world.x + off.dx;
        const y0 = world.y + off.dy;
        r.p1 = { x: Math.min(x0, x0 + w), y: Math.min(y0, y0 + h) };
        r.p2 = { x: Math.max(x0, x0 + w), y: Math.max(y0, y0 + h) };
        this.state.areaRects.value = [...this.state.areaRects.value];
      } else if (sel.type === 'rect-handle') {
        const r = this.state.areaRects.value.find(it => it.id === sel.id)!;
        // Corner mapping (canvas space → which world components move):
        // sw = canvas bottom-left = world (minX, minY) = p1 both axes
        // ne = canvas top-right   = world (maxX, maxY) = p2 both axes
        // nw = canvas top-left    = world (minX, maxY) = p1.x + p2.y
        // se = canvas bottom-right= world (maxX, minY) = p2.x + p1.y
        if (sel.handle === 'sw') {
          r.p1 = { x: world.x, y: world.y };
        } else if (sel.handle === 'ne') {
          r.p2 = { x: world.x, y: world.y };
        } else if (sel.handle === 'nw') {
          r.p1 = { x: world.x, y: r.p1.y };
          r.p2 = { x: r.p2.x,  y: world.y };
        } else { // 'se'
          r.p1 = { x: r.p1.x,  y: world.y };
          r.p2 = { x: world.x, y: r.p2.y  };
        }
        const p1 = { x: Math.min(r.p1.x, r.p2.x), y: Math.min(r.p1.y, r.p2.y) };
        const p2 = { x: Math.max(r.p1.x, r.p2.x), y: Math.max(r.p1.y, r.p2.y) };
        r.p1 = p1; r.p2 = p2;
        this.state.areaRects.value = [...this.state.areaRects.value];
      }

      this.engine.forceRedraw();
      return;
    }


    // === Pan แผนที่ (ใช้ smoothTransform.panBy) ===
    if (this.state.isDragging.value && this.state.activeTool.value == 'cursor') {
      const dx = clientX - this.state.lastPointerPos.value.x;
      const dy = clientY - this.state.lastPointerPos.value.y;
      this.state.lastPointerPos.value = { x: clientX, y: clientY };

      // ใช้ panBy (เราเพิ่งเพิ่มใน SmoothTransform)
      this.engine.getSmoothTransform().panBy(dx, dy);

    }

    this.engine.forceRedraw();
  };

  // ========== END ==========
  public useSelectTargetEnd = (): void => {
    // === Select: commit rubber-band OR commit group move ===
    if (this.state.activeTool.value === 'select') {
      if (this.state.isMultiSelecting.value) {
        const r = this.state.selectionDragRect.value;
        if (r) {
          const x1 = Math.min(r.x1, r.x2), x2 = Math.max(r.x1, r.x2);
          const y1 = Math.min(r.y1, r.y2), y2 = Math.max(r.y1, r.y2);
          const markerIndices = this.state.multiGoal.value
            .map((g, i) => (g.x >= x1 && g.x <= x2 && g.y >= y1 && g.y <= y2 ? i : -1))
            .filter(i => i >= 0);
          const areaIds = this.state.areaRects.value
            .filter(a => {
              const cx = (a.p1.x + a.p2.x) / 2, cy = (a.p1.y + a.p2.y) / 2;
              return cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2;
            })
            .map(a => a.id);
          this.state.multiSelection.value = { markerIndices, areaIds };
        }
        this.state.isMultiSelecting.value = false;
        this.state.selectionDragRect.value = null;
        this.engine.forceRedraw();
        return;
      }
      if (this.state.isMovingMultiSelection.value) {
        this.state.isMovingMultiSelection.value = false;
        this.state.multiSelectionDragLastWorld.value = null;
        // Push undo command for the group move
        const snap = this._dragSnapshot;
        if (snap) {
          const afterMulti = snapMulti(this.state.multiGoal.value);
          const afterAreas = snapAreas(this.state.areaRects.value);
          this.engine.history.push({
            undo: () => {
              this.state.multiGoal.value = snap.multi;
              this.state.areaRects.value = snap.areas;
              this.engine.buildGoalHash(); this.engine.forceRedraw();
            },
            redo: () => {
              this.state.multiGoal.value = afterMulti;
              this.state.areaRects.value = afterAreas;
              this.engine.buildGoalHash(); this.engine.forceRedraw();
            },
          });
          this._dragSnapshot = null;
        }
        this.engine.forceRedraw();
        return;
      }
      return;
    }

    // === จบตั้ง yaw ===
    if (this.state.isSettingYaw.value) {
      this.state.selectGoal.value.yaw = this.state.yawPreview.value;
      this.state.isSettingYaw.value = false;
      this.state.showTargetAngle.value = false;
      this.sendPositionGoal(this.state.activeTool.value); // This now builds the hash
      this.engine.forceRedraw();
      return;
    }

    // === จบ area: commit rect ===
    if (this.state.isSettingArea.value) {
      const start = this.state.areaStartWorld.value;
      const end = this.state.areaPreviewWorld.value;
      if (start && end) {
        const beforeAreas = snapAreas(this.state.areaRects.value);

        const p1 = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) };
        const p2 = { x: Math.max(start.x, end.x), y: Math.max(start.y, end.y) };
        this.state.areaRects.value.push({
          id: `rect_${Date.now()}`,
          p1, p2,
          label: '',
          dockPosition: [],
          color: this.state.activeRectColor.value || '#22c55e',
        });

        const afterAreas = snapAreas(this.state.areaRects.value);
        const state = this.state;
        const engine = this.engine;
        engine.history.push({
          undo: () => {
            state.areaRects.value = beforeAreas;
            engine.forceRedraw();
          },
          redo: () => {
            state.areaRects.value = afterAreas;
            engine.forceRedraw();
          },
        });
      }
      this.state.isSettingArea.value = false;
      this.state.areaStartWorld.value = null;
      this.state.areaPreviewWorld.value = null;
      this.engine.forceRedraw();
      return;
    }

    if (this.state.activeTool.value == 'editor' ||
        this.state.activeTool.value == 'editor_brush_erase' ||
        this.state.activeTool.value == 'editor_erase'
    ) {
      this.engine.endBrushStroke();
    }

    // === Cursor: หยุดลาก object และ pan ===
    if (this.state.activeTool.value === 'cursor') {

      if (this.state.isDraggingSelection.value && this.state.selectedObject.value) {
        // Push undo command for the completed drag
        const snap = this._dragSnapshot;
        if (snap) {
          const afterSingle = snapSingle(this.state.singleGoal.value);
          const afterMulti  = snapMulti(this.state.multiGoal.value);
          const afterAreas  = snapAreas(this.state.areaRects.value);
          const state = this.state;
          const engine = this.engine;
          engine.history.push({
            undo: () => {
              state.singleGoal.value = snap.single;
              state.multiGoal.value  = snap.multi;
              state.areaRects.value  = snap.areas;
              engine.buildGoalHash();
              engine.forceRedraw();
            },
            redo: () => {
              state.singleGoal.value = afterSingle;
              state.multiGoal.value  = afterMulti;
              state.areaRects.value  = afterAreas;
              engine.buildGoalHash();
              engine.forceRedraw();
            },
          });
          this._dragSnapshot = null;
        }

        // Send updated goals to robot when multi-marker was moved
        if (this.state.selectedObject.value.type === 'multi') {
          this.sendPositionGoal(this.state.activeTool.value, true);
        }
      }

      this.state.isDraggingSelection.value = false;
      this.state.dragOffsetWorld.value = null;
      this.state.isDragging.value = false;
      this.engine.forceRedraw();
      return;
    }


  };


  async downloadBlob(blob: Blob, filename: string): Promise<void> {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    // ให้โอกาส event loop หมุนก่อน revoke (แก้ปัญหาบราว์เซอร์บางตัว)
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ===== Helper: ชื่อไฟล์ =====
  ensureExt(name: string, ext: string) {
    return name.toLowerCase().endsWith(`.${ext}`) ? name : `${name}.${ext}`;
  }
  baseName(name: string) {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(0, i) : name;
  }

  async saveEditedMap(engine: MapEngine, filename = 'edited_map.pgm', scale = 1): Promise<void> {
    const safePgm = this.ensureExt(filename, 'pgm');

    // 1) สร้าง PGM จาก engine (ซิงก์)
    // const { blob: pgmBlob } = engine.buildEditedPGM(scale); // buildEditedPGM doesn't exist
    engine.exportAsPGM(this.baseName(safePgm)); // Use existing exportAsPGM
    
    // 2) ดาวน์โหลด .pgm (await จริง)
    // await this.downloadBlob(pgmBlob, safePgm); // Handled by exportAsPGM

    // 3) ทำไฟล์ .yaml ให้ ROS ใช้คู่กับ .pgm
    // const meta = engine.getMapMeta(); // getMapMeta doesn't exist
    const md = this.state.mapData.value;
    if (!md) {
        console.error("Cannot create YAML, no map data");
        return;
    }
    const meta = {
        resolution: md.resolution,
        origin_x: md.origin_x,
        origin_y: md.origin_y
    };


    // ถ้าเราขยายภาพด้วย scale เท่าใด resolution ต้องหาร scale เท่านั้น เพื่อคงอัตราส่วน world/pixel
    const yamlText =
      `image: ${safePgm}
  mode: trinary
  resolution: ${meta.resolution / scale}
  origin: [${meta.origin_x}, ${meta.origin_y}, 0.0]
  negate: 0
  occupied_thresh: 0.65
  free_thresh: 0.196
  `;

    const yamlBlob = new Blob([yamlText], { type: 'text/yaml' });
    const yamlName = `${this.baseName(safePgm)}.yaml`;
    await this.downloadBlob(yamlBlob, yamlName);
  }




  // ── Multi-selection actions (called from MapAsset.vue action bar) ──────────

  public deleteMultiSelection(): void {
    const sel = this.state.multiSelection.value;
    if (!sel.markerIndices.length && !sel.areaIds.length) return;

    const beforeMulti = snapMulti(this.state.multiGoal.value);
    const beforeAreas = snapAreas(this.state.areaRects.value);

    const sorted = [...sel.markerIndices].sort((a, b) => b - a);
    const arr = [...this.state.multiGoal.value];
    for (const i of sorted) arr.splice(i, 1);
    this.state.multiGoal.value = arr;

    const removedIds = new Set(sel.areaIds);
    this.state.areaRects.value = this.state.areaRects.value.filter(r => !removedIds.has(r.id));
    this.state.multiSelection.value = { markerIndices: [], areaIds: [] };
    this.engine.buildGoalHash();
    this.engine.forceRedraw();

    const afterMulti = snapMulti(this.state.multiGoal.value);
    const afterAreas = snapAreas(this.state.areaRects.value);
    this.engine.history.push({
      undo: () => {
        this.state.multiGoal.value = beforeMulti;
        this.state.areaRects.value = beforeAreas;
        this.state.multiSelection.value = { markerIndices: [], areaIds: [] };
        this.engine.buildGoalHash(); this.engine.forceRedraw();
      },
      redo: () => {
        this.state.multiGoal.value = afterMulti;
        this.state.areaRects.value = afterAreas;
        this.state.multiSelection.value = { markerIndices: [], areaIds: [] };
        this.engine.buildGoalHash(); this.engine.forceRedraw();
      },
    });
  }

  public duplicateMultiSelection(): void {
    const sel = this.state.multiSelection.value;
    if (!sel.markerIndices.length && !sel.areaIds.length) return;

    const OFFSET = 0.5;
    const beforeMulti = snapMulti(this.state.multiGoal.value);
    const beforeAreas = snapAreas(this.state.areaRects.value);

    const newMarkers: IPosition[] = sel.markerIndices.map(i => ({
      ...this.state.multiGoal.value[i],
      x: this.state.multiGoal.value[i].x + OFFSET,
      y: this.state.multiGoal.value[i].y + OFFSET,
      id: `M:${Math.random().toString(36).slice(2, 7)}`,
    }));
    const newAreas: AreaRect[] = sel.areaIds.map(id => {
      const r = this.state.areaRects.value.find(a => a.id === id)!;
      return {
        ...r,
        p1: { x: r.p1.x + OFFSET, y: r.p1.y + OFFSET },
        p2: { x: r.p2.x + OFFSET, y: r.p2.y + OFFSET },
        dockPosition: (r.dockPosition ?? []).map(d => ({ ...d, x: d.x + OFFSET, y: d.y + OFFSET })),
        id: `rect_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      };
    });

    this.state.multiGoal.value = [...this.state.multiGoal.value, ...newMarkers];
    this.state.areaRects.value = [...this.state.areaRects.value, ...newAreas];
    const newMarkerStart = this.state.multiGoal.value.length - newMarkers.length;
    this.state.multiSelection.value = {
      markerIndices: newMarkers.map((_, k) => newMarkerStart + k),
      areaIds: newAreas.map(a => a.id),
    };
    this.engine.buildGoalHash();
    this.engine.forceRedraw();

    const afterMulti = snapMulti(this.state.multiGoal.value);
    const afterAreas = snapAreas(this.state.areaRects.value);
    this.engine.history.push({
      undo: () => {
        this.state.multiGoal.value = beforeMulti;
        this.state.areaRects.value = beforeAreas;
        this.state.multiSelection.value = { markerIndices: [], areaIds: [] };
        this.engine.buildGoalHash(); this.engine.forceRedraw();
      },
      redo: () => {
        this.state.multiGoal.value = afterMulti;
        this.state.areaRects.value = afterAreas;
        this.engine.buildGoalHash(); this.engine.forceRedraw();
      },
    });
  }

  public sendPositionGoal(mode: ToolType, updateGoal?: boolean): void {
    if (updateGoal) {
      // Called after drag-end or delete — state already updated, just sync robot
      this.socketClient.sendGoalCommand(this.state.multiGoal.value);
    } else {
      if (mode === 'ptp') {
        const beforeSingle = snapSingle(this.state.singleGoal.value);

        this.state.singleGoal.value = { ...this.state.selectGoal.value };
        this.socketClient.sendGoalCommand(this.state.singleGoal.value);

        const afterSingle = snapSingle(this.state.singleGoal.value);
        const state = this.state;
        const engine = this.engine;
        engine.history.push({
          undo: () => {
            state.singleGoal.value = beforeSingle;
            engine.buildGoalHash();
            engine.forceRedraw();
          },
          redo: () => {
            state.singleGoal.value = afterSingle;
            engine.buildGoalHash();
            engine.forceRedraw();
          },
        });

      } else if (mode === 'mptp' || mode === 'mptp_nav') {
        const beforeMulti = snapMulti(this.state.multiGoal.value);

        this.state.selectGoal.value.id = `M:${Math.random().toString(36).slice(2, 7)}`;
        this.state.multiGoal.value.push({ ...this.state.selectGoal.value });
        this.socketClient.sendGoalCommand(this.state.multiGoal.value);

        const afterMulti = snapMulti(this.state.multiGoal.value);
        const state = this.state;
        const engine = this.engine;
        engine.history.push({
          undo: () => {
            state.multiGoal.value = beforeMulti;
            engine.buildGoalHash();
            engine.forceRedraw();
          },
          redo: () => {
            state.multiGoal.value = afterMulti;
            engine.buildGoalHash();
            engine.forceRedraw();
          },
        });
      }
    }

    this.engine.buildGoalHash();
  }
}