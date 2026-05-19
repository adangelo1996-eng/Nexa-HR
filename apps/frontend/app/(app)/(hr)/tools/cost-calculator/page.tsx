import { redirect } from "next/navigation";

/** Percorso storico: reindirizza al simulatore assunzione sotto budget personale. */
export default function CostCalculatorLegacyRedirectPage(): never {
  redirect("/personnel-budget/simulatore-assunzione");
}
