"use client";

import { useRouter } from "next/navigation";
import { ReceiptLiveScanner } from "@/components/receipt-live-scanner";
import { blobToBase64 } from "@/lib/expense-scan-session";
import { writeExpenseScanRawToIdb } from "@/lib/expense-scan-idb";

export default function ExpenseReceiptScanPage(): React.JSX.Element {
  const router = useRouter();

  return (
    <ReceiptLiveScanner
      open
      variant="page"
      onClose={() => {
        router.replace("/expenses");
      }}
      onSessionComplete={async (blobs) => {
        const framesBase64 = await Promise.all(blobs.map((b) => blobToBase64(b)));
        await writeExpenseScanRawToIdb({ framesBase64, savedAt: new Date().toISOString() });
        router.replace("/expenses/scan/review");
      }}
    />
  );
}
