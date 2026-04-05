"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadOpenCv, type OpenCvRuntime } from "@/lib/opencv-loader";

type Point = { x: number; y: number };

function orderQuadPoints(pts: Point[]): [Point, Point, Point, Point] {
  const s = pts.map((p) => p.x + p.y);
  const d = pts.map((p) => p.x - p.y);
  const tl = pts[s.indexOf(Math.min(...s))]!;
  const br = pts[s.indexOf(Math.max(...s))]!;
  const tr = pts[d.indexOf(Math.max(...d))]!;
  const bl = pts[d.indexOf(Math.min(...d))]!;
  return [tl, tr, br, bl];
}

function smoothQuad(prev: Point[] | null, next: Point[], alpha: number): Point[] {
  if (!prev || prev.length !== 4) {
    return next;
  }
  return next.map((p, i) => ({
    x: prev[i]!.x * alpha + p.x * (1 - alpha),
    y: prev[i]!.y * alpha + p.y * (1 - alpha)
  }));
}

/** Rileva il più grande quadrilatero convesso (probabile scontrino) su frame ridimensionato. */
function findReceiptQuad(
  cv: OpenCvRuntime,
  video: HTMLVideoElement,
  procW: number,
  procH: number
): Point[] | null {
  const canvas = document.createElement("canvas");
  canvas.width = procW;
  canvas.height = procH;
  const ctx = canvas.getContext("2d");
  if (!ctx || video.readyState < 2) {
    return null;
  }
  ctx.drawImage(video, 0, 0, procW, procH);

  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const ksize = new cv.Size(5, 5);
    cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(blurred, edges, 50, 150);

    const frameArea = procW * procH;
    const minA = frameArea * 0.06;
    const maxA = frameArea * 0.92;

    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    let best: Point[] | null = null;
    let bestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      if (area < minA || area > maxA) {
        c.delete();
        continue;
      }
      const peri = cv.arcLength(c, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(c, approx, 0.035 * peri, true);
      c.delete();

      if (approx.rows !== 4 || !cv.isContourConvex(approx)) {
        approx.delete();
        continue;
      }

      const pts: Point[] = [];
      const dS = approx.data32S;
      const dF = approx.data32F;
      if (dS && dS.length >= 8) {
        for (let j = 0; j < 4; j++) {
          pts.push({ x: dS[j * 2]!, y: dS[j * 2 + 1]! });
        }
      } else if (dF && dF.length >= 8) {
        for (let j = 0; j < 4; j++) {
          pts.push({ x: dF[j * 2]!, y: dF[j * 2 + 1]! });
        }
      } else {
        approx.delete();
        continue;
      }
      approx.delete();

      if (area > bestArea) {
        bestArea = area;
        best = pts;
      }
    }

    return best;
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }
}

function mapProcToVideo(pts: Point[], vw: number, vh: number, procW: number, procH: number): Point[] {
  const sx = vw / procW;
  const sy = vh / procH;
  return pts.map((p) => ({ x: p.x * sx, y: p.y * sy }));
}

function fallbackCenterQuad(vw: number, vh: number, margin = 0.08): Point[] {
  const mx = vw * margin;
  const my = vh * margin;
  return [
    { x: mx, y: my },
    { x: vw - mx, y: my },
    { x: vw - mx, y: vh - my },
    { x: mx, y: vh - my }
  ];
}

