"use client";

import type { Dispatch, JSX, SetStateAction } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  fetchThirdPartyAssignmentsForUser,
  fetchThirdPartyLicenses,
  fetchUserProfilePhotoUrl,
  syncThirdPartyAssignmentsForUser,
  uploadUserProfilePhoto,
  type CostCenter,
  type Role,
  type ThirdPartyLicenseAssignmentDto,
  type ThirdPartyLicenseDto,
  type User,
  type WorkTeamDto
} from "@/lib/api";
import { inputOptionalClass, inputRequiredClass, selectOptionalClass, selectRequiredClass } from "@/lib/form-field-styles";

export type AdminUserEditTab = "anagrafica" | "contratto" | "organizzazione" | "pagamento" | "utenze_terze";

export type AdminUserEditPanelProps = {
  token: string | null;
  selectedUser: User;
  updateSelectedUser: (patch: Partial<User>) => void;
  roles: Role[];
  costCenters: CostCenter[];
  teamsNestedForTable: Array<{ cc: CostCenter; teams: WorkTeamDto[] }>;
  teamsForSelectedCc: WorkTeamDto[];
  users: User[];
  profilePhotoUrl: string | null;
  setProfilePhotoUrl: (url: string | null) => void;
  editUserTab: AdminUserEditTab;
  setEditUserTab: (t: AdminUserEditTab) => void;
  mapOrgRoleToAccess: (roleName: string | undefined) => User["role"] | undefined;
  tpLicenses: ThirdPartyLicenseDto[];
  setTpLicenses: Dispatch<SetStateAction<ThirdPartyLicenseDto[]>>;
  tpDraft: Record<string, { enabled: boolean; status: "active" | "inactive"; assignedAt: string; notes: string }>;
  setTpDraft: Dispatch<
    SetStateAction<Record<string, { enabled: boolean; status: "active" | "inactive"; assignedAt: string; notes: string }>>
  >;
  tpLoading: boolean;
  tpSaving: boolean;
  tpMessage: string | null;
  setTpMessage: (m: string | null) => void;
  setTpSaving: (v: boolean) => void;
  sessionAdminName: string | undefined;
  usersCount: number;
  selectedRoleName: string;
  submitting: boolean;
  onSave: () => void | Promise<void>;
  setError: (e: string | null) => void;
  setSubmitting: (v: boolean) => void;
};

