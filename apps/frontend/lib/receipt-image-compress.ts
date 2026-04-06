/** Limiti qualità/dimensione per foto scontrino (camera, upload, export ritaglio). */

export const RECEIPT_CAPTURE_MAX_EDGE = 1280;
export const RECEIPT_CAPTURE_JPEG_QUALITY = 0.82;

export const RECEIPT_EXPORT_MAX_EDGE = 1024;
export const RECEIPT_EXPORT_JPEG_QUALITY = 0.78;

export async function compressCanvasToJpegBlob(
  source: HTMLCanvasElement,
  maxEdge: number,
  quality: number
): Promise<Blob | null> {
  const w = source.width;
  const h = source.height;
  if (w < 1 || h < 1) {
    return null;
  }
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const out = document.createElement("canvas");
  out.width = tw;
  out.height = th;
  const ctx = out.getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.drawImage(source, 0, 0, tw, th);
  return new Promise((resolve) => {
    out.toBlob((b) => resolve(b), "image/jpeg", quality);
  });
}

/** JPEG compresso da file immagine (stessi limiti della camera). */
export async function compressImageFileToJpegBlob(
  file: File,
  maxEdge: number,
  quality: number
): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  try {
    const w = bmp.width;
    const h = bmp.height;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas non disponibile");
    }
    ctx.drawImage(bmp, 0, 0, tw, th);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    });
    if (!blob) {
      throw new Error("Compressione fallita");
    }
    return blob;
  } finally {
    bmp.close();
  }
}

/** Object URL da liberare con URL.revokeObjectURL quando non serve più. */
export async function compressImageFileToObjectUrl(
  file: File,
  maxEdge: number,
  quality: number
): Promise<string> {
  const blob = await compressImageFileToJpegBlob(file, maxEdge, quality);
  return URL.createObjectURL(blob);
}