function warpQuadToBlob(
  cv: OpenCvRuntime,
  sourceCanvas: HTMLCanvasElement,
  quadVideo: Point[],
  mime: "image/jpeg"
): Promise<Blob> {
  const [tl, tr, br, bl] = orderQuadPoints(quadVideo);
  const wTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const wBot = Math.hypot(br.x - bl.x, br.y - bl.y);
  const hLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const hRight = Math.hypot(br.x - tr.x, br.y - tr.y);
  const maxW = Math.max(wTop, wBot, 1);
  const maxH = Math.max(hLeft, hRight, 1);
  const outW = Math.min(1200, Math.round(maxW));
  const outH = Math.max(1, Math.min(1800, Math.round((maxH / maxW) * outW)));

  const srcMat = cv.imread(sourceCanvas);
  const dstMat = new cv.Mat();
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x,
    tl.y,
    tr.x,
    tr.y,
    br.x,
    br.y,
    bl.x,
    bl.y
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW - 1, 0, outW - 1, outH - 1, 0, outH - 1]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dsize = new cv.Size(outW, outH);

  try {
    cv.warpPerspective(
      srcMat,
      dstMat,
      M,
      dsize,
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(0, 0, 0, 255)
    );
  } finally {
    srcMat.delete();
    srcTri.delete();
    dstTri.delete();
    M.delete();
  }

  const outCanvas = document.createElement("canvas");
  const domId = `ocv-out-${Date.now()}`;
  outCanvas.id = domId;
  outCanvas.width = dstMat.cols;
  outCanvas.height = dstMat.rows;
  outCanvas.setAttribute(
    "style",
    "position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none;width:1px;height:1px;"
  );
  document.body.appendChild(outCanvas);
  try {
    cv.imshow(domId, dstMat);
  } finally {
    dstMat.delete();
  }

  return new Promise((resolve, reject) => {
    outCanvas.toBlob(
      (b) => {
        outCanvas.remove();
        if (b) {
          resolve(b);
        } else {
          reject(new Error("toBlob fallito"));
        }
      },
      mime,
      0.92
    );
  });
}

export type ReceiptLiveScannerProps = {
  open: boolean;
  onClose: () => void;
  /** Immagine rettificata (JPEG) pronta per OCR / invio. */
  onCapture: (blob: Blob) => void;
};

