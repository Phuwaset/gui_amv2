// src/components/map/engine/resizeManager.ts
import type { MapState } from '../state/mapState';
import type { MapEngine } from './MapEngine';

export class ResizeManager {
  private state: MapState;
  private engine: MapEngine;
  private resizeTimeout: number | null = null;
  private orientationTimeout: number | null = null;

  constructor(state: MapState, engine: MapEngine) {
    this.state = state;
    this.engine = engine;
  }

  handleResize = (): void => {
    if (!this.state.canvasContainer.value) return;

    const container = this.state.canvasContainer.value;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const oldWidth = this.state.canvasWidth.value;
    const oldHeight = this.state.canvasHeight.value;

    let newWidth = Math.floor(rect.width);
    let newHeight = Math.floor(rect.height);

    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      newWidth = Math.max(newWidth, 300);
      newHeight = Math.max(newHeight, 400);
    }

    if (newWidth === oldWidth && newHeight === oldHeight) {
      return;
    }

    this.state.canvasWidth.value = newWidth;
    this.state.canvasHeight.value = newHeight;

    if (this.state.canvas.value) {
      const effectiveDpr = isMobile ? Math.min(dpr, 2) : dpr;

      this.state.canvas.value.style.width = `${newWidth}px`;
      this.state.canvas.value.style.height = `${newHeight}px`;

      this.state.canvas.value.width = Math.floor(newWidth * effectiveDpr);
      this.state.canvas.value.height = Math.floor(newHeight * effectiveDpr);

      const ctx = this.state.canvas.value.getContext('2d');
      if (ctx) {
        ctx.scale(effectiveDpr, effectiveDpr);
      }
    }

    if (oldWidth > 0 && oldHeight > 0 && this.state.mapData.value) {
      this.engine.adjustTransformForResize(oldWidth, oldHeight, newWidth, newHeight);
    }

    this.state.previousCanvasSize.value = { width: newWidth, height: newHeight };
    this.engine.forceRedraw();

    //console.log('Canvas resized:', {
    //   from: { width: oldWidth, height: oldHeight },
    //   to: { width: newWidth, height: newHeight },
    //   isMobile,
    // });
  };

  debouncedResize = (): void => {
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      this.handleResize();
    }, 100);
  };

  handleOrientationChange = (): void => {
    if (this.orientationTimeout) clearTimeout(this.orientationTimeout);
    this.orientationTimeout = setTimeout(() => {
      //console.log('Orientation changed, adjusting layout');
      this.handleResize();
    }, 300);
  };

  cleanup(): void {
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    if (this.orientationTimeout) clearTimeout(this.orientationTimeout);
  }
}