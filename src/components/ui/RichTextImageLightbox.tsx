import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  clampScale,
  computeFitTransform,
  constrainTransform,
  distanceBetween,
  midpoint,
  scaleBoundsForFit,
  wheelZoomFactor,
  zoomAtPoint,
  zoomPercentLabel,
  type LightboxImageSize,
  type LightboxTransform,
  type LightboxViewport,
} from '../../lib/richImageLightboxViewport';

export type RichTextImageLightboxProps = {
  src: string;
  alt?: string;
  loading?: boolean;
  onClose: () => void;
};

const BUTTON_ZOOM = 1.2;

type PointerRecord = { x: number; y: number };

/** Full-screen image viewer shared by Notes + Todos (via RichTextEditor). */
export function RichTextImageLightbox({
  src,
  alt = 'Image',
  loading = false,
  onClose,
}: RichTextImageLightboxProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<LightboxTransform>({ scale: 1, x: 0, y: 0 });
  const fitScaleRef = useRef(1);
  const imageSizeRef = useRef<LightboxImageSize>({ w: 0, h: 0 });
  const pointersRef = useRef(new Map<number, PointerRecord>());
  const pinchRef = useRef<{ distance: number; transform: LightboxTransform } | null>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: LightboxTransform;
  } | null>(null);

  const [transform, setTransform] = useState<LightboxTransform>({ scale: 1, x: 0, y: 0 });
  const [fitScale, setFitScale] = useState(1);
  const [imageSize, setImageSize] = useState<LightboxImageSize>({ w: 0, h: 0 });
  const [imageReady, setImageReady] = useState(false);
  const [panning, setPanning] = useState(false);

  transformRef.current = transform;

  const canShowImage =
    !loading &&
    !!src &&
    (src.startsWith('blob:') || src.startsWith('data:') || /^https?:\/\//i.test(src));

  const readViewport = useCallback((): LightboxViewport => {
    const el = viewportRef.current;
    if (!el) return { w: 0, h: 0 };
    return { w: el.clientWidth, h: el.clientHeight };
  }, []);

  const applyTransform = useCallback(
    (next: LightboxTransform, viewport = readViewport(), image = imageSizeRef.current) => {
      const bounds = scaleBoundsForFit(fitScaleRef.current, image);
      const constrained = constrainTransform(
        { scale: clampScale(next.scale, bounds), x: next.x, y: next.y },
        viewport,
        image,
      );
      transformRef.current = constrained;
      setTransform(constrained);
    },
    [readViewport],
  );

  const resetToFit = useCallback(() => {
    const viewport = readViewport();
    const image = imageSizeRef.current;
    const fit = computeFitTransform(viewport, image);
    fitScaleRef.current = fit.scale;
    setFitScale(fit.scale);
    transformRef.current = fit;
    setTransform(fit);
  }, [readViewport]);

  const zoomAtClient = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const viewport = readViewport();
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const point = { x: clientX - rect.left, y: clientY - rect.top };
      const bounds = scaleBoundsForFit(fitScaleRef.current, imageSizeRef.current);
      const next = zoomAtPoint(transformRef.current, factor, point, bounds);
      applyTransform(next, viewport);
    },
    [applyTransform, readViewport],
  );

  const onImageLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const img = event.currentTarget;
      imageSizeRef.current = {
        w: img.naturalWidth || img.width,
        h: img.naturalHeight || img.height,
      };
      setImageSize(imageSizeRef.current);
      setImageReady(true);
      resetToFit();
    },
    [resetToFit],
  );

  useEffect(() => {
    setImageReady(false);
    setImageSize({ w: 0, h: 0 });
    imageSizeRef.current = { w: 0, h: 0 };
    pointersRef.current.clear();
    pinchRef.current = null;
    panRef.current = null;
  }, [src]);

  useLayoutEffect(() => {
    if (!canShowImage || !imageReady) return;
    resetToFit();
  }, [canShowImage, imageReady, resetToFit]);

  useEffect(() => {
    if (!canShowImage || !imageReady) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const factor = wheelZoomFactor(event.deltaY, event.deltaMode);
      zoomAtClient(event.clientX, event.clientY, factor);
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [canShowImage, imageReady, src, zoomAtClient]);

  useEffect(() => {
    if (!canShowImage) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomAtClient(cx, cy, BUTTON_ZOOM);
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        zoomAtClient(cx, cy, 1 / BUTTON_ZOOM);
      }
      if (event.key === '0') {
        event.preventDefault();
        resetToFit();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canShowImage, onClose, resetToFit, zoomAtClient]);

  useEffect(() => {
    if (!canShowImage || !imageReady) return;
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      const viewport = readViewport();
      const image = imageSizeRef.current;
      if (image.w <= 0 || image.h <= 0) return;

      const oldFit = fitScaleRef.current;
      const newFit = computeFitTransform(viewport, image).scale;
      const relativeZoom = oldFit > 0 ? transformRef.current.scale / oldFit : 1;

      fitScaleRef.current = newFit;
      setFitScale(newFit);
      applyTransform(
        {
          scale: newFit * relativeZoom,
          x: transformRef.current.x,
          y: transformRef.current.y,
        },
        viewport,
        image,
      );
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [applyTransform, canShowImage, imageReady]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canShowImage || !imageReady) return;
    if (event.button !== 0) return;

    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);

    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      pinchRef.current = {
        distance: distanceBetween(pts[0], pts[1]),
        transform: transformRef.current,
      };
      panRef.current = null;
      setPanning(false);
      return;
    }

    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: transformRef.current,
    };
    setPanning(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const pts = [...pointersRef.current.values()];
      const dist = distanceBetween(pts[0], pts[1]);
      if (pinchRef.current.distance <= 0) return;
      const factor = dist / pinchRef.current.distance;
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mid = midpoint(pts[0], pts[1]);
      const point = { x: mid.x - rect.left, y: mid.y - rect.top };
      const bounds = scaleBoundsForFit(fitScaleRef.current, imageSizeRef.current);
      const next = zoomAtPoint(transformRef.current, factor, point, bounds);
      applyTransform(next);
      pinchRef.current = { distance: dist, transform: next };
      return;
    }

    const drag = panRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    applyTransform({
      scale: drag.origin.scale,
      x: drag.origin.x + dx,
      y: drag.origin.y + dy,
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
      setPanning(false);
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!imageReady) return;
    const relativeScale = transformRef.current.scale / fitScaleRef.current;
    if (relativeScale > 1.05) {
      resetToFit();
      return;
    }
    zoomAtClient(event.clientX, event.clientY, 2);
  };

  const zoomFromToolbar = (factor: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAtClient(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  };

  const isZoomedIn = transform.scale > fitScale * 1.02;

  return (
    <div
      className="rich-image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={loading ? 'Loading image' : alt}
      onClick={onClose}
    >
      <button
        type="button"
        className="rich-image-lightbox__close"
        aria-label="Close image viewer"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ✕
      </button>

      {canShowImage && imageReady ? (
        <div
          className="rich-image-lightbox__toolbar"
          role="toolbar"
          aria-label="Image zoom"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="rich-image-lightbox__tool"
            aria-label="Zoom out"
            onClick={() => zoomFromToolbar(1 / BUTTON_ZOOM)}
          >
            −
          </button>
          <button
            type="button"
            className="rich-image-lightbox__tool rich-image-lightbox__tool--label"
            aria-label="Reset zoom"
            onClick={resetToFit}
          >
            {zoomPercentLabel(transform.scale, fitScale)}
          </button>
          <button
            type="button"
            className="rich-image-lightbox__tool"
            aria-label="Zoom in"
            onClick={() => zoomFromToolbar(BUTTON_ZOOM)}
          >
            +
          </button>
        </div>
      ) : null}

      <div
        ref={viewportRef}
        className={`rich-image-lightbox__stage${panning ? ' rich-image-lightbox__stage--panning' : ''}${isZoomedIn ? ' rich-image-lightbox__stage--zoomed' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {loading ? (
          <p className="rich-image-lightbox__loading muted">Loading image…</p>
        ) : canShowImage ? (
          <div
            className={`rich-image-lightbox__layer${!imageReady ? ' rich-image-lightbox__layer--measure' : ''}`}
            style={
              imageReady && imageSize.w > 0
                ? {
                    width: imageSize.w,
                    height: imageSize.h,
                    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                  }
                : undefined
            }
          >
            <img
              className={`rich-image-lightbox__img${!imageReady ? ' rich-image-lightbox__img--measure' : ''}`}
              src={src}
              alt={alt}
              width={imageSize.w || undefined}
              height={imageSize.h || undefined}
              draggable={false}
              onLoad={onImageLoad}
            />
          </div>
        ) : (
          <p className="rich-image-lightbox__loading muted">Could not load this image.</p>
        )}
      </div>
    </div>
  );
}
