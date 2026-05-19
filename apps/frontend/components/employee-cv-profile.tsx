"use client";

import type { Route } from "next";
import Link from "next/link";
import type { JSX, ReactNode } from "react";
import { Building2, Mail, Phone, UserCircle, Users } from "lucide-react";
import { EmployeeLink } from "@/components/nexa-entity-links";
import type { EmployeeCvProfileDto } from "@/lib/api";
import type { SessionUser } from "@/lib/auth-session";
import { sessionCanNexaAdmin } from "@/lib/auth-session";

function CvField(props: { label: string; children: ReactNode; className?: string }): JSX.Element {
  return (
    <div
      className={
        "rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-3 py-2 " +
        (props.className ?? "")
      }
    >
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">{props.label}</dt>
      <dd className="mt-0.5 text-sm text-[var(--prom-text)]">{props.children}</dd>
    </div>
  );
}

function formatDateIt(iso?: string | null): string | null {
  if (!iso?.trim()) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(new Date(iso.trim() + "T12:00:00"));
  } catch {
    return iso;
  }
}

function formatEuro(n?: number | null): string | null {
  if (n == null || !Number.isFinite(n)) {
    return null;
  }
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
}

function employmentStateLabel(state?: string): string {
  switch (state) {
    case "hr_onboarding":
      return "In onboarding HR";
    case "offboarding":
      return "In uscita";
    default:
      return "Attivo";
  }
}

function legalCategoryLabel(raw?: string | null): string | null {
  if (!raw?.trim()) {
    return null;
  }
  const map: Record<string, string> = {
    operaio: "Operaio",
    impiegato: "Impiegato",
    quadro: "Quadro",
    dirigente: "Dirigente"
  };
  return map[raw.trim().toLowerCase()] ?? raw;
}

function maritalLabel(raw?: string | null): string | null {
  if (!raw?.trim()) {
    return null;
  }
  const map: Record<string, string> = {
    single: "Celibe/nubile",
    married: "Coniugato/a",
    divorced: "Divorziato/a",
    widowed: "Vedovo/a",
    civil_union: "Unione civile"
  };
  return map[raw.trim().toLowerCase()] ?? raw;
}

function CvSection(props: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--prom-muted)]">{props.title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">{props.children}</div>
    </section>
  );
}

export type EmployeeCvProfileProps = {
  profile: EmployeeCvProfileDto;
  viewer: SessionUser | null;
};

