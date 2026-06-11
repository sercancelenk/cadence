import { describe, expect, it } from 'vitest';
import {
  clampScale,
  computeFitTransform,
  constrainTransform,
  panBy,
  scaleBoundsForFit,
  wheelZoomFactor,
  zoomAtPoint,
  zoomPercentLabel,
} from './richImageLightboxViewport';

describe('richImageLightboxViewport', () => {
  const viewport = { w: 800, h: 600 };
  const image = { w: 1600, h: 1200 };

  it('computes fit transform centered in viewport', () => {
    const fit = computeFitTransform(viewport, image);
    expect(fit.scale).toBe(0.5);
    expect(fit.x).toBe(0);
    expect(fit.y).toBe(0);
  });

  it('zoomAtPoint keeps the cursor anchor stable', () => {
    const fit = computeFitTransform(viewport, image);
    const bounds = scaleBoundsForFit(fit.scale, image);
    const point = { x: 400, y: 300 };
    const zoomed = zoomAtPoint(fit, 2, point, bounds);

    const contentX = (point.x - fit.x) / fit.scale;
    const contentY = (point.y - fit.y) / fit.scale;
    expect((point.x - zoomed.x) / zoomed.scale).toBeCloseTo(contentX, 5);
    expect((point.y - zoomed.y) / zoomed.scale).toBeCloseTo(contentY, 5);
  });

  it('constrainTransform centers when image is smaller than viewport', () => {
    const small = { scale: 0.1, x: 50, y: 50 };
    const out = constrainTransform(small, viewport, image);
    expect(out.x).toBe((viewport.w - image.w * small.scale) / 2);
    expect(out.y).toBe((viewport.h - image.h * small.scale) / 2);
  });

  it('constrainTransform clamps pan when image is larger than viewport', () => {
    const zoomed = { scale: 1, x: 500, y: 400 };
    const out = constrainTransform(zoomed, viewport, image);
    expect(out.x).toBeLessThanOrEqual(40);
    expect(out.y).toBeLessThanOrEqual(40);
    expect(out.x).toBeGreaterThanOrEqual(viewport.w - image.w - 40);
    expect(out.y).toBeGreaterThanOrEqual(viewport.h - image.h - 40);
  });

  it('panBy applies delta then constrains', () => {
    const fit = computeFitTransform(viewport, image);
    const zoomed = zoomAtPoint(fit, 2, { x: 400, y: 300 }, scaleBoundsForFit(fit.scale, image));
    const panned = panBy(zoomed, 30, -20, viewport, image);
    expect(panned.x).toBe(zoomed.x + 30);
    expect(panned.y).toBe(zoomed.y - 20);
  });

  it('clampScale respects min and max bounds', () => {
    const bounds = scaleBoundsForFit(0.5, image);
    expect(clampScale(0.01, bounds)).toBe(bounds.minScale);
    expect(clampScale(999, bounds)).toBe(bounds.maxScale);
  });

  it('wheelZoomFactor zooms in for negative deltaY', () => {
    expect(wheelZoomFactor(-100, 0)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, 0)).toBeLessThan(1);
  });

  it('zoomPercentLabel is relative to fit scale', () => {
    expect(zoomPercentLabel(0.5, 0.5)).toBe('100%');
    expect(zoomPercentLabel(1, 0.5)).toBe('200%');
  });
});
