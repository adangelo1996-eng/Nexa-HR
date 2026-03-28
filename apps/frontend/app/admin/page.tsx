"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass-card";
import { adminStrings } from "./strings";
import {
  createUser,
  fetchAdminCostCenters,
  fetchAdminRoles,
  fetchCurrentUser,
  fetchUsers,
  setLeaveAllowance,
  updateUser,
  type CostCenter,
  type CreateUserPayload,
  type Role,
  type User
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

const WIZARD_STEPS = 4 as const;

function emptyNewUser(): CreateUserPayload {
  return {
    firstName: "",
    lastName: "",
    email: undefined,
    role: "employee",
    companyId: "comp-1",
    roleId: "",
    costCenterId: "",
    contractType: "",
    weeklyContractHours: 40,
    vacationAllowanceDays: 22
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
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedUser = users.find((item) => item.id === selectedUserId) ?? null;

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

  const selectedRoleName = selectedUser
    ? roles.find((role) => role.id === selectedUser.roleId)?.name ?? selectedUser.role
    : "";

  function mapOrgRoleToAccess(roleName: string | undefined): CreateUserPayload["role"] | undefined {
    if (roleName === "admin" || roleName === "manager_controllo_gestione" || roleName === "employee") {
      return roleName;
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
      const emailTrim = newUser.email?.trim();
      const payload: CreateUserPayload = {
        ...newUser,
        email: emailTrim && emailTrim.length > 0 ? emailTrim : undefined
      };
      const created = await createUser(token, payload);
      setNewUser(emptyNewUser());
      setWizardStep(1);
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
        phone: selectedUser.phone,
        address: selectedUser.address
      });
      await setLeaveAllowance(token, selectedUser.id, selectedUser.vacationAllowanceDays ?? 22);
      await refreshUsers();
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
      return Boolean(newUser.firstName.trim() && newUser.lastName.trim());
    }
    if (step === 2) {
      return Boolean(newUser.roleId && newUser.costCenterId);
    }
    if (step === 3) {
      return (
        Boolean(newUser.contractType?.trim()) &&
        Number.isFinite(newUser.weeklyContractHours) &&
        newUser.weeklyContractHours >= 1 &&
        newUser.weeklyContractHours <= 80
      );
    }
    return true;
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

  const previewEmail =
    newUser.email?.trim() && newUser.email.includes("@")
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,4fr)]">
        <GlassCard
          title="Utenti"
          description="Elenco completo degli utenti con ricerca rapida. Usa il bottone in fondo per crearne uno nuovo."
          className="h-full"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <input
              placeholder={adminStrings.users.searchPlaceholder}
              className="h-8 flex-1 rounded-full border border-slate-700/70 bg-slate-900/70 px-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400/80"
            />
          </div>
          <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1 text-xs">
            {users.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedUserId(item.id)}
                className={[
                  "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition",
                  selectedUserId === item.id
                    ? "bg-slate-200 text-slate-900 dark:bg-slate-800/80 dark:text-slate-50"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-slate-50"
                ].join(" ")}
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-50">{item.fullName}</p>
                  <p className="truncate text-[11px] text-slate-600 dark:text-slate-400">{item.email}</p>
                </div>
                <span className="ml-2 rounded-full bg-slate-300/90 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-800 dark:bg-slate-800/80 dark:text-slate-200">
                  {item.role}
                </span>
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                setSelectedUserId("");
                setNewUser(emptyNewUser());
                setWizardStep(1);
                setError(null);
              }}
              className="mt-2 flex w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-600/80 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:border-slate-300 dark:hover:bg-slate-900/80"
            >
              + Aggiungi nuovo utente
            </button>
          </div>
        </GlassCard>

        <GlassCard
          title={
            selectedUser
              ? adminStrings.users.detailTitleExisting
              : adminStrings.users.detailTitleNew
          }
          description={
            selectedUser
              ? adminStrings.users.detailSubtitleExisting
              : `Passo ${wizardStep} di ${WIZARD_STEPS}: compila tutti i passaggi obbligatori prima di creare l&apos;utenza.`
          }
        >
          {!selectedUser ? (
            <div className="space-y-4">
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
                    <span className="text-slate-700 dark:text-slate-300">
                      Indirizzo email esistente (opzionale)
                    </span>
                    <input
                      type="email"
                      placeholder={`Altrimenti verrà generata automaticamente (@${synapseEmailDomain()})`}
                      value={newUser.email ?? ""}
                      onChange={(event) =>
                        setNewUser((c) => ({ ...c, email: event.target.value || undefined }))
                      }
                      className={inputOptionalClass}
                    />
                  </label>
                  <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                    <span className="font-medium text-slate-800 dark:text-slate-200">Anteprima email: </span>
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
                      <option value="employee">employee</option>
                      <option value="manager_controllo_gestione">manager_controllo_gestione</option>
                      <option value="admin">admin</option>
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
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Centro di costo *</span>
                    <select
                      value={newUser.costCenterId}
                      onChange={(event) =>
                        setNewUser((c) => ({ ...c, costCenterId: event.target.value }))
                      }
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
                  <label className="md:col-span-2 flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Ferie standard annuali</span>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={newUser.vacationAllowanceDays ?? 22}
                      onChange={(event) =>
                        setNewUser((c) => ({
                          ...c,
                          vacationAllowanceDays: Number(event.target.value)
                        }))
                      }
                      className={inputOptionalClass}
                    />
                  </label>
                </div>
              ) : null}

              {wizardStep === 4 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Numero AVS</span>
                    <input
                      value={newUser.avsNumber ?? ""}
                      onChange={(event) =>
                        setNewUser((c) => ({ ...c, avsNumber: event.target.value || undefined }))
                      }
                      className={inputOptionalClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">IBAN</span>
                    <input
                      value={newUser.iban ?? ""}
                      onChange={(event) =>
                        setNewUser((c) => ({ ...c, iban: event.target.value || undefined }))
                      }
                      className={inputOptionalClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Banca</span>
                    <input
                      value={newUser.bankName ?? ""}
                      onChange={(event) =>
                        setNewUser((c) => ({ ...c, bankName: event.target.value || undefined }))
                      }
                      className={inputOptionalClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">BIC/SWIFT</span>
                    <input
                      value={newUser.bicSwift ?? ""}
                      onChange={(event) =>
                        setNewUser((c) => ({ ...c, bicSwift: event.target.value || undefined }))
                      }
                      className={inputOptionalClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Intestatario conto</span>
                    <input
                      value={newUser.accountHolder ?? ""}
                      onChange={(event) =>
                        setNewUser((c) => ({ ...c, accountHolder: event.target.value || undefined }))
                      }
                      className={inputOptionalClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Telefono</span>
                    <input
                      value={newUser.phone ?? ""}
                      onChange={(event) =>
                        setNewUser((c) => ({ ...c, phone: event.target.value || undefined }))
                      }
                      className={inputOptionalClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Data di nascita</span>
                    <input
                      type="date"
                      value={newUser.birthDate ?? ""}
                      onChange={(event) =>
                        setNewUser((c) => ({ ...c, birthDate: event.target.value || undefined }))
                      }
                      className={inputOptionalClass}
                    />
                  </label>
                  <label className="md:col-span-2 flex flex-col gap-1 text-xs">
                    <span className="text-slate-700 dark:text-slate-300">Indirizzo</span>
                    <input
                      value={newUser.address ?? ""}
                      onChange={(event) =>
                        setNewUser((c) => ({ ...c, address: event.target.value || undefined }))
                      }
                      className={inputOptionalClass}
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
                    disabled={submitting || !wizardStepValid(1) || !wizardStepValid(2) || !wizardStepValid(3)}
                  >
                    {submitting ? "Creazione..." : "Crea utente"}
                  </Button>
                )}
                <span className="text-[11px] text-slate-600 dark:text-slate-400">
                  Admin: {user?.fullName} · Utenti: {users.length}
                </span>
              </div>
            </div>
          ) : (
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
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Ruolo accesso *</span>
                  <select
                    value={selectedUser ? selectedUser.role : "employee"}
                    onChange={(event) =>
                      selectedUser
                        ? updateSelectedUser({ role: event.target.value as User["role"] })
                        : undefined
                    }
                    className={selectRequiredClass}
                  >
                    <option value="employee">employee</option>
                    <option value="manager_controllo_gestione">manager_controllo_gestione</option>
                    <option value="admin">admin</option>
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
                      const mappedRole =
                        roleName === "admin" || roleName === "manager_controllo_gestione" || roleName === "employee"
                          ? roleName
                          : undefined;
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
                      if (selectedUser) updateSelectedUser({ costCenterId: value });
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
          )}

          {error ? <p className="mt-3 text-xs text-rose-600 dark:text-rose-300">{error}</p> : null}
        </GlassCard>
      </div>
    </div>
  );
}
