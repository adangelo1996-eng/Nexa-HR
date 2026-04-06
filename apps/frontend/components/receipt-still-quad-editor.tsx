"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  cropQuadBoundingBoxToJpeg,
  CV_SNAPSHOT_PROC_MAX_DESKTOP,
  CV_SNAPSHOT_PROC_MAX_TOUCH,
  fallbackCenterQuad,
  findReceiptQuadFromSource,
  loadOpenCvWithTimeout,
  mapProcToVideo,
  type Point,
  warpQuadToBlob
} from "@/lib/receipt-quad-cv";

const HANDLE_RADIUS_CSS = 22;

function getObjectContainMapping(
  iw: number,
  ih: number,
  boxW: number,
  boxH: number
): {
  iw: number;
  ih: number;
  boxW: number;
  boxH: number;
  scale: number;
  offsetX: number;
  offsetY: number;
} {
  if (iw < 2 || ih < 2 || boxW < 2 || boxH < 2) {
    return { iw, ih, boxW, boxH, scale: 1, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.min(boxW / iw, boxH / ih);
  const offsetX = (boxW - iw * scale) / 2;
  const offsetY = (boxH - ih * scale) / 2;
  return { iw, ih, boxW, boxH, scale, offsetX, offsetY };
}

function imageToDisplayPt(p: Point, m: ReturnType<typeof getObjectContainMapping>): Point {
  return { x: p.x * m.scale + m.offsetX, y: p.y * m.scale + m.offsetY };
}

function displayToImagePt(p: Point, m: ReturnType<typeof getObjectContainMapping>): Point {
  return { x: (p.x - m.offsetX) / m.scale, y: (p.y - m.offsetY) / m.scale };
}

function clampImagePt(p: Point, iw: number, ih: number, pad = 4): Point {
  return {
    x: Math.min(Math.max(pad, p.x), iw - pad),
    y: Math.min(Math.max(pad, p.y), ih - pad)
  };
}

export type ReceiptStillQuadEditorProps = {
  imageSrc: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
};

export function ReceiptStillQuadEditor({
  imageSrc,
  onCancel,
  onConfirm
}: ReceiptStillQuadEditorProps): React.JSX.Element {
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const quadRef = useRef<Point[] | null>(null);
  const manualQuadRef = useRef(false);
  const dragCornerRef = useRef<number | null>(null);
  const docDragCleanupRef = useRef<(() => void) | null>(null);

  const [ready, setReady] = useState(false);
  const [cvBusy, setCvBusy] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const rafRef = useRef<number>(0);

  const layoutOverlay = useCallback(() => {
    const wrap = wrapRef.current;
    const c = overlayRef.current;
    if (!wrap || !c) {
      return;
    }
    const rect = wrap.getBoundingClientRect();
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);
    c.style.width = `${rect.width}px`;
    c.style.height = `${rect.height}px`;
  }, []);

  useLayoutEffect(() => {
    let cancelled = false;
    const imgEl = imgRef.current;
    if (!imgEl) {
      return;
    }

    function buildSource(): void {
      const img = imgRef.current;
      if (!img || !img.naturalWidth || !img.naturalHeight) {
        return;
      }
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = iw;
      canvas.height = ih;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.drawImage(img, 0, 0);
      sourceCanvasRef.current = canvas;
      quadRef.current = fallbackCenterQuad(iw, ih, 0.08);
      manualQuadRef.current = false;
      setReady(true);
      setCvBusy(true);
      void (async (): Promise<void> => {
        const coarse =
          typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
        const procMax = coarse ? CV_SNAPSHOT_PROC_MAX_TOUCH : CV_SNAPSHOT_PROC_MAX_DESKTOP;
        const scaleProc = Math.min(procMax / iw, procMax / ih, 1);
        const procW = Math.max(96, Math.round(iw * scaleProc));
        const procH = Math.max(96, Math.round(ih * scaleProc));
        const cv = await loadOpenCvWithTimeout();
        if (cancelled) {
          return;
        }
        if (cv && !manualQuadRef.current) {
          try {
            const procPts = findReceiptQuadFromSource(cv, canvas, procW, procH);
            if (procPts) {
              quadRef.current = mapProcToVideo(procPts, iw, ih, procW, procH);
            }
          } catch {
            /* keep fallback */
          }
        }
        if (!cancelled) {
          setCvBusy(false);
        }
      })();
    }

    if (imgEl.complete && imgEl.naturalWidth) {
      buildSource();
    } else {
      imgEl.onload = (): void => buildSource();
      imgEl.onerror = (): void => setErrorMsg("Impossibile caricare l’immagine.");
    }

    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const wrap = wrapRef.current;
    if (!wrap) {
      return;
    }
    const ro = new ResizeObserver(() => layoutOverlay());
    ro.observe(wrap);
    layoutOverlay();
    return () => ro.disconnect();
  }, [ready, layoutOverlay]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    const tick = (): void => {
      const img = imgRef.current;
      const overlay = overlayRef.current;
      const wrap = wrapRef.current;
      if (!img || !overlay || !wrap || !sourceCanvasRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      if (iw < 32 || ih < 32) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      layoutOverlay();
      const rect = wrap.getBoundingClientRect();
      const ctx = overlay.getContext("2d");
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        ctx.scale(dpr, dpr);
        const m = getObjectContainMapping(iw, ih, rect.width, rect.height);
        const q = quadRef.current ?? fallbackCenterQuad(iw, ih, 0.08);
        if (q.length === 4) {
          ctx.strokeStyle = "rgba(34, 197, 94, 0.95)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          const p0 = imageToDisplayPt(q[0]!, m);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < 4; i++) {
            const p = imageToDisplayPt(q[i]!, m);
            ctx.lineTo(p.x, p.y);
          }
          ctx.closePath();
          ctx.stroke();
          ctx.fillStyle = "rgba(34, 197, 94, 0.12)";
          ctx.fill();
          const hr = HANDLE_RADIUS_CSS * 0.5;
          for (let i = 0; i < 4; i++) {
            const p = imageToDisplayPt(q[i]!, m);
            ctx.beginPath();
            ctx.fillStyle = "rgba(255,255,255,0.95)";
            ctx.arc(p.x, p.y, hr, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(34, 197, 94, 0.98)";
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [ready, layoutOverlay]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const overlay = overlayRef.current;
    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (!overlay || !wrap || !img || !sourceCanvasRef.current) {
      return;
    }
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const rect = overlay.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const m = getObjectContainMapping(iw, ih, wrap.getBoundingClientRect().width, wrap.getBoundingClientRect().height);
    const q = quadRef.current ?? fallbackCenterQuad(iw, ih, 0.08);
    let hit = -1;
    let best = Infinity;
    for (let i = 0; i < 4; i++) {
      const d = imageToDisplayPt(q[i]!, m);
      const dist = Math.hypot(d.x - mx, d.y - my);
      if (dist < best) {
        best = dist;
        hit = i;
      }
    }
    if (hit < 0 || best > HANDLE_RADIUS_CSS) {
      return;
    }
    e.preventDefault();
    docDragCleanupRef.current?.();
    const pointerId = e.pointerId;
    dragCornerRef.current = hit;
    manualQuadRef.current = true;

    const onMove = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId || dragCornerRef.current === null) {
        return;
      }
      const ov = overlayRef.current;
      const wr = wrapRef.current;
      const im = imgRef.current;
      if (!ov || !wr || !im) {
        return;
      }
      const r = ov.getBoundingClientRect();
      const mm = getObjectContainMapping(im.naturalWidth, im.naturalHeight, wr.getBoundingClientRect().width, wr.getBoundingClientRect().height);
      const mmx = ev.clientX - r.left;
      const mmy = ev.clientY - r.top;
      const idx = dragCornerRef.current;
      const next = clampImagePt(displayToImagePt({ x: mmx, y: mmy }, mm), im.naturalWidth, im.naturalHeight, 8);
      const base = quadRef.current ?? fallbackCenterQuad(im.naturalWidth, im.naturalHeight, 0.08);
      quadRef.current = base.map((p, i) => (i === idx ? next : p));
      ev.preventDefault();
    };

    const onEnd = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId) {
        return;
      }
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
      dragCornerRef.current = null;
    };

    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onEnd);
    document.addEventListener("pointercancel", onEnd);
    docDragCleanupRef.current = (): void => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
    };
  }, []);

  const handleConfirm = useCallback(async (): Promise<void> => {
    const cap = sourceCanvasRef.current;
    const q = quadRef.current;
    if (!cap || !q || q.length !== 4) {
      return;
    }
    setExporting(true);
    setErrorMsg(null);
    try {
      const cv = await loadOpenCvWithTimeout();
      let blob: Blob;
      if (cv) {
        try {
          blob = await warpQuadToBlob(cv, cap, q, "image/jpeg");
        } catch {
          blob = await cropQuadBoundingBoxToJpeg(cap, q);
        }
      } else {
        blob = await cropQuadBoundingBoxToJpeg(cap, q);
      }
      await Promise.resolve(onConfirm(blob));
    } catch {
      setErrorMsg("Esportazione ritaglio fallita. Riprova.");
    } finally {
      setExporting(false);
    }
  }, [onConfirm]);

  return (
    <div className="flex max-h-[min(85vh,720px)] w-full max-w-lg flex-col gap-3 rounded-xl border border-slate-600 bg-slate-950 p-4 text-slate-100 shadow-xl">
      <div className="text-sm font-medium">Ritaglio scontrino</div>
      <p className="text-xs text-slate-400">
        Verifica il riquadro verde; trascina i punti bianchi se serve. Conferma per usare questa immagine.
      </p>
      {errorMsg ? <p className="text-xs text-amber-400">{errorMsg}</p> : null}
      {cvBusy ? <p className="text-xs text-slate-500">Rilevamento bordi…</p> : null}
      <div
        ref={wrapRef}
        className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-lg bg-slate-900"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={imageSrc}
          alt="Scontrino da ritagliare"
          className="h-full w-full object-contain"
        />
        {ready ? (
          <canvas
            ref={overlayRef}
            className="absolute left-0 top-0 touch-none"
            style={{ touchAction: "none" }}
            aria-hidden
            onPointerDown={handlePointerDown}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
          onClick={onCancel}
          disabled={exporting}
        >
          Annulla
        </button>
        <button
          type="button"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          onClick={() => void handleConfirm()}
          disabled={!ready || exporting}
        >
          {exporting ? "Salvataggio…" : "Conferma ritaglio"}
        </button>
      </div>
    </div>
  );
}
