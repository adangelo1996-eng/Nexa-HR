/**
 * Ritaglio scontrino con OpenCV (quadrilatero + prospettiva). Usato da scanner live e editor su foto ferma.
 */

import { loadOpenCv, type OpenCvRuntime } from "@/lib/opencv-loader";

export type Point = { x: number; y: number };

export const MIN_CAPTURE_BLOB_BYTES = 900;
export const CV_SNAPSHOT_PROC_MAX_DESKTOP = 280;
export const CV_SNAPSHOT_PROC_MAX_TOUCH = 220;
const CV_MAX_CONTOURS_TO_SCAN = 36;

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      }
    );
  });
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

export function findReceiptQuadFromSource(
  cv: OpenCvRuntime,
  source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement,
  procW: number,
  procH: number
): Point[] | null {
  const canvas = document.createElement("canvas");
  canvas.width = procW;
  canvas.height = procH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  if (source instanceof HTMLVideoElement) {
    if (source.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || source.videoWidth < 32) {
      return null;
    }
  } else if (source instanceof HTMLImageElement) {
    if (source.naturalWidth < 32) {
      return null;
    }
  } else if (source.width < 32 || source.height < 32) {
    return null;
  }
  ctx.drawImage(source, 0, 0, procW, procH);

  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const ksize = new cv.Size(3, 3);
    cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(blurred, edges, 48, 128);

    const frameArea = procW * procH;
    const minA = frameArea * 0.045;
    const maxA = frameArea * 0.92;

    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let best: Point[] | null = null;
    let bestArea = 0;

    const total = contours.size();
    const cap = Math.min(total, CV_MAX_CONTOURS_TO_SCAN);
    for (let i = 0; i < cap; i++) {
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

export function mapProcToVideo(pts: Point[], vw: number, vh: number, procW: number, procH: number): Point[] {
  const sx = vw / procW;
  const sy = vh / procH;
  return pts.map((p) => ({ x: p.x * sx, y: p.y * sy }));
}

export function fallbackCenterQuad(vw: number, vh: number, margin = 0.08): Point[] {
  const mx = vw * margin;
  const my = vh * margin;
  return [
    { x: mx, y: my },
    { x: vw - mx, y: my },
    { x: vw - mx, y: vh - my },
    { x: mx, y: vh - my }
  ];
}

export function warpQuadToBlob(
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

export type CropQuadExportOpts = {
  /** Lato lungo massimo dell’output (px). */
  maxEdge?: number;
  /** Qualità JPEG 0–1. */
  quality?: number;
};

export function cropQuadBoundingBoxToJpeg(
  sourceCanvas: HTMLCanvasElement,
  quad: Point[],
  opts?: CropQuadExportOpts
): Promise<Blob> {
  const maxEdge = opts?.maxEdge ?? 1024;
  const quality = opts?.quality ?? 0.78;
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
  const longSide = Math.max(w, h);
  const scale = Math.min(1, maxEdge / longSide);
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));
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
      quality
    );
  });
}

export async function loadOpenCvWithTimeout(): Promise<OpenCvRuntime | null> {
  try {
    return await withTimeout(loadOpenCv(), 60_000, "OpenCV: timeout");
  } catch {
    return null;
  }
}
