"use client";

import { useRouter } from "next/navigation";
import { ReceiptLiveScanner } from "@/components/receipt-live-scanner";
import { blobToBase64, writeExpenseLiveScanToSession } from "@/lib/expense-scan-session";

export default function ExpenseReceiptScanPage(): React.JSX.Element {
  const router = useRouter();

  return (
    <ReceiptLiveScanner
      open
      variant="page"
      onClose={() => {
        router.replace("/expenses");
      }}
      onCapture={async (blob) => {
        const b64 = await blobToBase64(blob);
        writeExpenseLiveScanToSession({ base64: b64, mime: "image/jpeg" });
      }}
    />
  );
}
