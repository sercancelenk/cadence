export type LightboxTransform = {
  scale: number;
  x: number;
  y: number;
};

export type LightboxViewport = {
  w: number;
  h: number;
};

export type LightboxImageSize = {
  w: number;
  h: number;
};

export type LightboxScaleBounds = {
  minScale: number;
  maxScale: number;
};

/** Fit image inside viewport, centered (industry-standard initial view). */
export function computeFitTransform(
  viewport: LightboxViewport,
  image: LightboxImageSize,
): LightboxTransform {
  if (image.w <= 0 || image.h <= 0 || viewport.w <= 0 || viewport.h <= 0) {
    return { scale: 1, x: 0, y: 0 };
  }
  const scale = Math.min(viewport.w / image.w, viewport.h / image.h);
  return {
    scale,
    x: (viewport.w - image.w * scale) / 2,
    y: (viewport.h - image.h * scale) / 2,
  };
}

export function scaleBoundsForFit(fitScale: number, image: LightboxImageSize): LightboxScaleBounds {
  const maxByPixels = Math.max(
    fitScale * 12,
    fitScale * Math.max(4, Math.min(image.w, image.h) / 256),
  );
  return {
    minScale: fitScale * 0.85,
    maxScale: Math.max(maxByPixels, fitScale * 4),
  };
}

export function clampScale(scale: number, bounds: LightboxScaleBounds): number {
  return Math.min(bounds.maxScale, Math.max(bounds.minScale, scale));
}

/**
 * Zoom while keeping the content point under `point` (viewport coords) fixed.
 * Uses translate + scale with transform-origin at 0,0.
 */
export function zoomAtPoint(
  current: LightboxTransform,
  factor: number,
  point: { x: number; y: number },
  bounds: LightboxScaleBounds,
): LightboxTransform {
  if (!Number.isFinite(factor) || factor <= 0) return current;
  const nextScale = clampScale(current.scale * factor, bounds);
  if (nextScale === current.scale) return current;
  const ratio = nextScale / current.scale;
  return {
    scale: nextScale,
    x: point.x - (point.x - current.x) * ratio,
    y: point.y - (point.y - current.y) * ratio,
  };
}

/** Keep at least a sliver of the image visible; center when smaller than viewport. */
export function constrainTransform(
  transform: LightboxTransform,
  viewport: LightboxViewport,
  image: LightboxImageSize,
  slack = 40,
): LightboxTransform {
  const imgW = image.w * transform.scale;
  const imgH = image.h * transform.scale;

  let x = transform.x;
  let y = transform.y;

  if (imgW <= viewport.w) {
    x = (viewport.w - imgW) / 2;
  } else {
    const minX = viewport.w - imgW - slack;
    const maxX = slack;
    x = Math.min(maxX, Math.max(minX, x));
  }

  if (imgH <= viewport.h) {
    y = (viewport.h - imgH) / 2;
  } else {
    const minY = viewport.h - imgH - slack;
    const maxY = slack;
    y = Math.min(maxY, Math.max(minY, y));
  }

  return { scale: transform.scale, x, y };
}

export function panBy(
  current: LightboxTransform,
  dx: number,
  dy: number,
  viewport: LightboxViewport,
  image: LightboxImageSize,
): LightboxTransform {
  return constrainTransform(
    { scale: current.scale, x: current.x + dx, y: current.y + dy },
    viewport,
    image,
  );
}

/** Smooth wheel delta → multiplicative zoom factor (trackpad + mouse wheel). */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) {
    // DOM_DELTA_LINE
    return Math.exp(-deltaY * 0.12);
  }
  if (deltaMode === 2) {
    // DOM_DELTA_PAGE
    return Math.exp(-deltaY * 0.35);
  }
  return Math.exp(-deltaY * 0.0025);
}

export function zoomPercentLabel(scale: number, fitScale: number): string {
  if (!fitScale || fitScale <= 0) return '100%';
  return `${Math.round((scale / fitScale) * 100)}%`;
}

export function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function midpoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