export function AdminUserEditPanel(props: AdminUserEditPanelProps): JSX.Element {
  const {
    token,
    selectedUser,
    updateSelectedUser,
    roles,
    costCenters,
    teamsNestedForTable,
    teamsForSelectedCc,
    users,
    profilePhotoUrl,
    setProfilePhotoUrl,
    editUserTab,
    setEditUserTab,
    mapOrgRoleToAccess,
    tpLicenses,
    setTpLicenses,
    tpDraft,
    setTpDraft,
    tpLoading,
    tpSaving,
    tpMessage,
    setTpMessage,
    setTpSaving,
    sessionAdminName,
    usersCount,
    selectedRoleName,
    submitting,
    onSave,
    setError,
    setSubmitting
  } = props;

  return (
    <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2 border-b border-slate-200 pb-3 dark:border-slate-700/80">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Risorse umane e anagrafica
                  </h3>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
                    Contatti, organizzazione e dati utili a payroll e presenze. Usa le schede per compilare per
                    sezioni.
                  </p>
                </div>
                <div className="mb-3 flex flex-wrap gap-2 md:col-span-2">
                  {(
                    [
                      ["anagrafica", "Anagrafica e domicilio"],
                      ["contratto", "Fiscale, contratto e retribuzione"],
                      ["organizzazione", "Organizzazione"],
                      ["pagamento", "Pagamento"],
                      ["utenze_terze", "Utenze terze"]
                    ] as const
                  ).map(([tid, lbl]) => (
                    <button
                      key={tid}
                      type="button"
                      onClick={() => setEditUserTab(tid)}
                      className={
                        editUserTab === tid
                          ? "rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white dark:bg-slate-200 dark:text-slate-900"
                          : "rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                      }
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
                <div className={editUserTab !== "anagrafica" ? "hidden" : "contents"}>
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
                  <span className="text-slate-700 dark:text-slate-300">Codice fiscale</span>
                  <input
                    value={selectedUser ? selectedUser.fiscalCode ?? "" : ""}
                    onChange={(event) => {
                      const value = event.target.value || undefined;
                      if (selectedUser) updateSelectedUser({ fiscalCode: value ?? null });
                    }}
                    maxLength={16}
                    autoCapitalize="characters"
                    placeholder="16 caratteri"
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
                  <span className="text-slate-700 dark:text-slate-300">Indirizzo (via e numero civico)</span>
                  <input
                    value={selectedUser ? selectedUser.address ?? "" : ""}
                    onChange={(event) => {
                      const value = event.target.value || undefined;
                      if (selectedUser) updateSelectedUser({ address: value });
                    }}
                    className={inputOptionalClass}
                  />
                </label>
                <label className="md:col-span-2 flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Comune di residenza</span>
                  <p className="text-[10px] text-slate-500 dark:text-slate-500">
                    Deve coincidere con il comune di domicilio fiscale; l’indirizzo sopra contiene solo via e numero.
                  </p>
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
                </div>
                <div className={editUserTab !== "organizzazione" ? "hidden" : "contents"}>
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
                </div>
                <div className={editUserTab !== "contratto" ? "hidden" : "contents"}>
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
                <div className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">Profilo payroll</span>
                  <p className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
                    Italia (IT) — unico motore supportato
                  </p>
                </div>
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
                </div>
                <div className={editUserTab !== "pagamento" ? "hidden" : "contents"}>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">IBAN (Italia)</span>
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
                </div>
                <div className={editUserTab !== "utenze_terze" ? "hidden" : "contents"}>
                  <div className="md:col-span-2 space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Assegna licenze dal catalogo (SYN-88). Gestione inventario e costi in{" "}
                      <Link href="/tools/third-party-licenses" className="font-medium underline underline-offset-2">
                        Strumenti → Utenze terze
                      </Link>
                      .
                    </p>
                    {tpLoading ? (
                      <p className="text-xs text-slate-500">Caricamento licenze…</p>
                    ) : tpLicenses.length === 0 ? (
                      <p className="text-xs text-slate-500">Nessuna licenza in catalogo.</p>
                    ) : (
                      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {tpLicenses.map((l) => {
                          const d = tpDraft[l.id] ?? {
                            enabled: false,
                            status: "active" as const,
                            assignedAt: "",
                            notes: ""
                          };
                          return (
                            <div
                              key={l.id}
                              className="grid gap-2 rounded-md border border-slate-200/80 bg-white/90 p-2 text-xs dark:border-slate-600 dark:bg-slate-950/50 md:grid-cols-[auto_1fr]"
                            >
                              <label className="flex flex-col gap-1 md:flex-row md:items-center">
                                <span className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={d.enabled}
                                    onChange={(e) =>
                                      setTpDraft((prev) => ({
                                        ...prev,
                                        [l.id]: { ...d, enabled: e.target.checked }
                                      }))
                                    }
                                  />
                                  <span className="font-medium text-slate-800 dark:text-slate-100">
                                    {l.toolName} — {l.licensePlan}
                                  </span>
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  Posti attivi {l.activeSeatsCount}/{l.seatsPurchased}
                                </span>
                              </label>
                              {d.enabled ? (
                                <div className="flex flex-wrap items-end gap-2 md:col-span-2">
                                  <label className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-slate-500">Stato</span>
                                    <select
                                      value={d.status}
                                      onChange={(e) =>
                                        setTpDraft((prev) => ({
                                          ...prev,
                                          [l.id]: {
                                            ...d,
                                            status: e.target.value as "active" | "inactive"
                                          }
                                        }))
                                      }
                                      className={selectOptionalClass}
                                    >
                                      <option value="active">Attiva</option>
                                      <option value="inactive">Disattiva</option>
                                    </select>
                                  </label>
                                  <label className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-slate-500">Data assegnazione</span>
                                    <input
                                      type="date"
                                      value={d.assignedAt}
                                      onChange={(e) =>
                                        setTpDraft((prev) => ({
                                          ...prev,
                                          [l.id]: { ...d, assignedAt: e.target.value }
                                        }))
                                      }
                                      className={inputOptionalClass}
                                    />
                                  </label>
                                  <label className="flex min-w-[120px] flex-1 flex-col gap-0.5">
                                    <span className="text-[10px] text-slate-500">Note</span>
                                    <input
                                      value={d.notes}
                                      onChange={(e) =>
                                        setTpDraft((prev) => ({
                                          ...prev,
                                          [l.id]: { ...d, notes: e.target.value }
                                        }))
                                      }
                                      className={inputOptionalClass}
                                    />
                                  </label>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {tpMessage ? <p className="text-xs text-rose-600 dark:text-rose-300">{tpMessage}</p> : null}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!token || !selectedUser || tpSaving || tpLoading}
                      onClick={() => {
                        if (!token || !selectedUser) return;
                        const items = tpLicenses
                          .filter((l) => tpDraft[l.id]?.enabled)
                          .map((l) => {
                            const row = tpDraft[l.id]!;
                            return {
                              licenseId: l.id,
                              status: row.status,
                              assignedAt: row.assignedAt || null,
                              notes: row.notes || undefined
                            };
                          });
                        setTpSaving(true);
                        setTpMessage(null);
                        void syncThirdPartyAssignmentsForUser(token, selectedUser.id, items)
                          .then(() => {
                            setTpMessage("Utenze salvate.");
                            return Promise.all([
                              fetchThirdPartyLicenses(token),
                              fetchThirdPartyAssignmentsForUser(token, selectedUser.id)
                            ]);
                          })
                          .then((pair) => {
                            const licenses = pair[0] as ThirdPartyLicenseDto[];
                            const userAsg = pair[1] as ThirdPartyLicenseAssignmentDto[];
                            setTpLicenses(licenses);
                            setTpDraft((prev) => {
                              const next = { ...prev };
                              for (const l of licenses) {
                                const hit = userAsg.find((a) => a.licenseId === l.id);
                                next[l.id] = hit
                                  ? {
                                      enabled: true,
                                      status: hit.status,
                                      assignedAt: (hit.assignedAt ?? "").slice(0, 10),
                                      notes: hit.notes ?? ""
                                    }
                                  : { enabled: false, status: "active", assignedAt: "", notes: "" };
                              }
                              return next;
                            });
                          })
                          .catch(() => setTpMessage("Salvataggio utenze non riuscito."))
                          .finally(() => setTpSaving(false));
                      }}
                    >
                      {tpSaving ? "Salvataggio…" : "Salva assegnazioni utenze"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button onClick={() => void onSave()} disabled={!selectedUser || submitting}>
                  {submitting ? "Salvataggio..." : "Salva modifiche"}
                </Button>
                <span className="text-[11px] text-slate-600 dark:text-slate-400">
                  Admin: {sessionAdminName} · Utenti: {usersCount} · Ruolo: {selectedRoleName || "-"}
                </span>
              </div>
    </>
  );
}
