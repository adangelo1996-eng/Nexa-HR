"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type JSX, type ReactNode } from "react";
import { X } from "lucide-react";
import { CostCenterLink, EmployeeLink } from "@/components/nexa-entity-links";
import { HrOffboardStartAction } from "@/components/hr-offboard-start-action";
import { Button } from "@/components/ui/button";
import { fetchUsers, type User } from "@/lib/api";
import { getSessionUser, getToken, type SessionUser } from "@/lib/auth-session";

export type EmployeeDrawerSubject = {
  userId: string;
  fullName: string;
  email?: string | null;
  roleName?: string | null;
  costCenterId?: string | null;
  costCenterName?: string | null;
  teamName?: string | null;
};

type EmployeeSideDrawerProps = {
  subject: EmployeeDrawerSubject | null;
  onClose: () => void;
  viewer?: SessionUser | null;
};

function DrawerField(props: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="rounded-xl border border-[var(--prom-line)] bg-[color-mix(in_srgb,var(--prom-surface-soft)_88%,transparent)] px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--prom-muted)]">{props.label}</dt>
      <dd className="mt-0.5 text-[var(--prom-text)]">{props.children}</dd>
    </div>
  );
}

export function EmployeeSideDrawer(props: EmployeeSideDrawerProps): JSX.Element | null {
  const { subject, onClose, viewer: viewerProp } = props;
  const viewer = viewerProp ?? getSessionUser();
  const isSelf = Boolean(viewer?.id && subject?.userId === viewer.id);

  useEffect(() => {
    if (!subject) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [subject, onClose]);

  if (!subject) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-[2px] transition-opacity"
        aria-label="Chiudi pannello"
        onClick={onClose}
      />
      <aside
        className={
          "fixed bottom-0 right-0 top-0 z-[210] flex w-[min(100vw,400px)] flex-col overflow-y-auto border-l bg-[var(--prom-surface)] p-5 pb-24 pt-20 shadow-[var(--card-shadow)] transition-transform sm:pt-16 " +
          (isSelf
            ? "border-[var(--prom-gold)] ring-2 ring-[color-mix(in_srgb,var(--prom-gold)_35%,transparent)]"
            : "border-[var(--prom-line)]")
        }
        role="dialog"
        aria-modal="true"
        aria-label={`Scheda ${subject.fullName}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight text-[var(--prom-text)]">
              <EmployeeLink
                userId={subject.userId}
                label={subject.fullName}
                viewer={viewer}
                className="text-[var(--prom-text)] hover:text-[var(--prom-gold)] hover:underline"
              />
            </h2>
            {subject.roleName ? <p className="mt-1 text-sm text-[var(--prom-muted)]">{subject.roleName}</p> : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5 rounded-full border-[var(--prom-line-strong)] px-3"
            onClick={onClose}
            aria-label="Chiudi scheda"
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Chiudi</span>
          </Button>
        </div>

        <DrawerBody subject={subject} viewer={viewer} isSelf={isSelf} onClose={onClose} />
      </aside>
    </>
  );
}

function DrawerBody(props: {
  subject: EmployeeDrawerSubject;
  viewer: SessionUser | null;
  isSelf: boolean;
  onClose: () => void;
}): JSX.Element {
  const { subject, viewer, isSelf, onClose } = props;
  const [detailUser, setDetailUser] = useState<User | null>(null);
  const [usersById, setUsersById] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState(true);

  const loadDetails = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const people = await fetchUsers(token);
      const umap: Record<string, User> = {};
      for (const u of people) {
        umap[u.id] = u;
      }
      setUsersById(umap);
      setDetailUser(umap[subject.userId] ?? null);
    } catch {
      setDetailUser(null);
    } finally {
      setLoading(false);
    }
  }, [subject.userId]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  const managerName = useMemo(() => {
    const mid = detailUser?.managerId;
    if (!mid) return null;
    const m = usersById[mid];
    return m?.fullName ?? m?.email ?? null;
  }, [detailUser?.managerId, usersById]);

  const sedeLabel = subject.costCenterName ?? subject.costCenterId ?? detailUser?.costCenterId;

  const email = subject.email ?? detailUser?.email;

  return (
    <>
      <dl className="mt-6 space-y-3 text-sm">
        {loading ? (
          <p className="text-xs text-[var(--prom-muted)]">Caricamento dettagli…</p>
        ) : null}
        {(sedeLabel || subject.costCenterId || detailUser?.costCenterId) ? (
          <DrawerField label="Sede">
            {subject.costCenterId || detailUser?.costCenterId ? (
              <CostCenterLink
                costCenterId={(subject.costCenterId ?? detailUser?.costCenterId)!}
                label={sedeLabel ?? "—"}
                viewer={viewer}
              />
            ) : (
              sedeLabel
            )}
          </DrawerField>
        ) : null}
        {subject.teamName ? <DrawerField label="Team">{subject.teamName}</DrawerField> : null}
        {email ? (
          <DrawerField label="Email">
            <a href={`mailto:${email}`} className="break-all text-[var(--prom-gold)] hover:underline">
              {email}
            </a>
          </DrawerField>
        ) : null}
        {detailUser?.phone ? (
          <DrawerField label="Telefono">
            <a href={`tel:${detailUser.phone}`} className="text-[var(--prom-text)] hover:underline">
              {detailUser.phone}
            </a>
          </DrawerField>
        ) : null}
        {detailUser?.hireDate ? (
          <DrawerField label="Data assunzione">
            {new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" }).format(
              new Date(detailUser.hireDate + "T12:00:00")
            )}
          </DrawerField>
        ) : null}
        {managerName ? <DrawerField label="Responsabile">{managerName}</DrawerField> : null}
        {detailUser?.contractType ? (
          <DrawerField label="Contratto">
            {detailUser.contractType}
            {detailUser.weeklyContractHours != null ? (
              <p className="mt-1 text-xs text-[var(--prom-muted)]">{detailUser.weeklyContractHours} h/settimana</p>
            ) : null}
          </DrawerField>
        ) : null}
      </dl>

      <Link
        href={`/employee/${encodeURIComponent(subject.userId)}` as Route}
        className="mt-6 inline-flex w-full"
        onClick={onClose}
      >
        <Button type="button" className="w-full">
          Vai al profilo
        </Button>
      </Link>
      {!isSelf && detailUser ? (
        <div className="mt-3 flex justify-center">
          <HrOffboardStartAction
            userId={subject.userId}
            fullName={subject.fullName}
            employmentState={detailUser.employmentState}
            variant="button"
          />
        </div>
      ) : null}
      {isSelf ? (
        <Link
          href={"/settings" as Route}
          className="mt-3 block text-center text-xs font-medium text-[var(--prom-gold)] underline-offset-2 hover:underline"
          onClick={onClose}
        >
          Impostazioni account
        </Link>
      ) : (
        <p className="mt-4 text-xs leading-relaxed text-[var(--prom-muted)]">
          Scheda in sola lettura. Dati retributivi e bancari solo per titolare o HR autorizzato.
        </p>
      )}
    </>
  );
}
