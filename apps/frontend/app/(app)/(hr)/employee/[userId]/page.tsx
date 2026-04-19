"use client";

import type { Route } from "next";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, Mail, UserCircle, Users } from "lucide-react";
import { EmployeeRecapAccessGate } from "@/components/employee-recap-access-gate";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import {
  fetchAdminCostCenters,
  fetchAdminRoles,
  fetchAdminWorkTeams,
  fetchCurrentUser,
  fetchThirdPartyAssignmentsForUser,
  fetchThirdPartyLicenses,
  fetchUserProfilePhotoUrl,
  fetchUsers,
  updateUser,
  type CostCenter,
  type Role,
  type ThirdPartyLicenseDto,
  type User,
  type WorkTeamDto
} from "@/lib/api";
import {
  clearSession,
  getToken,
  sessionCanEditEmployeeAdminFields,
  sessionCanNexaAdmin,
  shouldClearSessionOnUnauthorizedApiError,
  type SessionUser
} from "@/lib/auth-session";
import { displayUserCatalogRole } from "@/lib/role-display";
import { AdminUserEditPanel, type AdminUserEditTab } from "../../admin/admin-user-edit-panel";

function mapOrgRoleToAccess(roleName: string | undefined): User["role"] | undefined {
  const n = (roleName ?? "").trim().toLowerCase();
  if (n === "admin" || n === "superuser") {
    return "superuser";
  }
  if (n === "employee" || n === "user") {
    return "user";
  }
  return undefined;
}

export default function EmployeeRecapPage(): React.JSX.Element {
  return (
    <EmployeeRecapAccessGate>
      <EmployeeRecapBody />
    </EmployeeRecapAccessGate>
  );
}

