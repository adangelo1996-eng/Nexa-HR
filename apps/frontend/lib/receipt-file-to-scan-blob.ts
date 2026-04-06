import {
  compressImageFileToJpegBlob,
  RECEIPT_CAPTURE_JPEG_QUALITY,
  RECEIPT_CAPTURE_MAX_EDGE
} from "@/lib/receipt-image-compress";
import { pdfFileFirstPageToJpegBlob } from "@/lib/receipt-pdf-first-page-jpeg";

function isPdf(file: File): boolean {
  const n = file.name.toLowerCase();
  return file.type === "application/pdf" || n.endsWith(".pdf");
}

function isRasterImage(file: File): boolean {
  return file.type.startsWith("image/");
}

/** Un file da archivio → blob JPEG per sessione scanner / ritaglio (stessi limiti della camera). */
export async function receiptFileToScanJpegBlob(file: File): Promise<Blob> {
  if (isPdf(file)) {
    return pdfFileFirstPageToJpegBlob(file);
  }
  if (isRasterImage(file)) {
    return compressImageFileToJpegBlob(file, RECEIPT_CAPTURE_MAX_EDGE, RECEIPT_CAPTURE_JPEG_QUALITY);
  }
  throw new Error("Formato non supportato: usa PDF, JPEG, PNG, WebP o HEIC (se il browser lo legge).");
}
