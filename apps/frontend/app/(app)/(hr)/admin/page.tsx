"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass-card";
import { adminStrings } from "./strings";
import {
  createUser,
  fetchAdminCostCenters,
  fetchAdminRoles,
  fetchAdminWorkTeams,
  fetchCurrentUser,
  fetchUserProfilePhotoUrl,
  fetchUsers,
  setLeaveAllowance,
  updateUser,
  uploadUserProfilePhoto,
  type CostCenter,
  type CreateUserPayload,
  type Role,
  type User,
  type WorkTeamDto
} from "@/lib/api";
import {
  clearSession,
  getToken,
  sessionCanNexaAdmin,
  shouldClearSessionOnUnauthorizedApiError,
  type SessionUser
} from "@/lib/auth-session";
import { inputOptionalClass, inputRequiredClass, selectOptionalClass, selectRequiredClass } from "@/lib/form-field-styles";
import { previewAutoSynapseEmail, synapseEmailDomain } from "@/lib/email-preview";
import { displayUserCatalogRole } from "@/lib/role-display";

type AdminUserTableRow =
  | { kind: "cc"; id: string; label: string }
  | { kind: "team"; id: string; label: string }
  | { kind: "person"; user: User };

function buildAdminUserTableRows(
  filteredUsers: User[],
  teamsNested: Array<{ cc: CostCenter; teams: WorkTeamDto[] }>
): AdminUserTableRow[] {
  const rows: AdminUserTableRow[] = [];
  const assigned = new Set<string>();
  for (const { cc, teams } of teamsNested) {
    const inCc = filteredUsers.filter((u) => u.costCenterId === cc.id);
    if (inCc.length === 0) continue;
    rows.push({
      kind: "cc",
      id: cc.id,
      label: [cc.code, cc.name].filter(Boolean).join(" · ") || cc.name
    });
    const teamsSorted = [...teams].sort((a, b) => a.name.localeCompare(b.name, "it"));
    const byTeam = new Map<string, User[]>();
    const noneTeam: User[] = [];
    for (const u of inCc) {
      const tid = u.teamId?.trim();
      if (tid) {
        if (!byTeam.has(tid)) byTeam.set(tid, []);
        byTeam.get(tid)!.push(u);
      } else {
        noneTeam.push(u);
      }
    }
    for (const team of teamsSorted) {
      const members = byTeam.get(team.id);
      if (!members?.length) continue;
      rows.push({ kind: "team", id: team.id, label: team.name });
      for (const u of [...members].sort((a, b) => a.fullName.localeCompare(b.fullName, "it"))) {
        rows.push({ kind: "person", user: u });
        assigned.add(u.id);
      }
      byTeam.delete(team.id);
    }
    const unassigned = [...noneTeam, ...Array.from(byTeam.values()).flat()];
    if (unassigned.length > 0) {
      rows.push({ kind: "team", id: `orphan-${cc.id}`, label: "Senza team" });
      for (const u of [...unassigned].sort((a, b) => a.fullName.localeCompare(b.fullName, "it"))) {
        rows.push({ kind: "person", user: u });
        assigned.add(u.id);
      }
    }
  }
  const remaining = filteredUsers.filter((u) => !assigned.has(u.id));
  if (remaining.length > 0) {
    rows.push({ kind: "cc", id: "__no_cc", label: "Senza centro di costo o non assegnati" });
    rows.push({ kind: "team", id: "__no_cc_team", label: "—" });
    for (const u of [...remaining].sort((a, b) => a.fullName.localeCompare(b.fullName, "it"))) {
      rows.push({ kind: "person", user: u });
    }
  }
  return rows;
}

