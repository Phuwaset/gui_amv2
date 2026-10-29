// src/components/map/engine/mobileUtils.ts

export function optimizeForMobile(): boolean {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (isMobile) {
    // Disable context menu on long press
    document.addEventListener('contextmenu', (e) => {
      if (e.target instanceof HTMLCanvasElement) {
        e.preventDefault();
      }
    });

    // Prevent elastic scrolling on iOS
    if (isIOS) {
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
    }

    // Prevent pull-to-refresh
    document.body.style.overscrollBehavior = 'none';
  }

  return isMobile;
}

export function preventDoubleZoom(element: HTMLElement): void {
  let lastTouchEnd = 0;
  element.addEventListener(
    'touchend',
    (event) => {
      const now = new Date().getTime();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );
}

export function cleanupMobile(): void {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (isMobile) {
    document.body.style.position = '';
    document.body.style.overscrollBehavior = '';
    document.documentElement.style.removeProperty('--vh');
  }
}