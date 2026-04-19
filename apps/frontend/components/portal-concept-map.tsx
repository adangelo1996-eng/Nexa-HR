"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MOVE_PX = 5;

type PortalConceptMapProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Area esplorabile a trascinamento (pan) + rotellina, stile canvas concettuale.
 * Dopo un drag, il click sintetico viene soppresso per non attivare i link.
 */
export function PortalConceptMap(props: PortalConceptMapProps): React.JSX.Element {
  const { children, className } = props;
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) {
      return;
    }
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) {
      return;
    }
    dragRef.current = {
      pointerId: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      ox: pan.x,
      oy: pan.y,
      moved: false
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [pan.x, pan.y]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) {
      return;
    }
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.hypot(dx, dy) > MOVE_PX) {
      d.moved = true;
      setPan({ x: d.ox + dx, y: d.oy + dy });
    }
  }, []);

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) {
      return;
    }
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (d.moved) {
      suppressClickRef.current = true;
    }
  }, []);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!suppressClickRef.current) {
      return;
    }
    suppressClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div
      ref={viewportRef}
      className={`relative isolate cursor-grab touch-none overflow-hidden active:cursor-grabbing ${className ?? ""}`}
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={onClickCapture}
    >
      <div
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0)`,
          willChange: "transform"
        }}
      >
        {children}
      </div>
    </div>
  );
}