export function EmployeeCvProfile(props: EmployeeCvProfileProps): JSX.Element {
  const { profile, viewer } = props;
  const s = profile.subject;
  const hireFmt = formatDateIt(s.hireDate);
  const birthFmt = formatDateIt(s.birthDate);
  const endFmt = formatDateIt(s.contractEndDate);
  const canAdmin = sessionCanNexaAdmin(viewer ?? undefined);

  return (
    <div className="space-y-8">
      <header
        className={
          "relative overflow-hidden rounded-2xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_72%,transparent)] p-6 shadow-[var(--card-shadow)] " +
          (profile.flags.isSelf
            ? "ring-1 ring-[color-mix(in_srgb,var(--prom-gold)_40%,transparent)]"
            : "")
        }
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[color-mix(in_srgb,var(--prom-gold)_12%,transparent)] blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--prom-line)] bg-[var(--prom-surface)] text-[var(--prom-muted)] shadow-sm">
            {profile.profilePhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserCircle className="h-12 w-12 opacity-70" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--prom-muted)]">
              {profile.flags.isSelf ? "Il mio profilo" : "Profilo dipendente"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--prom-text)]">{s.fullName}</h1>
            {profile.roleName ? (
              <p className="mt-1 text-sm text-[var(--prom-muted)]">{profile.roleName}</p>
            ) : null}
            <p className="mt-2 inline-flex items-center gap-2 text-sm text-[var(--prom-muted)]">
              <Mail className="h-4 w-4 shrink-0 opacity-70" />
              <a href={`mailto:${s.email}`} className="break-all text-[var(--prom-gold)] hover:underline">
                {s.email}
              </a>
            </p>
            <p className="mt-2 inline-flex rounded-full border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface)_60%,transparent)] px-3 py-1 text-xs font-medium text-[var(--prom-text)]">
              {employmentStateLabel(s.employmentState)}
            </p>
          </div>
        </div>
      </header>

      <CvSection title="Anagrafica">
        {s.firstName || s.lastName ? (
          <CvField label="Nome e cognome">
            {[s.firstName, s.lastName].filter(Boolean).join(" ") || s.fullName}
          </CvField>
        ) : null}
        {birthFmt ? <CvField label="Data di nascita">{birthFmt}</CvField> : null}
        {profile.flags.canViewPayrollSensitive && s.fiscalCode ? (
          <CvField label="Codice fiscale">{s.fiscalCode}</CvField>
        ) : null}
        {profile.flags.canViewPayrollSensitive && maritalLabel(s.maritalStatus) ? (
          <CvField label="Stato civile">{maritalLabel(s.maritalStatus)}</CvField>
        ) : null}
        {profile.flags.canViewPayrollSensitive && s.dependentsChildren != null ? (
          <CvField label="Figli a carico">{String(s.dependentsChildren)}</CvField>
        ) : null}
        {profile.flags.canViewPayrollSensitive && s.dependentSpouse != null ? (
          <CvField label="Coniuge a carico">{s.dependentSpouse ? "Sì" : "No"}</CvField>
        ) : null}
      </CvSection>

      <CvSection title="Contatti">
        {s.phone ? (
          <CvField label="Telefono">
            <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1.5 hover:underline">
              <Phone className="h-3.5 w-3.5 opacity-70" />
              {s.phone}
            </a>
          </CvField>
        ) : null}
        <CvField label="Email">
          <a href={`mailto:${s.email}`} className="break-all text-[var(--prom-gold)] hover:underline">
            {s.email}
          </a>
        </CvField>
        {profile.flags.canViewPayrollSensitive && s.address ? (
          <CvField label="Indirizzo" className="sm:col-span-2">
            {s.address}
          </CvField>
        ) : null}
      </CvSection>

      <CvSection title="Ruolo e organizzazione">
        {profile.roleName ? <CvField label="Ruolo organizzativo">{profile.roleName}</CvField> : null}
        {profile.costCenter ? (
          <CvField label="Sede / centro di costo">
            <span className="inline-flex items-start gap-1.5">
              <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
              <span>
                {profile.costCenter.code} — {profile.costCenter.name}
              </span>
            </span>
          </CvField>
        ) : null}
        {profile.team ? (
          <CvField label="Team">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 opacity-70" />
              {profile.team.name}
            </span>
          </CvField>
        ) : null}
        {profile.manager ? (
          <CvField label="Responsabile">
            <EmployeeLink
              userId={profile.manager.id}
              label={profile.manager.fullName}
              viewer={viewer}
              className="font-medium text-[var(--prom-gold)] hover:underline"
            />
          </CvField>
        ) : null}
      </CvSection>

      <CvSection title="Contratto e date">
        {s.contractType ? <CvField label="Tipologia contratto">{s.contractType}</CvField> : null}
        {legalCategoryLabel(s.legalCategory) ? (
          <CvField label="Categoria">{legalCategoryLabel(s.legalCategory)}</CvField>
        ) : null}
        {s.weeklyContractHours != null ? (
          <CvField label="Ore settimanali">{s.weeklyContractHours} h</CvField>
        ) : null}
        {s.partTimeModality ? <CvField label="Part-time">{s.partTimeModality}</CvField> : null}
        {s.contractFixedTerm != null ? (
          <CvField label="Tempo determinato">{s.contractFixedTerm ? "Sì" : "No"}</CvField>
        ) : null}
        {hireFmt ? <CvField label="Data assunzione">{hireFmt}</CvField> : null}
        {endFmt ? <CvField label="Fine contratto">{endFmt}</CvField> : null}
        {s.vacationAllowanceDays != null ? (
          <CvField label="Ferie annue">{s.vacationAllowanceDays} giorni</CvField>
        ) : null}
        {profile.companyCcnl ? (
          <CvField label="CCNL aziendale" className="sm:col-span-2">
            {profile.companyCcnl}
          </CvField>
        ) : null}
        {s.ccnlCode || s.ccnlLevel ? (
          <CvField label="CCNL / livello">
            {[s.ccnlCode, s.ccnlLevel].filter(Boolean).join(" · ") || "—"}
          </CvField>
        ) : null}
      </CvSection>

      {profile.flags.canViewPayrollSensitive &&
      (s.taxRegion || s.taxMunicipalityIt || s.taxDomicileMunicipalityIt) ? (
        <CvSection title="Domicilio fiscale">
          {s.taxRegion ? <CvField label="Regione">{s.taxRegion}</CvField> : null}
          {s.taxMunicipalityIt ? <CvField label="Comune residenza">{s.taxMunicipalityIt}</CvField> : null}
          {s.taxDomicileMunicipalityIt ? (
            <CvField label="Comune domicilio fiscale">{s.taxDomicileMunicipalityIt}</CvField>
          ) : null}
        </CvSection>
      ) : null}

      {profile.flags.canViewEconomic ? (
        <CvSection title="Retribuzione">
          {formatEuro(s.annualGrossSalary) ? (
            <CvField label="RAL annua lorda">{formatEuro(s.annualGrossSalary)}</CvField>
          ) : null}
          {formatEuro(s.baseSalaryMonthly) ? (
            <CvField label="Retribuzione base mensile">{formatEuro(s.baseSalaryMonthly)}</CvField>
          ) : null}
          {s.payMonthsPerYear != null ? (
            <CvField label="Mensilità">{String(s.payMonthsPerYear)}</CvField>
          ) : null}
          {formatEuro(s.fixedSupplementMonthly) ? (
            <CvField label="Supplemento fisso mensile">{formatEuro(s.fixedSupplementMonthly)}</CvField>
          ) : null}
          {formatEuro(s.fringeBenefitYtdEuros) ? (
            <CvField label="Fringe benefit (YTD)">{formatEuro(s.fringeBenefitYtdEuros)}</CvField>
          ) : null}
        </CvSection>
      ) : null}

      {profile.flags.canViewPayrollSensitive && (s.iban || s.bankName) ? (
        <CvSection title="Coordinate bancarie">
          {s.accountHolder ? <CvField label="Intestatario">{s.accountHolder}</CvField> : null}
          {s.iban ? <CvField label="IBAN">{s.iban}</CvField> : null}
          {s.bankName ? <CvField label="Banca">{s.bankName}</CvField> : null}
          {s.bicSwift ? <CvField label="BIC/SWIFT">{s.bicSwift}</CvField> : null}
        </CvSection>
      ) : null}

      {profile.skills.length > 0 ? (
        <CvSection title="Competenze">
          {profile.skills.map((sk) => (
            <CvField key={sk.code} label={sk.name}>
              <span className="tabular-nums">
                Livello {sk.level}
                <span className="ml-2 text-xs text-[var(--prom-muted)]">({sk.code})</span>
              </span>
            </CvField>
          ))}
        </CvSection>
      ) : null}

      <footer className="flex flex-wrap items-center gap-3 border-t border-[var(--prom-line)] pt-6 text-xs text-[var(--prom-muted)]">
        {profile.flags.isSelf ? (
          <Link
            href={"/settings" as Route}
            className="inline-flex items-center justify-center rounded-xl border border-[var(--prom-gold)] bg-[color-mix(in_srgb,var(--prom-gold)_12%,transparent)] px-4 py-2 text-sm font-medium text-[var(--prom-text)] transition hover:bg-[color-mix(in_srgb,var(--prom-gold)_20%,transparent)]"
          >
            Impostazioni e aggiornamenti
          </Link>
        ) : null}
        {profile.flags.canEditInAdmin && canAdmin ? (
          <Link
            href={"/admin" as Route}
            className="text-[var(--prom-gold)] underline-offset-2 hover:underline"
          >
            Modifica in console utenti
          </Link>
        ) : null}
        {!profile.flags.canViewEconomic && !profile.flags.isSelf ? (
          <p className="max-w-prose leading-relaxed">
            Dati retributivi (RAL, bonus) visibili solo a HR autorizzato o al titolare del profilo.
          </p>
        ) : null}
      </footer>
    </div>
  );
}
