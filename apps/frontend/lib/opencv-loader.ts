/**
 * Carica OpenCV.js da CDN (runtime WebAssembly). ~8 MB, una tantum per sessione.
 * Documentazione: https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html
 */

declare global {
  interface Window {
    cv?: OpenCvRuntime;
  }
}

/** Tipi minimi per il flusso document detection (evita dipendenza @types). */
export type OpenCvRuntime = {
  onRuntimeInitialized?: () => void;
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

const OPENCV_SRC = "https://docs.opencv.org/4.8.0/opencv.js";

let loadPromise: Promise<OpenCvRuntime> | null = null;

export function loadOpenCv(): Promise<OpenCvRuntime> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OpenCV solo in browser"));
  }
  if (loadPromise) {
    return loadPromise;
  }
  loadPromise = new Promise((resolve, reject) => {
    const w = window;
    if (w.cv && typeof w.cv.imread === "function") {
      resolve(w.cv as OpenCvRuntime);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[data-opencv="1"]`);
    if (existing) {
      const check = (): void => {
        const cv = w.cv;
        if (cv && typeof cv.imread === "function") {
          resolve(cv as OpenCvRuntime);
        } else if (cv?.onRuntimeInitialized) {
          const prev = cv.onRuntimeInitialized;
          cv.onRuntimeInitialized = () => {
            prev?.();
            resolve(cv as OpenCvRuntime);
          };
        } else {
          setTimeout(check, 50);
        }
      };
      check();
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.dataset.opencv = "1";
    script.src = OPENCV_SRC;
    script.onload = () => {
      const cv = w.cv;
      if (!cv) {
        reject(new Error("OpenCV: global cv mancante"));
        return;
      }
      if (typeof cv.imread === "function") {
        resolve(cv as OpenCvRuntime);
        return;
      }
      cv.onRuntimeInitialized = () => {
        resolve(cv as OpenCvRuntime);
      };
    };
    script.onerror = () => reject(new Error("Impossibile caricare OpenCV.js"));
    document.body.appendChild(script);
  });
  return loadPromise;
}
