// src/components/map/engine/SmoothTransform.ts
import type { Transform } from '../interfaces/map_interface';

export class SmoothTransform {
  private target: Transform = { scale: 1, translateX: 0, translateY: 0 };
  private current: Transform = { scale: 1, translateX: 0, translateY: 0 };
  private animating = false;
  private onUpdate: (t: Transform) => void;

  // ปรับได้ตามต้องการ
  private readonly minScale = 0.05;
  private readonly maxScale = 20;

  constructor(onUpdate: (t: Transform) => void) {
    this.onUpdate = onUpdate;
  }

  private lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

  private animate = () => {
    const t = 0.15;
    this.current.scale       = this.lerp(this.current.scale, this.target.scale, t);
    this.current.translateX  = this.lerp(this.current.translateX, this.target.translateX, t);
    this.current.translateY  = this.lerp(this.current.translateY, this.target.translateY, t);

    const done =
      Math.abs(this.current.scale - this.target.scale) < 0.001 &&
      Math.abs(this.current.translateX - this.target.translateX) < 1 &&
      Math.abs(this.current.translateY - this.target.translateY) < 1;

    if (done) {
      this.current = { ...this.target };
      this.animating = false;
    } else {
      requestAnimationFrame(this.animate);
    }
    this.onUpdate({ ...this.current });
  };

  setTarget(partial: Partial<Transform>) {
    this.target = { ...this.target, ...partial };
    if (!this.animating) {
      this.animating = true;
      requestAnimationFrame(this.animate);
    }
  }

  setCurrent(now: Transform) {
    this.current = { ...now };
    this.target = { ...now };
    this.animating = false;
    this.onUpdate({ ...now });
  }

  getCurrent() { return { ...this.current }; }
  getTarget()  { return { ...this.target  }; }

  // ===== NEW: pan/zoom convenience =====

  /** เลื่อนแผนที่ด้วยพิกเซลบนแคนวาส */
  panBy(dx: number, dy: number) {
    const { translateX, translateY } = this.target;
    this.setTarget({
      translateX: translateX + dx,
      translateY: translateY + dy,
    });
  }

  /**
   * ซูมรอบพิวอตบนแคนวาส (pivotX, pivotY) โดยคงตำแหน่งใต้พิวอตไว้
   * factor > 1 = ซูมเข้า, factor < 1 = ซูมออก
   */
  zoomBy(factor: number, pivotX: number, pivotY: number) {
    if (!isFinite(factor) || factor <= 0) return;

    const oldScale = this.target.scale;
    let newScale = oldScale * factor;
    newScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));

    // หากถูก clamp ให้คำนวณ factor ใหม่
    const effFactor = newScale / oldScale;

    // สูตรปรับ translate ให้ pivot คงอยู่ ณ ตำแหน่งเดิมบนแคนวาส:
    // tx' = pivotX + effFactor * (tx - pivotX)
    // ty' = pivotY + effFactor * (ty - pivotY)
    const tx = this.target.translateX;
    const ty = this.target.translateY;

    const newTranslateX = pivotX + effFactor * (tx - pivotX);
    const newTranslateY = pivotY + effFactor * (ty - pivotY);

    this.setTarget({
      scale: newScale,
      translateX: newTranslateX,
      translateY: newTranslateY,
    });
  }

  /**
   * ===== NEW: addDelta เพื่อความเข้ากันได้กับโค้ดเดิม =====
   * ใช้รูปแบบเดิม: addDelta({ dx, dy, dscale, pivotX?, pivotY? })
   * - dx, dy: pan (พิกเซลบนแคนวาส)
   * - dscale: อัตราส่วนซูมสัมพัทธ์ (เช่น 1.1, 0.9) ถ้า undefined จะไม่ซูม
   * - pivotX, pivotY: พิวอตซูมบนแคนวาส (ถ้าไม่ระบุ จะซูมจากมุมซ้ายบน (0,0))
   */
  addDelta(delta: { dx?: number; dy?: number; dscale?: number; pivotX?: number; pivotY?: number }) {
    const { dx = 0, dy = 0, dscale, pivotX = 0, pivotY = 0 } = delta ?? {};

    // pan ก่อน เพื่อให้การลากรู้สึกเป็นธรรมชาติ
    if (dx !== 0 || dy !== 0) {
      this.panBy(dx, dy);
    }

    // ซูมตามด้วย (ถ้ามี dscale)
    if (typeof dscale === 'number' && isFinite(dscale) && dscale > 0 && dscale !== 1) {
      this.zoomBy(dscale, pivotX, pivotY);
    }
  }
}
