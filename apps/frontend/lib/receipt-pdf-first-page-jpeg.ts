/**
 * Prima pagina PDF → JPEG compresso (backend accetta solo immagini).
 * Worker pdf.js da CDN allineato alla versione del pacchetto.
 */

import { compressCanvasToJpegBlob, RECEIPT_CAPTURE_JPEG_QUALITY, RECEIPT_CAPTURE_MAX_EDGE } from "@/lib/receipt-image-compress";

let workerSrcSet = false;

export async function pdfFileFirstPageToJpegBlob(file: File): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist");
  if (!workerSrcSet && typeof window !== "undefined") {
    const v =
      typeof (pdfjs as { version?: string }).version === "string"
        ? (pdfjs as { version: string }).version
        : "5.6.205";
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${v}/build/pdf.worker.min.mjs`;
    workerSrcSet = true;
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data, useSystemFonts: true });
  const pdf = await task.promise;
  if (pdf.numPages < 1) {
    throw new Error("PDF senza pagine");
  }
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const maxEdge = RECEIPT_CAPTURE_MAX_EDGE * 1.25;
  const scale = Math.min(maxEdge / Math.max(base.width, base.height), 4);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas non disponibile");
  }
  const renderTask = page.render({ canvasContext: ctx, viewport, canvas });
  await renderTask.promise;
  const out = await compressCanvasToJpegBlob(canvas, RECEIPT_CAPTURE_MAX_EDGE, RECEIPT_CAPTURE_JPEG_QUALITY);
  if (!out) {
    throw new Error("Compressione JPEG fallita");
  }
  return out;
}
