"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadOpenCv, type OpenCvRuntime } from "@/lib/opencv-loader";

type Point = { x: number; y: number };

const NO_GET_USER_MEDIA = "NO_GET_USER_MEDIA";
/** JPEG minimo plausibile (header + pochi byte); sotto = probabile frame vuoto. */
const MIN_CAPTURE_BLOB_BYTES = 900;
const HANDLE_RADIUS_CSS = 22;

/** Mapping object-fit: cover — stesso calcolo per overlay e per hit-test maniglie. */
function getObjectCoverMapping(video: HTMLVideoElement): {
  vw: number;
  vh: number;
  dispW: number;
  dispH: number;
  scale: number;
  offsetX: number;
  offsetY: number;
} {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const rect = video.getBoundingClientRect();
  const dispW = rect.width;
  const dispH = rect.height;
  if (vw < 2 || vh < 2 || dispW < 2 || dispH < 2) {
    return { vw, vh, dispW, dispH, scale: 1, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.max(dispW / vw, dispH / vh);
  const offsetX = (dispW - vw * scale) / 2;
  const offsetY = (dispH - vh * scale) / 2;
  return { vw, vh, dispW, dispH, scale, offsetX, offsetY };
}

function videoToDisplayPt(p: Point, m: ReturnType<typeof getObjectCoverMapping>): Point {
  return { x: p.x * m.scale + m.offsetX, y: p.y * m.scale + m.offsetY };
}

function displayToVideoPt(p: Point, m: ReturnType<typeof getObjectCoverMapping>): Point {
  return { x: (p.x - m.offsetX) / m.scale, y: (p.y - m.offsetY) / m.scale };
}

function clampVideoPt(p: Point, vw: number, vh: number, pad = 4): Point {
  return {
    x: Math.min(Math.max(pad, p.x), vw - pad),
    y: Math.min(Math.max(pad, p.y), vh - pad)
  };
}

async function waitForVideoFrameOrRaf(video: HTMLVideoElement): Promise<void> {
  const rvfc = video.requestVideoFrameCallback?.bind(video);
  if (rvfc) {
    await new Promise<void>((resolve) => {
      rvfc(() => resolve());
    });
    return;
  }
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

async function waitUntilVideoReadyForCapture(
  video: HTMLVideoElement,
  maxAttempts = 20,
  delayMs = 50
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 32 && video.videoHeight > 32) {
      await waitForVideoFrameOrRaf(video);
      return true;
    }
    await new Promise<void>((r) => setTimeout(r, delayMs));
  }
  return false;
}

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

/**
 * Collega lo stream al video e avvia la riproduzione. Su mobile il `<video>` deve essere già nel DOM
 * prima di `getUserMedia`; `play()` a volte non basta finché non arrivano frame — aspettiamo eventi + timeout.
 */
async function attachStreamAndPlayVideo(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");

  try {
    await video.play();
  } catch {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await video.play();
  }

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      clearTimeout(timer);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("error", onError);
    };
    const resolveOk = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };
    const rejectFail = (err: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(err);
    };

    const onPlaying = (): void => resolveOk();
    const onLoaded = (): void => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        resolveOk();
      }
    };
    const onMeta = (): void => {
      if (video.videoWidth > 0 && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        resolveOk();
      }
    };
    const onError = (): void => rejectFail(new Error("video_error"));

    const timer = window.setTimeout(() => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        resolveOk();
      } else {
        rejectFail(new Error("play_timeout"));
      }
    }, 12000);

    video.addEventListener("playing", onPlaying, { once: true });
    video.addEventListener("loadeddata", onLoaded, { once: true });
    video.addEventListener("loadedmetadata", onMeta, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
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

/** Estrae 4 vertici da approxPolyDP (layout variabile in OpenCV.js). */
function extractQuadFromApproxMat(approx: {
  rows: number;
  cols: number;
  data32S?: Int32Array;
  data32F?: Float32Array;
}): Point[] | null {
  const dS = approx.data32S;
  const dF = approx.data32F;
  const read4 = (get: (i: number) => number): Point[] => {
    const pts: Point[] = [];
    for (let j = 0; j < 4; j++) {
      pts.push({ x: get(j * 2), y: get(j * 2 + 1) });
    }
    return pts;
  };
  if (approx.rows === 4) {
    if (dS && dS.length >= 8) {
      return read4((i) => dS[i]!);
    }
    if (dF && dF.length >= 8) {
      return read4((i) => dF[i]!);
    }
  }
  if (approx.rows === 1 && approx.cols === 4) {
    if (dS && dS.length >= 8) {
      return read4((i) => dS[i]!);
    }
    if (dF && dF.length >= 8) {
      return read4((i) => dF[i]!);
    }
  }
  if (approx.rows === 4 && approx.cols === 1 && dS && dS.length >= 8) {
    return read4((i) => dS[i]!);
  }
  if (approx.rows === 4 && approx.cols === 1 && dF && dF.length >= 8) {
    return read4((i) => dF[i]!);
  }
  return null;
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
    cv.Canny(blurred, edges, 40, 120);

    const frameArea = procW * procH;
    const minA = frameArea * 0.045;
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
      cv.approxPolyDP(c, approx, 0.048 * peri, true);
      c.delete();

      if (!cv.isContourConvex(approx)) {
        approx.delete();
        continue;
      }

      const pts = extractQuadFromApproxMat(approx);
      approx.delete();
      if (!pts || pts.length !== 4) {
        continue;
      }

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
  onCapture: (blob: Blob) => void | Promise<void>;
  /** `page`: schermata dedicata (stile lettore documenti); `modal`: overlay sopra il form. */
  variant?: "modal" | "page";
};

export function ReceiptLiveScanner({
  open,
  onClose,
  onCapture,
  variant = "modal"
}: ReceiptLiveScannerProps): React.JSX.Element | null {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cvRef = useRef<OpenCvRuntime | null>(null);
  const smoothRef = useRef<Point[] | null>(null);
  const rafRef = useRef<number>(0);
  const lastDetectRef = useRef(0);
  const quadVideoRef = useRef<Point[] | null>(null);
  /** Indice vertice 0–3 trascinato dall’utente, o null. */
  const dragCornerRef = useRef<number | null>(null);
  /** Sospende smoothing CV mentre si muove una maniglia. */
  const manualQuadRef = useRef(false);

  const [phase, setPhase] = useState<"idle" | "starting" | "camera" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cvProgress, setCvProgress] = useState<string>("");
  const [cvLoadState, setCvLoadState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [capturing, setCapturing] = useState(false);
  /** Incrementato per ritentare getUserMedia senza chiudere il modale. */
  const [cameraRetryNonce, setCameraRetryNonce] = useState(0);
  const footerRef = useRef<HTMLElement | null>(null);
  /** Cleanup listener document-level per drag maniglie (evita setPointerCapture su iOS). */
  const docDragCleanupRef = useRef<(() => void) | null>(null);

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
      setCapturing(false);
      dragCornerRef.current = null;
      manualQuadRef.current = false;
      docDragCleanupRef.current?.();
      docDragCleanupRef.current = null;
      return;
    }

    let cancelled = false;

    async function start(): Promise<void> {
      setPhase("starting");
      setCvProgress("Connessione alla fotocamera…");
      setErrorMsg(null);
      setCvLoadState("loading");
      cvRef.current = null;
      manualQuadRef.current = false;
      dragCornerRef.current = null;

      const insecureHint = secureCameraContextMessage();
      if (insecureHint) {
        if (!cancelled) {
          setErrorMsg(insecureHint);
          setPhase("error");
          setCvLoadState("idle");
        }
        return;
      }

      try {
        const stream = await acquireCameraStream();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          if (!cancelled) {
            setErrorMsg(
              "Anteprima video non inizializzata. Chiudi e riapri lo scanner, poi riprova."
            );
            setPhase("error");
            setCvLoadState("idle");
          }
          return;
        }
        try {
          await attachStreamAndPlayVideo(v, stream);
        } catch (playErr) {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          v.srcObject = null;
          if (!cancelled) {
            const msg = playErr instanceof Error ? playErr.message : "";
            const pn =
              playErr && typeof playErr === "object" && "name" in playErr
                ? String((playErr as { name: string }).name)
                : "";
            if (msg === "play_timeout") {
              setErrorMsg(
                "L’anteprima della fotocamera non si è avviata in tempo. Tocca Riprova, assicurati che nessun’altra app usi la camera e che la connessione sia stabile."
              );
            } else if (pn === "NotAllowedError") {
              setErrorMsg(
                "Riproduzione video bloccata dal browser. Tocca Riprova o interagisci con la pagina, poi riapri lo scanner."
              );
            } else {
              setErrorMsg("Impossibile avviare l’anteprima video. Tocca Riprova.");
            }
            setPhase("error");
            setCvLoadState("idle");
          }
          return;
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

      /* Mostra subito l’anteprima: OpenCV può richiedere decine di secondi su mobile e non deve bloccare getUserMedia/play. */
      setPhase("camera");
      setCvProgress("");

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
          cvRef.current = null;
          setCvLoadState("failed");
        });
    }

    void start();

    return () => {
      cancelled = true;
      docDragCleanupRef.current?.();
      docDragCleanupRef.current = null;
      dragCornerRef.current = null;
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

    const coarsePointer =
      typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    const detectEveryMs = coarsePointer ? 220 : 130;
    const procMax = coarsePointer ? 360 : 400;

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

      const scaleProc = Math.min(procMax / vw, procMax / vh, 1);
      const procW = Math.max(160, Math.round(vw * scaleProc));
      const procH = Math.max(160, Math.round(vh * scaleProc));

      const dragging = dragCornerRef.current !== null;
      if (!dragging && now - lastDetectRef.current > detectEveryMs) {
        lastDetectRef.current = now;
        const cv = cvRef.current;
        if (cv) {
          try {
            const procPts = findReceiptQuad(cv, video, procW, procH);
            if (procPts) {
              const inVideo = mapProcToVideo(procPts, vw, vh, procW, procH);
              if (!manualQuadRef.current) {
                smoothRef.current = smoothQuad(smoothRef.current, inVideo, 0.62);
                quadVideoRef.current = smoothRef.current;
              }
            } else if (!manualQuadRef.current) {
              quadVideoRef.current = smoothQuad(smoothRef.current, fallbackCenterQuad(vw, vh, 0.1), 0.75);
              smoothRef.current = quadVideoRef.current;
            }
          } catch {
            if (!manualQuadRef.current) {
              quadVideoRef.current = fallbackCenterQuad(vw, vh, 0.12);
            }
          }
        } else if (!manualQuadRef.current) {
          quadVideoRef.current = smoothQuad(smoothRef.current, fallbackCenterQuad(vw, vh, 0.1), 0.75);
          smoothRef.current = quadVideoRef.current;
        }
      }

      if (!quadVideoRef.current) {
        quadVideoRef.current = fallbackCenterQuad(vw, vh, 0.1);
        smoothRef.current = quadVideoRef.current;
      }

      layoutOverlay();
      const ctx = overlay.getContext("2d");
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        ctx.scale(dpr, dpr);
        const map = getObjectCoverMapping(video);
        const q = quadVideoRef.current;
        if (q && q.length === 4) {
          ctx.strokeStyle = "rgba(34, 197, 94, 0.95)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          const p0 = videoToDisplayPt(q[0]!, map);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < 4; i++) {
            const p = videoToDisplayPt(q[i]!, map);
            ctx.lineTo(p.x, p.y);
          }
          ctx.closePath();
          ctx.stroke();
          ctx.fillStyle = "rgba(34, 197, 94, 0.12)";
          ctx.fill();

          const hr = HANDLE_RADIUS_CSS * 0.5;
          for (let i = 0; i < 4; i++) {
            const p = videoToDisplayPt(q[i]!, map);
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
  }, [open, phase, layoutOverlay]);

  const handleOverlayPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const overlay = overlayRef.current;
    const video = videoRef.current;
    if (!overlay || !video || phase !== "camera") {
      return;
    }
    const rect = overlay.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const m = getObjectCoverMapping(video);
    const q = quadVideoRef.current ?? fallbackCenterQuad(m.vw, m.vh, 0.1);
    let hit = -1;
    let best = Infinity;
    for (let i = 0; i < 4; i++) {
      const d = videoToDisplayPt(q[i]!, m);
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
    docDragCleanupRef.current = null;

    const pointerId = e.pointerId;
    dragCornerRef.current = hit;
    manualQuadRef.current = true;

    const onMove = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId || dragCornerRef.current === null) {
        return;
      }
      const ov = overlayRef.current;
      const vid = videoRef.current;
      if (!ov || !vid) {
        return;
      }
      const r = ov.getBoundingClientRect();
      const mmx = ev.clientX - r.left;
      const mmy = ev.clientY - r.top;
      const map = getObjectCoverMapping(vid);
      const idx = dragCornerRef.current;
      const next = clampVideoPt(displayToVideoPt({ x: mmx, y: mmy }, map), map.vw, map.vh, 8);
      const base = quadVideoRef.current ?? fallbackCenterQuad(map.vw, map.vh, 0.1);
      quadVideoRef.current = base.map((p, i) => (i === idx ? next : p));
      smoothRef.current = quadVideoRef.current;
      ev.preventDefault();
    };

    const onEnd = (ev: PointerEvent): void => {
      if (ev.pointerId !== pointerId) {
        return;
      }
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
      docDragCleanupRef.current = null;
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
  }, [phase]);

  const handleCapture = useCallback(async () => {
    if (capturing) {
      return;
    }
    setErrorMsg(null);
    const video = videoRef.current;
    if (!video) {
      setErrorMsg("Video non disponibile. Riapri lo scanner.");
      return;
    }

    setCapturing(true);
    try {
      const ok = await waitUntilVideoReadyForCapture(video);
      if (!ok) {
        setErrorMsg("Il video non è ancora pronto. Attendi un secondo e riprova.");
        return;
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw < 32 || vh < 32) {
        setErrorMsg("Risoluzione video non valida. Riprova.");
        return;
      }

      const cap = document.createElement("canvas");
      cap.width = vw;
      cap.height = vh;
      const cx = cap.getContext("2d");
      if (!cx) {
        setErrorMsg("Canvas non disponibile in questo browser.");
        return;
      }
      cx.drawImage(video, 0, 0, vw, vh);

      const imageData = cx.getImageData(0, 0, Math.min(32, vw), Math.min(32, vh));
      const data = imageData.data;
      let nonZero = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i]! + data[i + 1]! + data[i + 2]! > 8) {
          nonZero++;
        }
      }
      if (nonZero < 12) {
        setErrorMsg(
          "Il fotogramma sembra vuoto (spesso su Safari). Muovi leggermente la camera e riprova a catturare."
        );
        return;
      }

      const quad = quadVideoRef.current ?? fallbackCenterQuad(vw, vh, 0.1);

      const tryFinalize = async (blob: Blob): Promise<boolean> => {
        if (blob.size < MIN_CAPTURE_BLOB_BYTES) {
          return false;
        }
        await Promise.resolve(onCapture(blob));
        onClose();
        return true;
      };

      let cv = cvRef.current;
      if (!cv) {
        try {
          cv = await loadOpenCv();
          cvRef.current = cv;
          setCvLoadState("ready");
        } catch {
          try {
            const blob = await cropQuadBoundingBoxToJpeg(cap, quad);
            if (!(await tryFinalize(blob))) {
              setErrorMsg("Immagine catturata troppo piccola o vuota. Riprova.");
            }
          } catch {
            setErrorMsg(
              "OpenCV non disponibile e ritaglio fallito. Controlla la connessione o usa Carica foto."
            );
          }
          return;
        }
      }

      try {
        const blob = await warpQuadToBlob(cv, cap, quad, "image/jpeg");
        if (await tryFinalize(blob)) {
          return;
        }
      } catch {
        /* fallback sotto */
      }
      try {
        const blob = await cropQuadBoundingBoxToJpeg(cap, quad);
        if (await tryFinalize(blob)) {
          return;
        }
        setErrorMsg(
          "Immagine troppo piccola dopo il ritaglio. Allarga il rettangolo o migliora la luce e riprova."
        );
      } catch {
        setErrorMsg("Elaborazione immagine fallita. Regola i vertici bianchi/verdi e riprova.");
      }
    } finally {
      setCapturing(false);
    }
  }, [capturing, onCapture, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-black text-white">
      <header className="relative z-40 flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Scanner scontrino</h2>
          <p className="text-xs text-white/60">
            {variant === "page"
              ? "Schermata dedicata alla scansione in tempo reale. Inquadra lo scontrino: il rettangolo segue i bordi quando OpenCV è attivo. Trascina i punti bianchi per correggere."
              : "Inquadra lo scontrino: il rettangolo segue i bordi (OpenCV). Trascina i punti bianchi per correggere manualmente. Tocca \"Segui automatico\" per tornare al rilevamento continuo."}
          </p>
        </div>
        <button
          type="button"
          className="touch-manipulation rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10"
          onClick={onClose}
        >
          {variant === "page" ? "Indietro" : "Chiudi"}
        </button>
      </header>

      {/*
        Il <video> deve restare nel DOM durante "starting"/"idle": altrimenti videoRef è null,
        lo stream non si collega e su molti mobile getUserMedia non completa bene senza elemento video.
      */}
      <div className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-black">
        <div
          className={
            phase === "camera"
              ? "relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden p-2"
              : "pointer-events-none absolute left-0 top-0 z-[1] h-[2px] w-[2px] overflow-hidden opacity-[0.01]"
          }
        >
          <div
            className={
              phase === "camera"
                ? "relative mx-auto flex aspect-[3/4] h-auto max-h-[min(52dvh,calc(100dvh-12rem))] w-full max-w-full min-h-0 overflow-hidden rounded-lg border border-white/10 sm:max-w-lg"
                : "relative block h-[2px] w-[2px]"
            }
          >
            <video
              ref={videoRef}
              className={
                phase === "camera"
                  ? "h-full w-full object-cover"
                  : "block h-[2px] min-h-[2px] w-[2px] min-w-[2px] object-cover"
              }
              autoPlay
              playsInline
              muted
            />
            {phase === "camera" ? (
              <canvas
                ref={overlayRef}
                className="absolute left-0 top-0 touch-none"
                style={{ touchAction: "none" }}
                aria-hidden
                onPointerDown={handleOverlayPointerDown}
              />
            ) : null}
          </div>
        </div>

        {phase === "starting" || phase === "idle" ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black px-6 text-center text-sm text-white/70">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
            {cvProgress || "Preparazione…"}
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black px-6 text-center">
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
      </div>

      {phase === "camera" ? (
        <>
          {cvLoadState === "loading" ? (
            <p className="px-4 py-1 text-center text-xs text-white/50">
              Caricamento rilevamento bordi in background… l’anteprima fotocamera è già attiva.
            </p>
          ) : null}
          {cvLoadState === "failed" ? (
            <p className="px-4 py-1 text-center text-xs text-amber-300/90">
              Rilevamento automatico non disponibile (rete o blocco script). Trascina i quattro punti bianchi sull’angolo
              dello scontrino, poi cattura: verrà applicato un ritaglio rettangolare.
            </p>
          ) : null}
          {errorMsg ? <p className="px-4 py-1 text-center text-xs text-amber-300">{errorMsg}</p> : null}
          <footer
            ref={footerRef}
            className="relative z-40 flex shrink-0 flex-col items-center gap-3 border-t border-white/10 bg-black px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
          >
            <button
              type="button"
              className="touch-manipulation text-xs text-white/60 underline decoration-white/30 underline-offset-2 hover:text-white/90"
              onClick={() => {
                manualQuadRef.current = false;
                dragCornerRef.current = null;
                smoothRef.current = null;
              }}
            >
              Segui automatico (OpenCV)
            </button>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                className="touch-manipulation rounded-lg border border-white/25 px-5 py-2.5 text-sm font-medium hover:bg-white/10"
                onClick={onClose}
                disabled={capturing}
              >
                Annulla
              </button>
              <button
                type="button"
                className="touch-manipulation rounded-lg bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-slate-900 hover:bg-emerald-400 disabled:opacity-50"
                disabled={capturing}
                onClick={() => void handleCapture()}
              >
                {capturing ? "Elaborazione…" : "Cattura scontrino"}
              </button>
            </div>
          </footer>
        </>
      ) : null}
    </div>
  );
}
