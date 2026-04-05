/**
 * Carica OpenCV.js da CDN (runtime WebAssembly). ~8 MB, una tantum per sessione.
 * Documentazione: https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html
 *
 * Nota: in molte build `onRuntimeInitialized` è inizialmente null; va sempre agganciato
 * un listener (non solo fare poll quando è truthy), altrimenti l'inizializzazione WASM non completa mai.
 */

declare global {
  interface Window {
    cv?: OpenCvRuntime;
  }
}

/** Tipi minimi per il flusso document detection (evita dipendenza @types). */
export type OpenCvRuntime = {
  onRuntimeInitialized?: (() => void) | null;
  Mat: new () => OpenCvMat;
  MatVector: new () => OpenCvMatVector;
  matFromArray: (rows: number, cols: number, type: number, arr: number[]) => OpenCvMat;
  imread: (canvas: HTMLCanvasElement) => OpenCvMat;
  cvtColor: (src: OpenCvMat, dst: OpenCvMat, code: number) => void;
  GaussianBlur: (
    src: OpenCvMat,
    dst: OpenCvMat,
    ksize: { width: number; height: number },
    sigmaX: number,
    sigmaY: number,
    borderType: number
  ) => void;
  Canny: (src: OpenCvMat, dst: OpenCvMat, t1: number, t2: number) => void;
  findContours: (
    src: OpenCvMat,
    contours: OpenCvMatVector,
    hierarchy: OpenCvMat,
    mode: number,
    method: number
  ) => void;
  contourArea: (contour: OpenCvMat) => number;
  arcLength: (curve: OpenCvMat, closed: boolean) => number;
  approxPolyDP: (curve: OpenCvMat, approx: OpenCvMat, epsilon: number, closed: boolean) => void;
  isContourConvex: (contour: OpenCvMat) => boolean;
  getPerspectiveTransform: (src: OpenCvMat, dst: OpenCvMat) => OpenCvMat;
  warpPerspective: (
    src: OpenCvMat,
    dst: OpenCvMat,
    m: OpenCvMat,
    dsize: { width: number; height: number },
    flags: number,
    borderMode: number,
    borderValue: unknown
  ) => void;
  Size: new (w: number, h: number) => { width: number; height: number };
  Scalar: new (v0: number, v1: number, v2: number, v3: number) => unknown;
  COLOR_RGBA2GRAY: number;
  RETR_LIST: number;
  /** Contorni esterni soltanto — molto meno lavoro di RETR_LIST per findContours. */
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  CV_32FC2: number;
  INTER_LINEAR: number;
  BORDER_CONSTANT: number;
  BORDER_DEFAULT: number;
  imshow: (canvasId: string, mat: OpenCvMat) => void;
};

type OpenCvMat = {
  rows: number;
  cols: number;
  data32S?: Int32Array;
  data32F?: Float32Array;
  delete: () => void;
  clone: () => OpenCvMat;
};

type OpenCvMatVector = {
  size: () => number;
  get: (i: number) => OpenCvMat;
  delete: () => void;
};

/** CDN ufficiale; per reti restrittive si può copiare `opencv.js` (e WASM) in `public/vendor/opencv/` e puntare qui a `/vendor/opencv/opencv.js`. */
const OPENCV_SRC = "https://docs.opencv.org/4.8.0/opencv.js";
const WASM_INIT_TIMEOUT_MS = 90_000;

let loadPromise: Promise<OpenCvRuntime> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const SCRIPT_LOAD_TIMEOUT_MS = 35_000;

function injectOpenCvScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.dataset.opencv = "1";
    script.src = OPENCV_SRC;
    const tid = window.setTimeout(() => {
      script.onload = null;
      script.onerror = null;
      reject(new Error("Timeout caricamento script OpenCV (rete lenta o blocco)"));
    }, SCRIPT_LOAD_TIMEOUT_MS);
    script.onload = (): void => {
      window.clearTimeout(tid);
      resolve();
    };
    script.onerror = (): void => {
      window.clearTimeout(tid);
      reject(new Error("Impossibile caricare OpenCV.js (rete o blocco script)"));
    };
    document.head.appendChild(script);
  });
}

/**
 * Attende che `cv.imread` sia utilizzabile (dopo init WASM), con timeout.
 */
function waitForOpenCvImread(cv: OpenCvRuntime, deadlineMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + deadlineMs;

    const tryResolve = (): void => {
      if (typeof cv.imread === "function") {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error("OpenCV: timeout inizializzazione WASM"));
        return;
      }
      setTimeout(tryResolve, 50);
    };

    if (typeof cv.imread === "function") {
      resolve();
      return;
    }

    const prev = cv.onRuntimeInitialized;
    cv.onRuntimeInitialized = () => {
      try {
        if (typeof prev === "function") {
          prev.call(cv);
        }
      } catch {
        /* ignore third-party callback errors */
      }
      tryResolve();
    };

    tryResolve();
  });
}

async function loadOpenCvInternal(): Promise<OpenCvRuntime> {
  const w = window;
  if (w.cv && typeof w.cv.imread === "function") {
    return w.cv as OpenCvRuntime;
  }

  const existing = document.querySelector<HTMLScriptElement>('script[data-opencv="1"]');
  if (!existing) {
    await injectOpenCvScript();
  }

  const scriptDeadline = Date.now() + 15_000;
  while (!w.cv && Date.now() < scriptDeadline) {
    await sleep(30);
  }
  if (!w.cv) {
    throw new Error("OpenCV: oggetto globale cv non trovato dopo il caricamento dello script");
  }

  const cv = w.cv as OpenCvRuntime;
  await waitForOpenCvImread(cv, WASM_INIT_TIMEOUT_MS);

  if (typeof cv.imread !== "function") {
    throw new Error("OpenCV: imread non disponibile dopo l'inizializzazione");
  }
  return cv;
}

export function loadOpenCv(): Promise<OpenCvRuntime> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OpenCV solo in browser"));
  }
  if (loadPromise) {
    return loadPromise;
  }
  loadPromise = loadOpenCvInternal().catch((err: unknown) => {
    loadPromise = null;
    throw err;
  });
  return loadPromise;
}