function EmployeeRecapBody(): React.JSX.Element {
  const params = useParams();
  const router = useRouter();
  const userId = typeof params.userId === "string" ? params.userId : "";

  const [token, setToken] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [teamsNested, setTeamsNested] = useState<Array<{ cc: CostCenter; teams: WorkTeamDto[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [editUserTab, setEditUserTab] = useState<AdminUserEditTab>("anagrafica");
  const [tpLicenses, setTpLicenses] = useState<ThirdPartyLicenseDto[]>([]);
  const [tpDraft, setTpDraft] = useState<
    Record<string, { enabled: boolean; status: "active" | "inactive"; assignedAt: string; notes: string }>
  >({});
  const [tpLoading, setTpLoading] = useState(false);
  const [tpSaving, setTpSaving] = useState(false);
  const [tpMessage, setTpMessage] = useState<string | null>(null);

  const canEdit = sessionCanEditEmployeeAdminFields(sessionUser ?? undefined);
  const canLinkAdminCc = sessionCanNexaAdmin(sessionUser ?? undefined);

  const selectedUser = users.find((u) => u.id === userId) ?? null;

  const teamsNestedForTable = useMemo(() => {
    if (teamsNested.length > 0) {
      return teamsNested;
    }
    return [...costCenters]
      .sort((a, b) => a.name.localeCompare(b.name, "it"))
      .map((cc) => ({ cc, teams: [] as WorkTeamDto[] }));
  }, [teamsNested, costCenters]);

  const teamsForSelectedCc = useMemo(() => {
    if (!selectedUser?.costCenterId) {
      return [];
    }
    return teamsNestedForTable.find((x) => x.cc.id === selectedUser.costCenterId)?.teams ?? [];
  }, [teamsNestedForTable, selectedUser?.costCenterId]);

  const costCenter = selectedUser?.costCenterId
    ? costCenters.find((c) => c.id === selectedUser.costCenterId) ?? null
    : null;
  const team =
    selectedUser?.teamId && teamsForSelectedCc.length
      ? teamsForSelectedCc.find((t) => t.id === selectedUser.teamId) ?? null
      : null;
  const manager = selectedUser?.managerId ? users.find((u) => u.id === selectedUser.managerId) ?? null : null;

  const selectedRoleName = selectedUser ? displayUserCatalogRole(selectedUser, roles) : "";

  const updateSelectedUser = useCallback(
    (patch: Partial<User>): void => {
      if (!selectedUser) {
        return;
      }
      setUsers((current) => current.map((item) => (item.id === selectedUser.id ? { ...item, ...patch } : item)));
    },
    [selectedUser]
  );

  useEffect(() => {
    if (!token || !selectedUser?.profilePhotoPath) {
      setProfilePhotoUrl(null);
      return;
    }
    let cancelled = false;
    void fetchUserProfilePhotoUrl(token, selectedUser.id)
      .then((url) => {
        if (!cancelled) {
          setProfilePhotoUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfilePhotoUrl(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, selectedUser?.id, selectedUser?.profilePhotoPath]);

  useEffect(() => {
    if (!token || !selectedUser || editUserTab !== "utenze_terze") {
      return;
    }
    let cancelled = false;
    setTpLoading(true);
    setTpMessage(null);
    void Promise.all([fetchThirdPartyLicenses(token), fetchThirdPartyAssignmentsForUser(token, selectedUser.id)])
      .then(([licenses, userAsg]) => {
        if (cancelled) {
          return;
        }
        setTpLicenses(licenses);
        const draft: Record<
          string,
          { enabled: boolean; status: "active" | "inactive"; assignedAt: string; notes: string }
        > = {};
        for (const l of licenses) {
          const hit = userAsg.find((a) => a.licenseId === l.id);
          draft[l.id] = hit
            ? {
                enabled: true,
                status: hit.status,
                assignedAt: (hit.assignedAt ?? "").slice(0, 10),
                notes: hit.notes ?? ""
              }
            : { enabled: false, status: "active" as const, assignedAt: "", notes: "" };
        }
        setTpDraft(draft);
      })
      .catch(() => {
        if (!cancelled) {
          setTpMessage("Impossibile caricare le licenze. Verifica permessi nexa.third_party_licenses.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTpLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, selectedUser?.id, editUserTab, selectedUser]);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login");
      return;
    }
    setToken(t);
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const me = await fetchCurrentUser(t);
        if (cancelled) {
          return;
        }
        setSessionUser(me);
        const [allUsers, allRoles, allCostCenters] = await Promise.all([
          fetchUsers(t),
          fetchAdminRoles(t).catch(() => [] as Role[]),
          fetchAdminCostCenters(t).catch(() => [] as CostCenter[])
        ]);
        if (cancelled) {
          return;
        }
        setUsers(allUsers);
        setRoles(allRoles);
        setCostCenters(allCostCenters);
        const sortedCc = [...allCostCenters].sort((a, b) => a.name.localeCompare(b.name, "it"));
        const teamsData = await Promise.all(
          sortedCc.map(async (cc) => ({
            cc,
            teams: await fetchAdminWorkTeams(t, cc.id).catch(() => [] as WorkTeamDto[])
          }))
        );
        if (!cancelled) {
          setTeamsNested(teamsData);
        }
      } catch (e) {
        if (shouldClearSessionOnUnauthorizedApiError(e)) {
          clearSession();
          router.replace("/login");
          return;
        }
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Errore caricamento");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, userId]);

  async function onSave(): Promise<void> {
    if (!token || !selectedUser) {
      return;
    }
    const emailTrim = selectedUser.email?.trim() ?? "";
    if (!emailTrim) {
      setError("L'email è obbligatoria.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await updateUser(token, selectedUser.id, {
        email: emailTrim,
        firstName: selectedUser.firstName,
        lastName: selectedUser.lastName,
        role: selectedUser.role,
        managerId: selectedUser.managerId,
        roleId: selectedUser.roleId,
        costCenterId: selectedUser.costCenterId,
        contractType: selectedUser.contractType,
        weeklyContractHours: selectedUser.weeklyContractHours,
        fiscalCode: (selectedUser.fiscalCode ?? "").trim().toUpperCase() || null,
        iban: selectedUser.iban,
        bankName: selectedUser.bankName,
        bicSwift: selectedUser.bicSwift,
        accountHolder: selectedUser.accountHolder,
        vacationAllowanceDays: selectedUser.vacationAllowanceDays,
        birthDate: selectedUser.birthDate,
        hireDate: selectedUser.hireDate,
        phone: selectedUser.phone,
        address: selectedUser.address,
        baseSalaryMonthly: selectedUser.baseSalaryMonthly,
        jurisdiction: "IT",
        taxRegion: selectedUser.taxRegion,
        taxMunicipalityIt: selectedUser.taxMunicipalityIt,
        teamId: selectedUser.teamId ?? null,
        payrollItSector: selectedUser.payrollItSector ?? null,
        payrollEmployerInpsPercent: selectedUser.payrollEmployerInpsPercent ?? null,
        payrollInailPermille: selectedUser.payrollInailPermille ?? null,
        payrollTfrDivisor: selectedUser.payrollTfrDivisor ?? null,
        payrollAtecoCode: selectedUser.payrollAtecoCode ?? null,
        payrollInailRiskDescription: selectedUser.payrollInailRiskDescription ?? null
      });
      const refreshed = await fetchUsers(token);
      setUsers(refreshed);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore aggiornamento utente");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-600 dark:text-slate-300">
        Caricamento scheda dipendente…
      </div>
    );
  }

  if (!selectedUser) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <p className="text-sm text-slate-700 dark:text-slate-200">Dipendente non trovato o non visibile con i tuoi permessi.</p>
        <Button type="button" variant="secondary" onClick={() => router.push("/org-chart" as Route)}>
          Vai all&apos;organigramma
        </Button>
        {canLinkAdminCc ? (
          <Button type="button" variant="secondary" onClick={() => router.push("/admin" as Route)}>
            Console utenti
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Indietro
          </Button>
          {canLinkAdminCc ? (
            <Link
              href="/admin"
              className="text-xs font-medium text-[#002D72] underline-offset-4 hover:underline dark:text-sky-300"
            >
              Console utenti
            </Link>
          ) : null}
        </div>
      </div>

      <header className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-sky-50/40 p-6 shadow-sm dark:border-slate-700/80 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#002D72]/10 blur-3xl dark:bg-sky-500/10" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-2xl font-semibold text-slate-800 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
              {profilePhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profilePhotoUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
              ) : (
                <UserCircle className="h-10 w-10 opacity-80" />
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Recap dipendente
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                {selectedUser.fullName}
              </h1>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Mail className="h-4 w-4 shrink-0 opacity-70" />
                {selectedUser.email}
              </p>
              <p className="mt-2 inline-flex rounded-full bg-slate-900/5 px-3 py-1 text-xs font-medium text-slate-800 dark:bg-white/10 dark:text-slate-100">
                {selectedRoleName || "Ruolo non assegnato"}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <GlassCard title="Collegamenti" description="Apri sede organizzativa, team o responsabile.">
          <ul className="space-y-3 text-sm text-slate-800 dark:text-slate-100">
            <li className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Centro di costo
                </p>
                {costCenter ? (
                  canLinkAdminCc ? (
                    <Link
                      href={`/admin/cost-centers?cc=${encodeURIComponent(costCenter.id)}` as Route}
                      className="font-medium text-[#002D72] underline-offset-2 hover:underline dark:text-sky-300"
                    >
                      {costCenter.code} — {costCenter.name}
                    </Link>
                  ) : (
                    <span className="font-medium">
                      {costCenter.code} — {costCenter.name}
                    </span>
                  )
                ) : (
                  <span className="text-slate-500">Non assegnato</span>
                )}
              </div>
            </li>
            <li className="flex items-start gap-2">
              <Users className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Team</p>
                {team && costCenter && canLinkAdminCc ? (
                  <Link
                    href={
                      `/admin/cost-centers?cc=${encodeURIComponent(costCenter.id)}&team=${encodeURIComponent(team.id)}` as Route
                    }
                    className="font-medium text-[#002D72] underline-offset-2 hover:underline dark:text-sky-300"
                  >
                    {team.name}
                  </Link>
                ) : (
                  <span className="font-medium">{team?.name ?? "Nessun team"}</span>
                )}
              </div>
            </li>
            <li className="flex items-start gap-2">
              <UserCircle className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Manager
                </p>
                {manager ? (
                  <Link
                    href={`/employee/${encodeURIComponent(manager.id)}` as Route}
                    className="font-medium text-[#002D72] underline-offset-2 hover:underline dark:text-sky-300"
                  >
                    {manager.fullName}
                  </Link>
                ) : (
                  <span className="text-slate-500">Non assegnato</span>
                )}
              </div>
            </li>
          </ul>
        </GlassCard>

        <GlassCard
          title={canEdit ? "Scheda HR — modifica" : "Scheda HR — sola lettura"}
          description={
            canEdit
              ? "Salva in fondo alla scheda. I dati seguono gli stessi controlli della console utenti."
              : "Solo la console Synapse admin può modificare questi campi. Contatta l'amministratore per aggiornamenti."
          }
        >
          {canEdit ? (
            <AdminUserEditPanel
              token={token}
              selectedUser={selectedUser}
              updateSelectedUser={updateSelectedUser}
              roles={roles}
              costCenters={costCenters}
              teamsNestedForTable={teamsNestedForTable}
              teamsForSelectedCc={teamsForSelectedCc}
              users={users}
              profilePhotoUrl={profilePhotoUrl}
              setProfilePhotoUrl={setProfilePhotoUrl}
              editUserTab={editUserTab}
              setEditUserTab={setEditUserTab}
              mapOrgRoleToAccess={mapOrgRoleToAccess}
              tpLicenses={tpLicenses}
              setTpLicenses={setTpLicenses}
              tpDraft={tpDraft}
              setTpDraft={setTpDraft}
              tpLoading={tpLoading}
              tpSaving={tpSaving}
              tpMessage={tpMessage}
              setTpMessage={setTpMessage}
              setTpSaving={setTpSaving}
              sessionAdminName={sessionUser?.fullName}
              usersCount={users.length}
              selectedRoleName={selectedRoleName}
              submitting={submitting}
              onSave={() => void onSave()}
              setError={setError}
              setSubmitting={setSubmitting}
            />
          ) : (
            <dl className="grid gap-3 text-xs text-slate-800 dark:text-slate-100 md:grid-cols-2">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Telefono</dt>
                <dd className="font-medium">{selectedUser.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Assunzione</dt>
                <dd className="font-medium">{selectedUser.hireDate ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Contratto</dt>
                <dd className="font-medium">{selectedUser.contractType ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Ore settimanali</dt>
                <dd className="font-medium">{selectedUser.weeklyContractHours ?? "—"}</dd>
              </div>
            </dl>
          )}
          {error ? <p className="mt-3 text-xs text-rose-600 dark:text-rose-300">{error}</p> : null}
        </GlassCard>
      </div>
    </div>
  );
}
