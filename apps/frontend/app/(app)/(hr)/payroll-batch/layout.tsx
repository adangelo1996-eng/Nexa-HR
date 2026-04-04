"use client";

import type React from "react";
import { PayrollCalcAccessGate } from "@/components/payroll-calc-access-gate";

export default function PayrollBatchLayout({
  children
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <PayrollCalcAccessGate>{children}</PayrollCalcAccessGate>;
}