export function ReceiptLiveScanner({ open, onClose, onCapture }: ReceiptLiveScannerProps): React.JSX.Element | null {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cvRef = useRef<OpenCvRuntime | null>(null);
  const smoothRef = useRef<Point[] | null>(null);
  const rafRef = useRef<number>(0);
  const lastDetectRef = useRef(0);
  const quadVideoRef = useRef<Point[] | null>(null);

  const [phase, setPhase] = useState<"idle" | "loading_cv" | "camera" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cvProgress, setCvProgress] = useState<string>("");

  const stopCamera = useCallback((): void => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setPhase("idle");
      setErrorMsg(null);
      smoothRef.current = null;
      quadVideoRef.current = null;
      return;
    }

    let cancelled = false;

    async function start(): Promise<void> {
      setPhase("loading_cv");
      setCvProgress("Caricamento motore visione…");
      setErrorMsg(null);
      try {
        const cv = await loadOpenCv();
        if (cancelled) return;
        cvRef.current = cv;
      } catch {
        if (!cancelled) {
          setErrorMsg("Impossibile caricare il motore di scansione. Usa HTTPS o riprova.");
          setPhase("error");
        }
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMsg("Fotocamera non disponibile in questo browser.");
        setPhase("error");
        return;
      }

      setCvProgress("Avvio fotocamera…");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play();
        }
      } catch {
        if (!cancelled) {
          setErrorMsg("Permesso fotocamera negato o dispositivo non trovato.");
          setPhase("error");
        }
        return;
      }

      if (cancelled) return;
      setPhase("camera");
      setCvProgress("");
    }

    void start();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, stopCamera]);

  const layoutOverlay = useCallback(() => {
    const v = videoRef.current;
    const c = overlayRef.current;
    if (!v || !c) {
      return;
    }
    const rect = v.getBoundingClientRect();
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);
    c.style.width = `${rect.width}px`;
    c.style.height = `${rect.height}px`;
    c.style.left = "0";
    c.style.top = "0";
  }, []);

  useEffect(() => {
    if (!open || phase !== "camera") {
      return;
    }
    const v = videoRef.current;
    if (!v) {
      return;
    }
    const ro = new ResizeObserver(() => layoutOverlay());
    ro.observe(v);
    layoutOverlay();
    return () => ro.disconnect();
  }, [open, phase, layoutOverlay]);

  useEffect(() => {
    if (!open || phase !== "camera") {
      return;
    }
    const v = videoRef.current;
    if (!v) {
      return;
    }

    const cv = cvRef.current;
    if (!cv) {
      return;
    }

    const tick = (now: number): void => {
      if (!open || phase !== "camera") {
        return;
      }
      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (!video || !overlay || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw < 32 || vh < 32) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const procMax = 520;
      const scale = Math.min(procMax / vw, procMax / vh, 1);
      const procW = Math.max(160, Math.round(vw * scale));
      const procH = Math.max(160, Math.round(vh * scale));

      if (now - lastDetectRef.current > 90) {
        lastDetectRef.current = now;
        try {
          const procPts = findReceiptQuad(cv, video, procW, procH);
          if (procPts) {
            const inVideo = mapProcToVideo(procPts, vw, vh, procW, procH);
            smoothRef.current = smoothQuad(smoothRef.current, inVideo, 0.62);
            quadVideoRef.current = smoothRef.current;
          } else {
            quadVideoRef.current = smoothQuad(smoothRef.current, fallbackCenterQuad(vw, vh, 0.1), 0.75);
            smoothRef.current = quadVideoRef.current;
          }
        } catch {
          quadVideoRef.current = fallbackCenterQuad(vw, vh, 0.12);
        }
      }

      layoutOverlay();
      const ctx = overlay.getContext("2d");
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        ctx.scale(dpr, dpr);
        const rect = video.getBoundingClientRect();
        const dispW = rect.width;
        const dispH = rect.height;
        const scaleX = dispW / vw;
        const scaleY = dispH / vh;
        const q = quadVideoRef.current;
        if (q && q.length === 4) {
          ctx.strokeStyle = "rgba(34, 197, 94, 0.95)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(q[0]!.x * scaleX, q[0]!.y * scaleY);
          for (let i = 1; i < 4; i++) {
            ctx.lineTo(q[i]!.x * scaleX, q[i]!.y * scaleY);
          }
          ctx.closePath();
          ctx.stroke();
          ctx.fillStyle = "rgba(34, 197, 94, 0.12)";
          ctx.fill();
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
  }, [open, phase, layoutOverlay]);

  const handleCapture = useCallback(async () => {
    const video = videoRef.current;
    const cv = cvRef.current;
    if (!video || !cv || video.readyState < 2) {
      return;
    }
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cap = document.createElement("canvas");
    cap.width = vw;
    cap.height = vh;
    const cx = cap.getContext("2d");
    if (!cx) {
      return;
    }
    cx.drawImage(video, 0, 0, vw, vh);
    const quad = quadVideoRef.current ?? fallbackCenterQuad(vw, vh, 0.1);
    try {
      const blob = await warpQuadToBlob(cv, cap, quad, "image/jpeg");
      onCapture(blob);
      onClose();
    } catch {
      setErrorMsg("Elaborazione immagine fallita. Riprova.");
    }
  }, [onCapture, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">Scanner scontrino</h2>
          <p className="text-xs text-white/60">
            Inquadra lo scontrino: il rettangolo verde si aggiorna in tempo reale seguendo i bordi rilevati.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10"
          onClick={onClose}
        >
          Chiudi
        </button>
      </header>

      {phase === "loading_cv" || phase === "idle" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/70">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
          {cvProgress || "Preparazione…"}
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm text-red-300">{errorMsg}</p>
          <button
            type="button"
            className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
            onClick={onClose}
          >
            OK
          </button>
        </div>
      ) : null}

      {phase === "camera" ? (
        <>
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black p-2">
            <div className="relative inline-block max-h-full max-w-full overflow-hidden rounded-lg border border-white/10">
              <video
                ref={videoRef}
                className="block max-h-[min(72vh,920px)] w-auto max-w-full"
                autoPlay
                playsInline
                muted
              />
              <canvas
                ref={overlayRef}
                className="pointer-events-none absolute left-0 top-0"
                aria-hidden
              />
            </div>
          </div>
          {errorMsg ? <p className="px-4 py-1 text-center text-xs text-amber-300">{errorMsg}</p> : null}
          <footer className="flex shrink-0 justify-center gap-3 border-t border-white/10 px-4 py-4">
            <button
              type="button"
              className="rounded-lg border border-white/25 px-5 py-2.5 text-sm font-medium hover:bg-white/10"
              onClick={onClose}
            >
              Annulla
            </button>
            <button
              type="button"
              className="rounded-lg bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-slate-900 hover:bg-emerald-400"
              onClick={() => void handleCapture()}
            >
              Cattura scontrino
            </button>
          </footer>
        </>
      ) : null}
    </div>
  );
}
