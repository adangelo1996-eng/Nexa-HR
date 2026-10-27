"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { intakeToApplyInput, TENANT_PACK_CAPABILITIES, type TenantIntakeAnswers, type TenantPack } from "@payday/domain";
import { Button } from "@/components/ui/button";
import { applyTenantPack, fetchCurrentUser } from "@/lib/api";
import { getSessionUser, getToken, sessionCanNexaAdmin } from "@/lib/auth-session";

const SECTORS: Array<{ id: TenantIntakeAnswers["sector"]; label: string }> = [
  { id: "professional_services", label: "Servizi" },
  { id: "retail_commerce", label: "Commercio" },
  { id: "manufacturing", label: "Manifattura" },
  { id: "hospitality", label: "Hospitality" },
  { id: "full_suite", label: "Tutto" }
];

const HEADS: Array<{ id: TenantIntakeAnswers["headcount"]; label: string }> = [
  { id: "up_to_30", label: "Fino a 30" },
  { id: "up_to_150", label: "Fino a 150" },
  { id: "over_150", label: "Oltre 150" }
];

const PHRASE: Record<string, string> = {
  "nexa.people": "L'anagrafica è pronta.",
  "nexa.attendance": "Segni entrate e uscite.",
  "nexa.leaves": "Approvi le ferie in due tap.",
  "nexa.payslips": "I cedolini arrivano in app.",
  "nexa.payroll": "Gli stipendi restano in app.",
  "nexa.scheduling": "Pubblichi i turni della settimana.",
  "nexa.expenses": "Rimborsi senza fogli sparsi.",
  "nexa.recruiting": "Segui chi entra.",
  "nexa.lifecycle": "Segui chi esce.",
  "nexa.smartworking": "Vedi chi lavora da casa."
};

type Draft = Partial<TenantIntakeAnswers>;

export default function IniziaPage() {
  const router = useRouter();
  const session = getSessionUser();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pack, setPack] = useState<TenantPack | null>(null);

  if (session && !sessionCanNexaAdmin(session)) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-[1.75rem] font-semibold text-[#1c1c1e] dark:text-white">Ci pensa l&apos;admin</h1>
        <p className="mt-2 text-[15px] text-[#6e6e73] dark:text-[#b4c9dc]">Tu entri e lavori. La preparazione azienda non è su questo account.</p>
        <Button className="mt-6" type="button" onClick={() => router.replace("/")}>
          Entra
        </Button>
      </main>
    );
  }

  const questions = [
    {
      title: "Che lavoro fate?",
      lead: "Scegli il settore. Il resto si accende da solo.",
      body: (
        <div className="grid gap-2">
          {SECTORS.map((s) => (
            <Button
              key={s.id}
              type="button"
              variant={draft.sector === s.id ? "primary" : "secondary"}
              onClick={() => {
                setDraft((d) => ({ ...d, sector: s.id }));
                setStep(1);
              }}
            >
              {s.label}
            </Button>
          ))}
        </div>
      )
    },
    {
      title: "Quante persone?",
      lead: "Serve solo per il tetto anagrafiche.",
      body: (
        <div className="grid gap-2">
          {HEADS.map((s) => (
            <Button
              key={s.id}
              type="button"
              variant={draft.headcount === s.id ? "primary" : "secondary"}
              onClick={() => {
                setDraft((d) => ({ ...d, headcount: s.id }));
                setStep(2);
              }}
            >
              {s.label}
            </Button>
          ))}
        </div>
      )
    },
    yesNo("Gestite i turni?", "Se no, i turni restano spenti.", "shifts", 3),
    yesNo("Cedolini in app?", "Stipendi e cedolini, insieme.", "payslips", 4),
    yesNo("Note spese?", "Rimborsi dentro l'app.", "expenses", 5),
    yesNo("Assunzioni e uscite?", "Chi entra e chi esce, nello stesso posto.", "hiring", 6),
    yesNo("Lavoro da remoto?", "Vedi chi non è in sede.", "remote", 7),
    {
      title: "Chi approva le ferie?",
      lead: "Una sola risposta. Si cambia dopo, se serve.",
      body: (
        <div className="grid gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void finish("manager")}>
            Il responsabile
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void finish("hr")}>
            HR
          </Button>
        </div>
      )
    }
  ];

  function yesNo(title: string, lead: string, key: "shifts" | "payslips" | "expenses" | "hiring" | "remote", next: number) {
    return {
      title,
      lead,
      body: (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setDraft((d) => ({ ...d, [key]: true }));
              setStep(next);
            }}
          >
            Sì
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setDraft((d) => ({ ...d, [key]: false }));
              setStep(next);
            }}
          >
            No
          </Button>
        </div>
      )
    };
  }

  async function finish(leaveApprover: "manager" | "hr"): Promise<void> {
    const token = getToken();
    const answers = { ...draft, leaveApprover } as TenantIntakeAnswers;
    if (!token || !answers.sector || !answers.headcount) {
      setError("Manca una risposta. Torna indietro e completala.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const input = intakeToApplyInput(answers);
      const saved = await applyTenantPack(token, {
        templateId: input.templateId,
        modules: input.overlay?.modules,
        limits: input.overlay?.limits,
        workflows: input.overlay?.workflows
      });
      await fetchCurrentUser(token, { fresh: true });
      setPack(saved.pack);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Non sono riuscito a preparare l'azienda.");
    } finally {
      setBusy(false);
    }
  }

  if (pack) {
    const on = TENANT_PACK_CAPABILITIES.filter((cap) => cap.product === "nexa_hr" && pack.modules[cap.id] === true);
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <p className="text-[13px] font-medium text-[#6e6e73] dark:text-[#b4c9dc]">{pack.sectorLabelIt}</p>
        <h1 className="mt-1 text-[1.75rem] font-semibold tracking-tight text-[#1c1c1e] dark:text-white">Ecco cosa è acceso</h1>
        <ul className="mt-6 divide-y divide-[var(--prom-line)] overflow-hidden rounded-2xl border border-[var(--prom-line)] bg-white dark:bg-[#052642]">
          {on.map((line) => (
            <li key={line.id} className="px-4 py-3">
              <p className="text-[15px] text-[#1c1c1e] dark:text-white">{line.labelIt}</p>
              <p className="text-[13px] text-[#6e6e73] dark:text-[#b4c9dc]">{PHRASE[line.id] ?? line.descriptionIt}</p>
            </li>
          ))}
        </ul>
        <Button className="mt-6 w-full" type="button" onClick={() => router.replace("/")}>
          Entra
        </Button>
      </main>
    );
  }

  const q = questions[step] ?? questions[0];
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center px-6 py-16">
      <p className="text-[13px] text-[#6e6e73] dark:text-[#b4c9dc]">
        {step + 1} di {questions.length}
      </p>
      <h1 className="mt-2 text-[1.75rem] font-semibold tracking-tight text-[#1c1c1e] dark:text-white">{q.title}</h1>
      <p className="mt-2 mb-6 text-[15px] text-[#6e6e73] dark:text-[#b4c9dc]">{q.lead}</p>
      {q.body}
      {error ? <p className="mt-4 text-[13px] text-rose-700">{error}</p> : null}
      {step > 0 ? (
        <button type="button" className="mt-6 text-left text-[15px] text-[#002D72] dark:text-[#6eb0e0]" onClick={() => setStep((n) => Math.max(0, n - 1))}>
          Indietro
        </button>
      ) : null}
    </main>
  );
}
