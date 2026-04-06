"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  fallbackCenterQuad,
  type Point
} from "@/lib/receipt-quad-cv";
import {
  compressCanvasToJpegBlob,
  RECEIPT_CAPTURE_JPEG_QUALITY,
  RECEIPT_CAPTURE_MAX_EDGE
} from "@/lib/receipt-image-compress";

const NO_GET_USER_MEDIA = "NO_GET_USER_MEDIA";
const HANDLE_RADIUS_CSS = 22;

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

export type ReceiptLiveScannerProps = {
  open: boolean;
  onClose: () => void;
  /** Fotogrammi JPEG a piena risoluzione; il ritaglio avviene nella pagina di revisione. */
  onSessionComplete: (blobs: Blob[]) => void | Promise<void>;
  variant?: "modal" | "page";
};

export function ReceiptLiveScanner({
  open,
  onClose,
  onSessionComplete,
  variant = "modal"
}: ReceiptLiveScannerProps): React.JSX.Element | null {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const quadVideoRef = useRef<Point[] | null>(null);
  const dragCornerRef = useRef<number | null>(null);
  const manualQuadRef = useRef(false);
  const sessionBlobsRef = useRef<Blob[]>([]);

  const [phase, setPhase] = useState<
    "idle" | "starting" | "camera" | "promptMore" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cvProgress, setCvProgress] = useState<string>("");
  const [capturing, setCapturing] = useState(false);
  const [cameraRetryNonce, setCameraRetryNonce] = useState(0);
  /** Foto già accodate in questa sessione (per UI reattiva). */
  const [sessionSavedCount, setSessionSavedCount] = useState(0);
  const docDragCleanupRef = useRef<(() => void) | null>(null);

  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setPortalRoot(document.body);
  }, []);

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
      quadVideoRef.current = null;
      setCameraRetryNonce(0);
      setCapturing(false);
      sessionBlobsRef.current = [];
      setSessionSavedCount(0);
      dragCornerRef.current = null;
      manualQuadRef.current = false;
      docDragCleanupRef.current?.();
      docDragCleanupRef.current = null;
      return;
    }

    if (!portalRoot) {
      return;
    }

    let cancelled = false;

    async function start(): Promise<void> {
      setPhase("starting");
      setCvProgress("Connessione alla fotocamera…");
      setErrorMsg(null);
      manualQuadRef.current = false;
      dragCornerRef.current = null;

      const insecureHint = secureCameraContextMessage();
      if (insecureHint) {
        if (!cancelled) {
          setErrorMsg(insecureHint);
          setPhase("error");
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

      setPhase("camera");
      setCvProgress("");
    }

    void start();

    return () => {
      cancelled = true;
      docDragCleanupRef.current?.();
      docDragCleanupRef.current = null;
      dragCornerRef.current = null;
      stopCamera();
    };
  }, [open, portalRoot, stopCamera, cameraRetryNonce]);

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

    const tick = (): void => {
      if (!open || phase !== "camera") {
        return;
      }
      const video = videoRef.current;
      const overlay = overlayRef.current;
      const vwEarly = video?.videoWidth ?? 0;
      const vhEarly = video?.videoHeight ?? 0;
      if (!video || !overlay || vwEarly < 32 || vhEarly < 32) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;

      if (!quadVideoRef.current) {
        quadVideoRef.current = fallbackCenterQuad(vw, vh, 0.1);
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

  const handleCaptureRaw = useCallback(async () => {
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
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

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

      const blob = await compressCanvasToJpegBlob(cap, RECEIPT_CAPTURE_MAX_EDGE, RECEIPT_CAPTURE_JPEG_QUALITY);
      if (!blob || blob.size < 900) {
        setErrorMsg("Cattura fallita o immagine troppo piccola. Riprova.");
        return;
      }

      sessionBlobsRef.current = [...sessionBlobsRef.current, blob];
      setSessionSavedCount(sessionBlobsRef.current.length);
      setPhase("promptMore");
    } finally {
      setCapturing(false);
    }
  }, [capturing]);

  const finishSession = useCallback(async (): Promise<void> => {
    stopCamera();
    const blobs = [...sessionBlobsRef.current];
    sessionBlobsRef.current = [];
    await Promise.resolve(onSessionComplete(blobs));
    // Non chiamare onClose: il padre naviga già verso review; onClose farebbe un secondo replace (es. /expenses).
  }, [onSessionComplete, stopCamera]);

  if (!open) {
    return null;
  }

  if (!portalRoot) {
    return null;
  }

  const shell = (
    <div
      className="fixed inset-0 z-[200000] flex max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-black text-white"
      style={{ isolation: "isolate" }}
    >
      <header className="relative z-40 flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Scanner scontrino</h2>
          <p className="text-xs text-white/60">
            {variant === "page"
              ? "Inquadra lo scontrino. La foto viene salvata in sessione (compressa) e ritagliata al passo successivo, senza rilevamento automatico dei bordi."
              : "Inquadra lo scontrino; dopo la cattura scegli se aggiungerne altre o andare al ritaglio manuale."}
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

        {phase === "promptMore" ? (
          <div
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-black/95 px-6 text-center"
            role="status"
            aria-live="polite"
          >
            <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/50 px-5 py-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-xl font-bold text-slate-900">
                ✓
              </div>
              <p className="text-base font-semibold text-emerald-100">Foto salvata in sessione</p>
              <p className="text-sm text-white/85">
                Hai <span className="font-semibold text-white">{sessionSavedCount}</span> foto in coda (JPEG
                compresso, lato lungo max {RECEIPT_CAPTURE_MAX_EDGE}px).
                Non sono ancora sul server: andrai al ritaglio manuale al passo successivo.
              </p>
            </div>
            <p className="max-w-sm text-sm text-white/70">Vuoi aggiungere un altro scontrino prima di continuare?</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
              <button
                type="button"
                className="touch-manipulation rounded-lg border border-white/25 px-6 py-3 text-sm font-medium hover:bg-white/10"
                onClick={() => void finishSession()}
              >
                No, torna all&apos;elenco ({sessionSavedCount} foto)
              </button>
              <button
                type="button"
                className="touch-manipulation rounded-lg bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-emerald-400"
                onClick={() => {
                  manualQuadRef.current = false;
                  dragCornerRef.current = null;
                  const vid = videoRef.current;
                  if (vid && vid.videoWidth >= 32 && vid.videoHeight >= 32) {
                    quadVideoRef.current = fallbackCenterQuad(vid.videoWidth, vid.videoHeight, 0.1);
                  }
                  setPhase("camera");
                }}
              >
                Sì, aggiungi un&apos;altra foto
              </button>
              <button
                type="button"
                disabled={sessionSavedCount < 1}
                className="touch-manipulation rounded-lg border border-amber-500/50 px-6 py-3 text-sm text-amber-100 hover:bg-white/10 disabled:opacity-40"
                onClick={() => {
                  sessionBlobsRef.current = sessionBlobsRef.current.slice(0, -1);
                  setSessionSavedCount(sessionBlobsRef.current.length);
                  manualQuadRef.current = false;
                  dragCornerRef.current = null;
                  const vid = videoRef.current;
                  if (vid && vid.videoWidth >= 32 && vid.videoHeight >= 32) {
                    quadVideoRef.current = fallbackCenterQuad(vid.videoWidth, vid.videoHeight, 0.1);
                  }
                  setPhase("camera");
                }}
              >
                Rimuovi ultima foto
              </button>
            </div>
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
          <p className="px-4 py-1 text-center text-xs text-white/45">
            Cattura in qualità limitata per velocità; ritaglio manuale al passo successivo (nessun rilevamento automatico).
          </p>
          {errorMsg ? <p className="px-4 py-1 text-center text-xs text-amber-300">{errorMsg}</p> : null}
          <footer className="relative z-40 flex shrink-0 flex-col items-center gap-3 border-t border-white/10 bg-black px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              className="touch-manipulation text-xs text-white/60 underline decoration-white/30 underline-offset-2 hover:text-white/90"
              onClick={() => {
                const vid = videoRef.current;
                manualQuadRef.current = false;
                dragCornerRef.current = null;
                if (vid && vid.videoWidth >= 32 && vid.videoHeight >= 32) {
                  quadVideoRef.current = fallbackCenterQuad(vid.videoWidth, vid.videoHeight, 0.1);
                }
              }}
            >
              Centra riquadro
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
                onClick={() => void handleCaptureRaw()}
              >
                {capturing ? "Cattura…" : "Cattura scontrino"}
              </button>
            </div>
          </footer>
        </>
      ) : null}
    </div>
  );

  return createPortal(shell, portalRoot);
}