function AdminUserAvatar({ user, token }: { user: User; token: string | null }): React.JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!token || !user.profilePhotoPath) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    void fetchUserProfilePhotoUrl(token, user.id)
      .then((signedUrl) => {
        if (!cancelled) setUrl(signedUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, user.id, user.profilePhotoPath]);
  const initials =
    `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.trim() ||
    user.fullName.slice(0, 2).toUpperCase();
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-slate-200 text-[10px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </div>
  );
}

const WIZARD_STEPS = 4 as const;

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function emptyNewUser(): CreateUserPayload {
  return {
    firstName: "",
    lastName: "",
    email: "",
    role: "user",
    companyId: "comp-1",
    roleId: "",
    costCenterId: "",
    contractType: "",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22,
    avsNumber: "",
    iban: "",
    bankName: "",
    bicSwift: "",
    accountHolder: "",
    birthDate: "",
    hireDate: "",
    phone: "",
    address: "",
    teamId: ""
  };
}

export default function AdminPage(): React.JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [newUser, setNewUser] = useState<CreateUserPayload>(emptyNewUser());
  const [wizardStep, setWizardStep] = useState(1);
  const [creatingUser, setCreatingUser] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [teamsNested, setTeamsNested] = useState<Array<{ cc: CostCenter; teams: WorkTeamDto[] }>>([]);
  const [userSearch, setUserSearch] = useState("");
  const [adminModal, setAdminModal] = useState<"closed" | "edit" | "create">("closed");

  const selectedUser = users.find((item) => item.id === selectedUserId) ?? null;

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.fullName.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const teamsNestedForTable = useMemo(() => {
    if (teamsNested.length > 0) return teamsNested;
    return [...costCenters]
      .sort((a, b) => a.name.localeCompare(b.name, "it"))
      .map((cc) => ({ cc, teams: [] as WorkTeamDto[] }));
  }, [teamsNested, costCenters]);

  const tableRows = useMemo(
    () => buildAdminUserTableRows(filteredUsers, teamsNestedForTable),
    [filteredUsers, teamsNestedForTable]
  );

  const teamsForSelectedCc = useMemo(() => {
    if (!selectedUser?.costCenterId) return [];
    return teamsNestedForTable.find((x) => x.cc.id === selectedUser.costCenterId)?.teams ?? [];
  }, [teamsNestedForTable, selectedUser?.costCenterId]);

  const teamsForNewUserCc = useMemo(() => {
    if (!newUser.costCenterId) return [];
    return teamsNestedForTable.find((x) => x.cc.id === newUser.costCenterId)?.teams ?? [];
  }, [teamsNestedForTable, newUser.costCenterId]);

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
    const currentToken = getToken();
    if (!currentToken) {
      router.replace("/login");
      return;
    }
    const tokenValue = currentToken;
    setToken(tokenValue);

    async function load(): Promise<void> {
      try {
        const currentUser = await fetchCurrentUser(tokenValue);
        if (!sessionCanNexaAdmin(currentUser)) {
          router.replace("/");
          return;
        }
        const [allUsers, allRoles, allCostCenters] = await Promise.all([
          fetchUsers(tokenValue),
          fetchAdminRoles(tokenValue),
          fetchAdminCostCenters(tokenValue)
        ]);
        setUser(currentUser);
        setUsers(allUsers);
        setRoles(allRoles);
        setCostCenters(allCostCenters);
        const sortedCc = [...allCostCenters].sort((a, b) => a.name.localeCompare(b.name, "it"));
        const teamsData = await Promise.all(
          sortedCc.map(async (cc) => ({
            cc,
            teams: await fetchAdminWorkTeams(tokenValue, cc.id).catch(() => [] as WorkTeamDto[])
          }))
        );
        setTeamsNested(teamsData);
        setSelectedUserId(allUsers[0]?.id ?? "");
      } catch (loadError) {
        if (shouldClearSessionOnUnauthorizedApiError(loadError)) {
          clearSession();
          router.replace("/login");
        }
        setError(loadError instanceof Error ? loadError.message : "Errore caricamento area admin");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [router]);

  async function refreshUsers(): Promise<void> {
    if (!token) {
      return;
    }
    const allUsers = await fetchUsers(token);
    setUsers(allUsers);
    if (!selectedUserId && allUsers[0]) {
      setSelectedUserId(allUsers[0].id);
    }
  }

  const selectedRoleName = selectedUser ? displayUserCatalogRole(selectedUser, roles) : "";

  /** Allinea ruolo accesso al catalogo solo per righe «Superuser» / «admin» / «employee» / «user». */
  function mapOrgRoleToAccess(roleName: string | undefined): CreateUserPayload["role"] | undefined {
    const n = (roleName ?? "").trim().toLowerCase();
    if (n === "admin" || n === "superuser") {
      return "superuser";
    }
    if (n === "employee" || n === "user") {
      return "user";
    }
    return undefined;
  }

  async function onCreateUser(): Promise<void> {
    if (!token) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const payload: CreateUserPayload = {
        ...newUser,
        firstName: newUser.firstName.trim(),
        lastName: newUser.lastName.trim(),
        email: newUser.email.trim(),
        contractType: newUser.contractType.trim(),
        avsNumber: newUser.avsNumber.trim(),
        iban: newUser.iban.trim(),
        bankName: newUser.bankName.trim(),
        bicSwift: newUser.bicSwift.trim(),
        accountHolder: newUser.accountHolder.trim(),
        birthDate: newUser.birthDate.trim(),
        hireDate: newUser.hireDate.trim(),
        phone: newUser.phone.trim(),
        address: newUser.address.trim()
      };
      const created = await createUser(token, {
        ...payload,
        teamId: newUser.teamId?.trim() ? newUser.teamId.trim() : undefined
      });
      setNewUser(emptyNewUser());
      setWizardStep(1);
      setCreatingUser(false);
      setAdminModal("closed");
      await refreshUsers();
      setSelectedUserId(created.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore creazione utente");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSaveSelectedUser(): Promise<void> {
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
        avsNumber: selectedUser.avsNumber,
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
        taxCanton: selectedUser.taxCanton,
        taxMunicipality: selectedUser.taxMunicipality,
        jurisdiction: selectedUser.jurisdiction,
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
      await setLeaveAllowance(token, selectedUser.id, selectedUser.vacationAllowanceDays ?? 22);
      await refreshUsers();
      setAdminModal("closed");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore aggiornamento utente");
    } finally {
      setSubmitting(false);
    }
  }

  function updateSelectedUser(patch: Partial<User>): void {
    if (!selectedUser) {
      return;
    }
    setUsers((current) => current.map((item) => (item.id === selectedUser.id ? { ...item, ...patch } : item)));
  }

  function wizardStepValid(step: number): boolean {
    if (step === 1) {
      return Boolean(
        newUser.firstName.trim() &&
          newUser.lastName.trim() &&
          newUser.email.trim() &&
          isValidEmail(newUser.email)
      );
    }
    if (step === 2) {
      return Boolean(newUser.roleId && newUser.costCenterId);
    }
    if (step === 3) {
      return (
        Boolean(newUser.contractType?.trim()) &&
        Boolean(newUser.hireDate?.trim()) &&
        Number.isFinite(newUser.weeklyContractHours) &&
        newUser.weeklyContractHours >= 1 &&
        newUser.weeklyContractHours <= 80 &&
        Number.isFinite(newUser.vacationAllowanceDays) &&
        (newUser.vacationAllowanceDays ?? 0) >= 0
      );
    }
    if (step === 4) {
      const u = newUser;
      return Boolean(
        u.avsNumber.trim() &&
          u.iban.trim() &&
          u.bankName.trim() &&
          u.bicSwift.trim() &&
          u.accountHolder.trim() &&
          u.phone.trim() &&
          u.birthDate.trim() &&
          u.address.trim()
      );
    }
    return true;
  }

  function openCreateUser(): void {
    setCreatingUser(true);
    setSelectedUserId("");
    setNewUser(emptyNewUser());
    setWizardStep(1);
    setError(null);
    setAdminModal("create");
  }

  function cancelCreateUser(): void {
    setCreatingUser(false);
    setSelectedUserId(users[0]?.id ?? "");
    setWizardStep(1);
    setError(null);
    setAdminModal("closed");
  }

  function goNext(): void {
    if (!wizardStepValid(wizardStep)) {
      setError("Completa i campi obbligatori di questo passaggio.");
      return;
    }
    setError(null);
    setWizardStep((s) => Math.min(WIZARD_STEPS, s + 1));
  }

  function goBack(): void {
    setError(null);
    setWizardStep((s) => Math.max(1, s - 1));
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-slate-700 dark:text-slate-300">Caricamento area amministrazione...</p>
      </div>
    );
  }

  const previewEmail = newUser.email.trim()
    ? newUser.email.trim()
    : previewAutoSynapseEmail(newUser.firstName, newUser.lastName);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            {adminStrings.users.title}
          </h1>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{adminStrings.users.subtitle}</p>
        </div>
        <Link href="/" className="synapse-nav-link-compact">
          {adminStrings.users.backToDashboard}
        </Link>
      </header>

      <GlassCard
        title="Utenti per centro di costo e team"
        description="Elenco gerarchico: foto, email e ruolo. Modifica con l’icona matita. Nuovo utente dal pulsante in alto a destra."
        className="h-full"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <input
            placeholder={adminStrings.users.searchPlaceholder}
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="h-8 min-w-[140px] flex-1 rounded-full border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400/80"
          />
          <Button type="button" variant="secondary" className="shrink-0 text-xs" onClick={openCreateUser}>
            Nuovo utente
          </Button>
        </div>
        <div className="max-h-[min(70vh,560px)] overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-[1] bg-slate-100 dark:bg-slate-800">
              <tr className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                <th className="px-2 py-2">Foto</th>
                <th className="px-2 py-2">Nome</th>
                <th className="px-2 py-2">Email</th>
                <th className="px-2 py-2">Ruolo</th>
                <th className="w-10 px-1 py-2" aria-label="Azioni" />
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => {
                if (row.kind === "cc") {
                  return (
                    <tr key={`cc-${row.id}`} className="bg-slate-200/90 dark:bg-slate-800/90">
                      <td colSpan={5} className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-50">
                        {row.label}
                      </td>
                    </tr>
                  );
                }
                if (row.kind === "team") {
                  return (
                    <tr key={`team-${row.id}`} className="bg-slate-100/80 dark:bg-slate-900/50">
                      <td colSpan={5} className="px-3 py-1.5 pl-6 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                        {row.label}
                      </td>
                    </tr>
                  );
                }
                const item = row.user;
                return (
                  <tr
                    key={item.id}
                    className="border-t border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-50/80 dark:hover:bg-slate-900/40"
                  >
                    <td className="px-2 py-1.5">
                      <AdminUserAvatar user={item} token={token} />
                    </td>
                    <td className="px-2 py-1.5 font-medium text-slate-900 dark:text-slate-100">{item.fullName}</td>
                    <td className="max-w-[14rem] truncate px-2 py-1.5 text-slate-600 dark:text-slate-400">
                      {item.email}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="inline-flex flex-col gap-0.5">
                        <span className="rounded-full bg-slate-200/90 px-2 py-0.5 text-[10px] font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                          {displayUserCatalogRole(item, roles)}
                        </span>
                      </span>
                    </td>
                    <td className="px-1 py-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        aria-label={`Modifica ${item.fullName}`}
                        onClick={() => {
                          setCreatingUser(false);
                          setSelectedUserId(item.id);
                          setAdminModal("edit");
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {error ? <p className="mt-3 text-xs text-rose-600 dark:text-rose-300">{error}</p> : null}
      </GlassCard>

      {adminModal !== "closed" ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          role="presentation"
          onClick={() => {
            setAdminModal("closed");
            setCreatingUser(false);
          }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-user-modal-title"
            className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[var(--glass-border)] p-5 shadow-[var(--glass-shadow)]"
            style={{
              background: "var(--glass-bg)",
              boxShadow: "var(--glass-shadow)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2 border-b border-[var(--prom-line)] pb-3">
              <div>
                <h2 id="admin-user-modal-title" className="text-base font-semibold text-[var(--prom-text)]">
                  {adminModal === "create"
                    ? adminStrings.users.detailTitleNew
                    : selectedUser
                      ? adminStrings.users.detailTitleExisting
                      : "Utente"}
                </h2>
                <p className="mt-1 text-[11px] text-[var(--prom-muted)]">
                  {adminModal === "create"
                    ? `Passo ${wizardStep} di ${WIZARD_STEPS}: tutti i campi sono obbligatori.`
                    : selectedUser
                      ? adminStrings.users.detailSubtitleExisting
                      : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setAdminModal("closed");
                  setCreatingUser(false);
                }}
              >
                Chiudi
              </Button>
            </div>

          {adminModal === "create" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="ghost" className="text-xs" onClick={cancelCreateUser}>
                  Annulla creazione
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                {Array.from({ length: WIZARD_STEPS }, (_, i) => i + 1).map((n) => (
                  <span
                    key={n}
                    className={[
                      "rounded-full px-2 py-0.5 font-medium",
                      wizardStep === n
                        ? "bg-synapse-gold/25 text-slate-900 ring-1 ring-synapse-gold/40 dark:bg-white/10 dark:text-slate-50"
                        : wizardStep > n
                          ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                          : "bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    ].join(" ")}
                  >
                    {n}. {n === 1 ? "Anagrafica" : n === 2 ? "Organizzazione" : n === 3 ? "Contratto" : "Altri dati"}
                  </span>
                ))}
              </div>

              {wizardStep === 1 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Nome *</span>
                    <input
                      value={newUser.firstName}
                      onChange={(event) => setNewUser((c) => ({ ...c, firstName: event.target.value }))}
                      className={inputRequiredClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Cognome *</span>
                    <input
                      value={newUser.lastName}
                      onChange={(event) => setNewUser((c) => ({ ...c, lastName: event.target.value }))}
                      className={inputRequiredClass}
                    />
                  </label>
                  <label className="md:col-span-2 flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Email *</span>
                    <input
                      type="email"
                      placeholder={`es. nome.cognome@${synapseEmailDomain()}`}
                      value={newUser.email}
                      onChange={(event) => setNewUser((c) => ({ ...c, email: event.target.value }))}
                      className={inputRequiredClass}
                    />
                  </label>
                  <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                    <span className="font-medium text-slate-800 dark:text-slate-200">Anteprima (se lasci vuoto il campo mentre digiti nome): </span>
                    {previewEmail}
                  </div>
                </div>
              ) : null}

              {wizardStep === 2 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Ruolo accesso *</span>
                    <select
                      value={newUser.role}
                      onChange={(event) =>
                        setNewUser((c) => ({
                          ...c,
                          role: event.target.value as CreateUserPayload["role"]
                        }))
                      }
                      className={selectRequiredClass}
                    >
                      <option value="user">user</option>
                      <option value="superuser">superuser</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Ruolo organizzativo *</span>
                    <select
                      value={newUser.roleId}
                      onChange={(event) => {
                        const value = event.target.value;
                        const roleName = roles.find((role) => role.id === value)?.name;
                        const mapped = mapOrgRoleToAccess(roleName);
                        setNewUser((c) => ({
                          ...c,
                          roleId: value,
                          ...(mapped ? { role: mapped } : {})
                        }));
                      }}
                      className={selectRequiredClass}
                    >
                      <option value="">Seleziona…</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="md:col-span-2 text-[10px] text-slate-500 dark:text-slate-400">
                    Responsabile team e approvazioni: nomina il lead da{" "}
                    <strong>Gestione centri di costo → Team</strong> (resta ruolo piattaforma `user`).
                  </p>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Centro di costo *</span>
                    <select
                      value={newUser.costCenterId}
                      onChange={(event) => {
                        const costCenterId = event.target.value;
                        setNewUser((c) => {
                          const teamsInCc = teamsNestedForTable.find((x) => x.cc.id === costCenterId)?.teams ?? [];
                          const stillOk = Boolean(c.teamId?.trim() && teamsInCc.some((t) => t.id === c.teamId));
                          return {
                            ...c,
                            costCenterId,
                            teamId: stillOk ? c.teamId : ""
                          };
                        });
                      }}
                      className={selectRequiredClass}
                    >
                      <option value="">Seleziona…</option>
                      {costCenters.map((center) => (
                        <option key={center.id} value={center.id}>
                          {center.code} - {center.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Team (macro-area)</span>
                    <select
                      value={newUser.teamId ?? ""}
                      onChange={(event) => setNewUser((c) => ({ ...c, teamId: event.target.value }))}
                      disabled={!newUser.costCenterId || teamsForNewUserCc.length === 0}
                      className={selectOptionalClass}
                    >
                      <option value="">Nessun team</option>
                      {teamsForNewUserCc.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Manager</span>
                    <select
                      value={newUser.managerId ?? ""}
                      onChange={(event) =>
                        setNewUser((c) => ({
                          ...c,
                          managerId: event.target.value || undefined
                        }))
                      }
                      className={selectOptionalClass}
                    >
                      <option value="">Nessun manager</option>
                      {users.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              {wizardStep === 3 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Ore contrattuali settimanali *</span>
                    <input
                      type="number"
                      min={1}
                      max={80}
                      step={0.5}
                      value={newUser.weeklyContractHours}
                      onChange={(event) =>
                        setNewUser((c) => ({
                          ...c,
                          weeklyContractHours: Number(event.target.value)
                        }))
                      }
                      className={inputRequiredClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Tipo contratto *</span>
                    <input
                      value={newUser.contractType}
                      onChange={(event) =>
                        setNewUser((c) => ({ ...c, contractType: event.target.value }))
                      }
                      placeholder="es. Indeterminato"
                      className={inputRequiredClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Data di assunzione *</span>
                    <input
                      type="date"
                      value={newUser.hireDate}
                      onChange={(event) => setNewUser((c) => ({ ...c, hireDate: event.target.value }))}
                      className={inputRequiredClass}
                    />
                  </label>
                  <label className="md:col-span-2 flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Ferie standard annuali *</span>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={newUser.vacationAllowanceDays}
                      onChange={(event) =>
                        setNewUser((c) => ({
                          ...c,
                          vacationAllowanceDays: Number(event.target.value)
                        }))
                      }
                      className={inputRequiredClass}
                    />
                  </label>
                </div>
              ) : null}

              {wizardStep === 4 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Numero AVS *</span>
                    <input
                      value={newUser.avsNumber}
                      onChange={(event) => setNewUser((c) => ({ ...c, avsNumber: event.target.value }))}
                      className={inputRequiredClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">IBAN *</span>
                    <input
                      value={newUser.iban}
                      onChange={(event) => setNewUser((c) => ({ ...c, iban: event.target.value }))}
                      className={inputRequiredClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Banca *</span>
                    <input
                      value={newUser.bankName}
                      onChange={(event) => setNewUser((c) => ({ ...c, bankName: event.target.value }))}
                      className={inputRequiredClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">BIC/SWIFT *</span>
                    <input
                      value={newUser.bicSwift}
                      onChange={(event) => setNewUser((c) => ({ ...c, bicSwift: event.target.value }))}
                      className={inputRequiredClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Intestatario conto *</span>
                    <input
                      value={newUser.accountHolder}
                      onChange={(event) => setNewUser((c) => ({ ...c, accountHolder: event.target.value }))}
                      className={inputRequiredClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Telefono *</span>
                    <input
                      value={newUser.phone}
                      onChange={(event) => setNewUser((c) => ({ ...c, phone: event.target.value }))}
                      className={inputRequiredClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Data di nascita *</span>
                    <input
                      type="date"
                      value={newUser.birthDate}
                      onChange={(event) => setNewUser((c) => ({ ...c, birthDate: event.target.value }))}
                      className={inputRequiredClass}
                    />
                  </label>
                  <label className="md:col-span-2 flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Indirizzo *</span>
                    <input
                      value={newUser.address}
                      onChange={(event) => setNewUser((c) => ({ ...c, address: event.target.value }))}
                      className={inputRequiredClass}
                    />
                  </label>
                </div>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {wizardStep > 1 ? (
                  <Button type="button" variant="secondary" onClick={goBack} disabled={submitting}>
                    Indietro
                  </Button>
                ) : null}
                {wizardStep < WIZARD_STEPS ? (
                  <Button type="button" onClick={goNext} disabled={submitting}>
                    Avanti
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => void onCreateUser()}
                    disabled={
                      submitting ||
                      ![1, 2, 3, 4].every((s) => wizardStepValid(s))
                    }
                  >
                    {submitting ? "Creazione..." : "Crea utente"}
                  </Button>
                )}
                <span className="text-[11px] text-slate-600 dark:text-slate-400">
                  Admin: {user?.fullName} · Utenti: {users.length}
                </span>
              </div>
            </div>
          ) : adminModal === "edit" && selectedUser ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2 border-b border-slate-200 pb-3 dark:border-slate-700/80">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Risorse umane e anagrafica
                  </h3>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
                    Contatti, organizzazione e dati utili a payroll e presenze.
                  </p>
                </div>
                <label className="md:col-span-2 flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Email *</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={selectedUser ? selectedUser.email : ""}
                    onChange={(event) =>
                      selectedUser ? updateSelectedUser({ email: event.target.value }) : undefined
                    }
                    className={inputRequiredClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">ID utente (sistema)</span>
                  <input
                    value={selectedUser ? selectedUser.id : ""}
                    readOnly
                    className={`cursor-not-allowed opacity-80 ${inputOptionalClass}`}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">ID azienda</span>
                  <input
                    value={selectedUser ? selectedUser.companyId : ""}
                    readOnly
                    className={`cursor-not-allowed opacity-80 ${inputOptionalClass}`}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Nome *</span>
                  <input
                    value={selectedUser ? selectedUser.firstName ?? "" : ""}
                    onChange={(event) =>
                      selectedUser ? updateSelectedUser({ firstName: event.target.value }) : undefined
                    }
                    className={inputRequiredClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Cognome *</span>
                  <input
                    value={selectedUser ? selectedUser.lastName ?? "" : ""}
                    onChange={(event) =>
                      selectedUser ? updateSelectedUser({ lastName: event.target.value }) : undefined
                    }
                    className={inputRequiredClass}
                  />
                </label>
                <div className="md:col-span-2 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-slate-200 text-lg font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                    {profilePhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profilePhotoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span>{selectedUser?.firstName?.[0] ?? "?"}{selectedUser?.lastName?.[0] ?? ""}</span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">Foto profilo</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="text-[11px] text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-200 file:px-2 file:py-1 dark:text-slate-400 dark:file:bg-slate-700"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file || !selectedUser || !token) {
                          return;
                        }
                        setError(null);
                        setSubmitting(true);
                        void uploadUserProfilePhoto(token, selectedUser.id, file)
                          .then((u) => {
                            updateSelectedUser({
                              profilePhotoPath: u.profilePhotoPath
                            });
                            return fetchUserProfilePhotoUrl(token, selectedUser.id);
                          })
                          .then((url) => setProfilePhotoUrl(url))
                          .catch((photoError) =>
                            setError(
                              photoError instanceof Error
                                ? photoError.message
                                : "Errore caricamento foto"
                            )
                          )
                          .finally(() => setSubmitting(false));
                        event.target.value = "";
                      }}
                    />
                    <p className="text-[10px] text-slate-500">JPEG, PNG o WebP — max ~2,5 MB (richiede Supabase Storage).</p>
                  </div>
                </div>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Ruolo accesso *</span>
                  <select
                    value={selectedUser ? selectedUser.role : "user"}
                    onChange={(event) =>
                      selectedUser
                        ? updateSelectedUser({ role: event.target.value as User["role"] })
                        : undefined
                    }
                    className={selectRequiredClass}
                  >
                    <option value="user">user</option>
                    <option value="superuser">superuser</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Ruolo organizzativo</span>
                  <select
                    value={selectedUser ? selectedUser.roleId ?? "" : ""}
                    onChange={(event) => {
                      if (!selectedUser) return;
                      const value = event.target.value || undefined;
                      const roleName = roles.find((role) => role.id === value)?.name;
                      const mappedRole = mapOrgRoleToAccess(roleName);
                      updateSelectedUser({ roleId: value, ...(mappedRole ? { role: mappedRole } : {}) });
                    }}
                    className={selectOptionalClass}
                  >
                    <option value="">Nessun ruolo organizzativo</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Centro di costo</span>
                  <select
                    value={selectedUser ? selectedUser.costCenterId ?? "" : ""}
                    onChange={(event) => {
                      const value = event.target.value || undefined;
                      if (!selectedUser) return;
                      const teamsInCc = teamsNestedForTable.find((x) => x.cc.id === value)?.teams ?? [];
                      const tid = selectedUser.teamId?.trim();
                      const stillOk = Boolean(tid && teamsInCc.some((t) => t.id === tid));
                      updateSelectedUser({
                        costCenterId: value,
                        ...(stillOk ? {} : { teamId: null })
                      });
                    }}
                    className={selectOptionalClass}
                  >
                    <option value="">Nessun centro di costo</option>
                    {costCenters.map((center) => (
                      <option key={center.id} value={center.id}>
                        {center.code} - {center.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Team (macro-area)</span>
                  <select
                    value={selectedUser?.teamId ?? ""}
                    onChange={(event) => {
                      const v = event.target.value || null;
                      if (selectedUser) updateSelectedUser({ teamId: v });
                    }}
                    disabled={!selectedUser?.costCenterId || teamsForSelectedCc.length === 0}
                    className={selectOptionalClass}
                  >
                    <option value="">Nessun team</option>
                    {teamsForSelectedCc.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Manager</span>
                  <select
                    value={selectedUser ? selectedUser.managerId ?? "" : ""}
                    onChange={(event) => {
                      const value = event.target.value || undefined;
                      if (selectedUser) updateSelectedUser({ managerId: value });
                    }}
                    className={selectOptionalClass}
                  >
                    <option value="">Nessun manager</option>
                    {users.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Ore contrattuali settimanali *</span>
                  <input
                    type="number"
                    min={1}
                    max={80}
                    step={0.5}
                    value={selectedUser ? selectedUser.weeklyContractHours ?? 40 : 40}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (selectedUser) updateSelectedUser({ weeklyContractHours: value });
                    }}
                    className={inputRequiredClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Tipo contratto *</span>
                  <input
                    value={selectedUser ? selectedUser.contractType ?? "" : ""}
                    onChange={(event) => {
                      const value = event.target.value || undefined;
                      if (selectedUser) updateSelectedUser({ contractType: value });
                    }}
                    className={inputRequiredClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Giurisdizione payroll</span>
                  <select
                    value={selectedUser?.jurisdiction ?? "CH"}
                    onChange={(event) => {
                      if (selectedUser) {
                        updateSelectedUser({ jurisdiction: event.target.value as "CH" | "IT" });
                      }
                    }}
                    className={selectOptionalClass}
                  >
                    <option value="CH">Svizzera (CH)</option>
                    <option value="IT">Italia (IT)</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">RAL lorda mensile</span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={selectedUser?.baseSalaryMonthly ?? ""}
                    onChange={(event) => {
                      const v = event.target.value;
                      if (selectedUser) {
                        updateSelectedUser({
                          baseSalaryMonthly: v === "" ? undefined : Number(v)
                        });
                      }
                    }}
                    placeholder="es. 3500"
                    className={inputOptionalClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Cantone (CH)</span>
                  <input
                    value={selectedUser?.taxCanton ?? ""}
                    onChange={(event) => {
                      if (selectedUser) updateSelectedUser({ taxCanton: event.target.value || undefined });
                    }}
                    placeholder="es. TI"
                    className={inputOptionalClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Comune fiscale (CH)</span>
                  <input
                    value={selectedUser?.taxMunicipality ?? ""}
                    onChange={(event) => {
                      if (selectedUser) {
                        updateSelectedUser({ taxMunicipality: event.target.value || undefined });
                      }
                    }}
                    className={inputOptionalClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Regione (IT)</span>
                  <input
                    value={selectedUser?.taxRegion ?? ""}
                    onChange={(event) => {
                      if (selectedUser) updateSelectedUser({ taxRegion: event.target.value || undefined });
                    }}
                    placeholder="es. LAZ"
                    className={inputOptionalClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Comune residenza (IT)</span>
                  <input
                    value={selectedUser?.taxMunicipalityIt ?? ""}
                    onChange={(event) => {
                      if (selectedUser) {
                        updateSelectedUser({ taxMunicipalityIt: event.target.value || undefined });
                      }
                    }}
                    className={inputOptionalClass}
                  />
                </label>
                <div className="md:col-span-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <p className="mb-2 text-[11px] font-medium text-slate-800 dark:text-slate-200">
                    Contributi datore Italia (budget / cedolino)
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="flex flex-col gap-1 text-[11px]">
                      <span className="text-slate-600 dark:text-slate-400">Settore IVS (preset)</span>
                      <select
                        value={selectedUser?.payrollItSector ?? ""}
                        onChange={(event) => {
                          if (!selectedUser) return;
                          const v = event.target.value;
                          updateSelectedUser({ payrollItSector: v === "" ? null : v });
                        }}
                        className={selectOptionalClass}
                      >
                        <option value="">— usa default reparto —</option>
                        <option value="industry">Industria</option>
                        <option value="commerce">Commercio</option>
                        <option value="services">Terziario / servizi</option>
                        <option value="tourism">Turismo / pubblici esercizi</option>
                        <option value="credit_insurance">Credito / assicurazioni</option>
                        <option value="agriculture">Agricoltura (semplif.)</option>
                        <option value="custom">Personalizzato (% sotto)</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[11px]">
                      <span className="text-slate-600 dark:text-slate-400">IVS datore % (override)</span>
                      <input
                        type="number"
                        min={0}
                        max={40}
                        step={0.01}
                        value={selectedUser?.payrollEmployerInpsPercent ?? ""}
                        onChange={(event) => {
                          if (!selectedUser) return;
                          const v = event.target.value;
                          updateSelectedUser({
                            payrollEmployerInpsPercent: v === "" ? null : Number(v)
                          });
                        }}
                        placeholder="es. 24.48"
                        className={inputOptionalClass}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px]">
                      <span className="text-slate-600 dark:text-slate-400">INAIL (permille su lordo)</span>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        step={0.1}
                        value={selectedUser?.payrollInailPermille ?? ""}
                        onChange={(event) => {
                          if (!selectedUser) return;
                          const v = event.target.value;
                          updateSelectedUser({
                            payrollInailPermille: v === "" ? null : Number(v)
                          });
                        }}
                        placeholder="es. 3.2"
                        className={inputOptionalClass}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px]">
                      <span className="text-slate-600 dark:text-slate-400">Divisore TFR mensile</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        step={0.1}
                        value={selectedUser?.payrollTfrDivisor ?? ""}
                        onChange={(event) => {
                          if (!selectedUser) return;
                          const v = event.target.value;
                          updateSelectedUser({
                            payrollTfrDivisor: v === "" ? null : Number(v)
                          });
                        }}
                        placeholder="13.5"
                        className={inputOptionalClass}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] md:col-span-2">
                      <span className="text-slate-600 dark:text-slate-400">Codice Ateco (riferimento)</span>
                      <input
                        value={selectedUser?.payrollAtecoCode ?? ""}
                        onChange={(event) => {
                          if (selectedUser) {
                            updateSelectedUser({
                              payrollAtecoCode: event.target.value.trim() || null
                            });
                          }
                        }}
                        placeholder="es. 62.01.00"
                        className={inputOptionalClass}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] md:col-span-2">
                      <span className="text-slate-600 dark:text-slate-400">Rischio / tariffa INAIL (note)</span>
                      <input
                        value={selectedUser?.payrollInailRiskDescription ?? ""}
                        onChange={(event) => {
                          if (selectedUser) {
                            updateSelectedUser({
                              payrollInailRiskDescription: event.target.value.trim() || null
                            });
                          }
                        }}
                        placeholder="es. Rischio basso — ufficio amministrativo"
                        className={inputOptionalClass}
                      />
                    </label>
                  </div>
                </div>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Numero AVS</span>
                  <input
                    value={selectedUser ? selectedUser.avsNumber ?? "" : ""}
                    onChange={(event) => {
                      const value = event.target.value || undefined;
                      if (selectedUser) updateSelectedUser({ avsNumber: value });
                    }}
                    className={inputOptionalClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Ferie standard annuali</span>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={selectedUser ? selectedUser.vacationAllowanceDays ?? 22 : 22}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (selectedUser) updateSelectedUser({ vacationAllowanceDays: value });
                    }}
                    className={inputOptionalClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">IBAN</span>
                  <input
                    value={selectedUser ? selectedUser.iban ?? "" : ""}
                    onChange={(event) => {
                      const value = event.target.value || undefined;
                      if (selectedUser) updateSelectedUser({ iban: value });
                    }}
                    className={inputOptionalClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Banca</span>
                  <input
                    value={selectedUser ? selectedUser.bankName ?? "" : ""}
                    onChange={(event) => {
                      const value = event.target.value || undefined;
                      if (selectedUser) updateSelectedUser({ bankName: value });
                    }}
                    className={inputOptionalClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">BIC/SWIFT</span>
                  <input
                    value={selectedUser ? selectedUser.bicSwift ?? "" : ""}
                    onChange={(event) => {
                      const value = event.target.value || undefined;
                      if (selectedUser) updateSelectedUser({ bicSwift: value });
                    }}
                    className={inputOptionalClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Intestatario conto</span>
                  <input
                    value={selectedUser ? selectedUser.accountHolder ?? "" : ""}
                    onChange={(event) => {
                      const value = event.target.value || undefined;
                      if (selectedUser) updateSelectedUser({ accountHolder: value });
                    }}
                    className={inputOptionalClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Telefono</span>
                  <input
                    value={selectedUser ? selectedUser.phone ?? "" : ""}
                    onChange={(event) => {
                      const value = event.target.value || undefined;
                      if (selectedUser) updateSelectedUser({ phone: value });
                    }}
                    className={inputOptionalClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Data di nascita</span>
                  <input
                    type="date"
                    value={selectedUser ? selectedUser.birthDate ?? "" : ""}
                    onChange={(event) => {
                      const value = event.target.value || undefined;
                      if (selectedUser) updateSelectedUser({ birthDate: value });
                    }}
                    className={inputOptionalClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Data di assunzione</span>
                  <input
                    type="date"
                    value={selectedUser ? selectedUser.hireDate ?? "" : ""}
                    onChange={(event) => {
                      const value = event.target.value || undefined;
                      if (selectedUser) updateSelectedUser({ hireDate: value });
                    }}
                    className={inputOptionalClass}
                  />
                </label>
                <label className="md:col-span-2 flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Indirizzo</span>
                  <input
                    value={selectedUser ? selectedUser.address ?? "" : ""}
                    onChange={(event) => {
                      const value = event.target.value || undefined;
                      if (selectedUser) updateSelectedUser({ address: value });
                    }}
                    className={inputOptionalClass}
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button onClick={() => void onSaveSelectedUser()} disabled={!selectedUser || submitting}>
                  {submitting ? "Salvataggio..." : "Salva modifiche"}
                </Button>
                <span className="text-[11px] text-slate-600 dark:text-slate-400">
                  Admin: {user?.fullName} · Utenti: {users.length} · Ruolo: {selectedRoleName || "-"}
                </span>
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-sm text-[var(--prom-muted)]">
              Utente non disponibile. Chiudi e riapri dalla tabella.
            </p>
          )}

            {error ? <p className="mt-3 text-xs text-rose-600 dark:text-rose-300">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
