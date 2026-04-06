"use client";

import { useCallback, useState } from "react";
import { ReceiptStillQuadEditor } from "@/components/receipt-still-quad-editor";

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
  const [busy, setBusy] = useState(false);

  const handleConfirm = useCallback(
    async (blob: Blob): Promise<void> => {
      setBusy(true);
      try {
        const base64 = await blobToBase64(blob);
        onConfirm({ base64, mime: "image/jpeg" });
        onClose();
      } finally {
        setBusy(false);
      }
    },
    [onConfirm, onClose]
  );

  if (!open || !imageSrc) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
      <div className={busy ? "pointer-events-none opacity-80" : ""}>
        <ReceiptStillQuadEditor
          imageSrc={imageSrc}
          onCancel={onClose}
          onConfirm={(blob) => void handleConfirm(blob)}
        />
      </div>
    </div>
  );
}
