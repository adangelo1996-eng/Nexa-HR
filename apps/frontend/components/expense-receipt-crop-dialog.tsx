"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (e) => reject(e));
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}

async function getCroppedImageBlob(imageSrc: string, pixelCrop: Area, mime: string): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas non disponibile");
  }
  canvas.width = Math.max(1, Math.floor(pixelCrop.width));
  canvas.height = Math.max(1, Math.floor(pixelCrop.height));
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );
  const quality = mime === "image/png" ? undefined : 0.92;
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) {
          resolve(b);
        } else {
          reject(new Error("Esportazione immagine fallita"));
        }
      },
      mime,
      quality
    );
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(new Error("Lettura file fallita"));
    r.readAsDataURL(blob);
  });
}

export type ExpenseReceiptCropDialogProps = {
  open: boolean;
  imageSrc: string | null;
  onClose: () => void;
  /** Restituisce base64 grezzo (senza prefisso data:) e mime jpeg/png/webp */
  onConfirm: (payload: { base64: string; mime: "image/jpeg" | "image/png" | "image/webp" }) => void;
};

export function ExpenseReceiptCropDialog({
  open,
  imageSrc,
  onClose,
  onConfirm
}: ExpenseReceiptCropDialogProps): React.JSX.Element | null {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_a: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleConfirm(): Promise<void> {
    if (!imageSrc || !croppedAreaPixels) {
      return;
    }
    setBusy(true);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, "image/jpeg");
      const base64 = await blobToBase64(blob);
      onConfirm({ base64, mime: "image/jpeg" });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (!open || !imageSrc) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-3 rounded-xl border border-slate-600 bg-slate-950 p-4 text-slate-100 shadow-xl">
        <div className="text-sm font-medium">Inquadra lo scontrino</div>
        <p className="text-xs text-slate-400">
          Sposta e ridimensiona l&apos;area sul rettangolo dello scontrino. Lo zoom aiuta a escludere lo sfondo.
        </p>
        <div className="relative h-64 w-full overflow-hidden rounded-lg bg-slate-900 md:h-80">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={undefined}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            showGrid
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800"
            onClick={onClose}
            disabled={busy}
          >
            Annulla
          </button>
          <button
            type="button"
            className="rounded-lg bg-amber-500/90 px-3 py-1.5 text-sm font-medium text-slate-900 disabled:opacity-50"
            onClick={() => void handleConfirm()}
            disabled={busy || !croppedAreaPixels}
          >
            {busy ? "Elaborazione…" : "Usa questa scansione"}
          </button>
        </div>
      </div>
    </div>
  );
}
