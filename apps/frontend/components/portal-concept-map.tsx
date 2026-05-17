"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const MOVE_PX = 5;

type PortalConceptMapProps = {
  children: React.ReactNode;
  className?: string;
  minHeightClass?: string;
};

/**
 * Area esplorabile a trascinamento (pan) + rotellina, stile canvas concettuale.
 * Dopo un drag, il click sintetico viene soppresso per non attivare i link.
 */
export function PortalConceptMap(props: PortalConceptMapProps): React.JSX.Element {
  const { children, className, minHeightClass = "min-h-[420px]" } = props;
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

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
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
    },
    [pan.x, pan.y]
  );

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

  const resetPan = useCallback(() => {
    setPan({ x: 0, y: 0 });
  }, []);

  const panned = pan.x !== 0 || pan.y !== 0;

  return (
    <div className={`relative ${className ?? ""}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[11px] text-[var(--prom-muted)]">
          Trascina per esplorare · rotella per scorrere
        </p>
        {panned ? (
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={resetPan}>
            Centra mappa
          </Button>
        ) : null}
      </div>
      <div
        ref={viewportRef}
        className={`relative isolate cursor-grab touch-none overflow-hidden rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_55%,transparent)] active:cursor-grabbing ${minHeightClass}`}
        style={{
          touchAction: "none",
          backgroundImage:
            "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--prom-line) 55%, transparent) 1px, transparent 0)",
          backgroundSize: "22px 22px"
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
      >
        <div
          className="p-6 sm:p-10"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0)`,
            willChange: "transform"
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
