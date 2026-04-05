"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadOpenCv, type OpenCvRuntime } from "@/lib/opencv-loader";

type Point = { x: number; y: number };

const NO_GET_USER_MEDIA = "NO_GET_USER_MEDIA";

function secureCameraContextMessage(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (!window.isSecureContext) {
    return "La fotocamera è disponibile solo in contesto sicuro: usa https:// oppure http://localhost (o 127.0.0.1). Aprendo il sito da un indirizzo LAN o da file locale il browser blocca getUserMedia.";
  }
  return null;
}

/**
 * Prova più profili video: su desktop spesso non esiste `environment`, e vincoli troppo stretti
 * producono OverconstrainedError con un solo tentativo.
 */
async function acquireCameraStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(NO_GET_USER_MEDIA);
  }

  const strategies: MediaTrackConstraints[] = [
    { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    { facingMode: { ideal: "environment" } },
    { facingMode: { ideal: "user" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    { facingMode: { ideal: "user" } },
    { width: { ideal: 1280 }, height: { ideal: 720 } },
    { width: { ideal: 640 }, height: { ideal: 480 } },
    {}
  ];

  let lastErr: unknown;
  for (const video of strategies) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (e) {
      lastErr = e;
    }
  }

  try {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch (e) {
    throw lastErr ?? e;
  }
}

function formatGetUserMediaError(err: unknown): string {
  if (err instanceof Error && err.message === NO_GET_USER_MEDIA) {
    return "Questo browser non espone getUserMedia (fotocamera). Aggiorna il browser o usa Carica foto.";
  }
  const secure = secureCameraContextMessage();
  if (secure) {
    return secure;
  }
  const name =
    err && typeof err === "object" && "name" in err ? String((err as { name: string }).name) : "";
  const message =
    err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "";

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Permesso fotocamera negato. Nelle impostazioni del sito consenti la fotocamera, poi tocca Riprova. Su aziende/VPN a volte serve un’eccezione per l’origine.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "Nessuna fotocamera trovata. Collega una webcam, abilita la camera integrata nelle impostazioni di Windows, oppure usa Carica foto.";
    case "NotReadableError":
    case "TrackStartError":
      return "La fotocamera è occupata da un’altra applicazione o scheda. Chiudi Teams/Zoom/browser che usano la camera e tocca Riprova.";
    case "OverconstrainedError":
      return "Il browser non ha accettato i vincoli video richiesti. Abbiamo già provato profili alternativi: tocca Riprova o usa Carica foto.";
    case "SecurityError":
      return "Accesso fotocamera bloccato per sicurezza. Usa HTTPS o localhost.";
    case "AbortError":
      return "Richiesta fotocamera interrotta. Tocca Riprova.";
    default:
      return message
        ? `Impossibile avviare la fotocamera (${name || "errore"}: ${message}). Tocca Riprova o usa Carica foto.`
        : "Impossibile avviare la fotocamera. Tocca Riprova o usa Carica foto.";
  }
}

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

/** Ritaglio asse-allineato (fallback se OpenCV non è disponibile o warp fallisce). */
function cropQuadBoundingBoxToJpeg(sourceCanvas: HTMLCanvasElement, quad: Point[]): Promise<Blob> {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  let x = Math.floor(Math.min(...xs));
  let y = Math.floor(Math.min(...ys));
  let x2 = Math.ceil(Math.max(...xs));
  let y2 = Math.ceil(Math.max(...ys));
  x = Math.max(0, x);
  y = Math.max(0, y);
  x2 = Math.min(sourceCanvas.width, x2);
  y2 = Math.min(sourceCanvas.height, y2);
  const w = Math.max(1, x2 - x);
  const h = Math.max(1, y2 - y);
  const maxOutW = 1200;
  const outW = Math.min(maxOutW, w);
  const outH = Math.max(1, Math.min(1800, Math.round((h / w) * outW)));
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d");
  if (!ctx) {
    return Promise.reject(new Error("Canvas 2D non disponibile"));
  }
  ctx.drawImage(sourceCanvas, x, y, w, h, 0, 0, outW, outH);
  return new Promise((resolve, reject) => {
    out.toBlob(
      (b) => {
        if (b) {
          resolve(b);
        } else {
          reject(new Error("toBlob fallito"));
        }
      },
      "image/jpeg",
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

  const [phase, setPhase] = useState<"idle" | "starting" | "camera" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cvProgress, setCvProgress] = useState<string>("");
  const [cvLoadState, setCvLoadState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  /** Incrementato per ritentare getUserMedia senza chiudere il modale. */
  const [cameraRetryNonce, setCameraRetryNonce] = useState(0);

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
      setCvLoadState("idle");
      setCameraRetryNonce(0);
      return;
    }

    let cancelled = false;

    async function start(): Promise<void> {
      setPhase("starting");
      setCvProgress("Connessione alla fotocamera…");
      setErrorMsg(null);
      setCvLoadState("loading");

      const insecureHint = secureCameraContextMessage();
      if (insecureHint) {
        if (!cancelled) {
          setErrorMsg(insecureHint);
          setPhase("error");
          setCvLoadState("idle");
        }
        return;
      }

      void loadOpenCv()
        .then((cv) => {
          if (cancelled) {
            return;
          }
          cvRef.current = cv;
          setCvLoadState("ready");
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          setCvLoadState("failed");
        });

      try {
        const stream = await acquireCameraStream();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          try {
            await v.play();
          } catch {
            await new Promise<void>((r) => {
              requestAnimationFrame(() => r());
            });
            try {
              await v.play();
            } catch (playErr) {
              stream.getTracks().forEach((t) => t.stop());
              streamRef.current = null;
              v.srcObject = null;
              if (!cancelled) {
                const pn =
                  playErr && typeof playErr === "object" && "name" in playErr
                    ? String((playErr as { name: string }).name)
                    : "";
                setErrorMsg(
                  pn === "NotAllowedError"
                    ? "Riproduzione video bloccata dal browser. Tocca Riprova o interagisci con la pagina, poi riapri lo scanner."
                    : "Impossibile avviare l’anteprima video. Tocca Riprova."
                );
                setPhase("error");
              }
              return;
            }
          }
        }
      } catch (camErr) {
        if (!cancelled) {
          setErrorMsg(formatGetUserMediaError(camErr));
          setPhase("error");
        }
        return;
      }

      if (cancelled) {
        return;
      }
      setPhase("camera");
      setCvProgress("");
    }

    void start();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, stopCamera, cameraRetryNonce]);

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
        const cv = cvRef.current;
        if (cv) {
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
        } else {
          quadVideoRef.current = smoothQuad(smoothRef.current, fallbackCenterQuad(vw, vh, 0.1), 0.75);
          smoothRef.current = quadVideoRef.current;
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
    if (!video || video.readyState < 2) {
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

    let cv = cvRef.current;
    if (!cv) {
      try {
        cv = await loadOpenCv();
        cvRef.current = cv;
        setCvLoadState("ready");
      } catch {
        try {
          const blob = await cropQuadBoundingBoxToJpeg(cap, quad);
          onCapture(blob);
          onClose();
        } catch {
          setErrorMsg("Motore di scansione non disponibile e ritaglio di fallback fallito. Controlla la connessione.");
        }
        return;
      }
    }

    try {
      const blob = await warpQuadToBlob(cv, cap, quad, "image/jpeg");
      onCapture(blob);
      onClose();
    } catch {
      try {
        const blob = await cropQuadBoundingBoxToJpeg(cap, quad);
        onCapture(blob);
        onClose();
      } catch {
        setErrorMsg("Elaborazione immagine fallita. Riprova.");
      }
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

      {phase === "starting" || phase === "idle" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/70">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
          {cvProgress || "Preparazione…"}
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="max-w-md text-sm text-red-300">{errorMsg}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              onClick={() => {
                setErrorMsg(null);
                setPhase("idle");
                setCameraRetryNonce((n) => n + 1);
              }}
            >
              Riprova fotocamera
            </button>
            <button
              type="button"
              className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
              onClick={onClose}
            >
              Chiudi
            </button>
          </div>
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
          {cvLoadState === "loading" ? (
            <p className="px-4 py-1 text-center text-xs text-white/50">
              Caricamento rilevamento bordi in background… la fotocamera è già attiva.
            </p>
          ) : null}
          {cvLoadState === "failed" ? (
            <p className="px-4 py-1 text-center text-xs text-amber-300/90">
              Rilevamento automatico non disponibile (rete o blocco script). Usa il rettangolo centrale e cattura: verrà
              applicato un ritaglio rettangolare.
            </p>
          ) : null}
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
