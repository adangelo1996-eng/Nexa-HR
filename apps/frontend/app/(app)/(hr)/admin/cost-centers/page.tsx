"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import {
  createAdminCostCenter,
  createAdminWorkTeam,
  deleteAdminCostCenter,
  fetchAdminCostCenters,
  fetchAdminRoles,
  fetchAdminWorkTeams,
  fetchCurrentUser,
  fetchUsers,
  patchAdminWorkTeam,
  setAdminWorkTeamLead,
  setAdminWorkTeamMembers,
  updateAdminCostCenter,
  type CostCenter,
  type Role,
  type User,
  type WorkTeamDto
} from "@/lib/api";
import {
  clearSession,
  getToken,
  sessionCanNexaAdmin,
  shouldClearSessionOnUnauthorizedApiError
} from "@/lib/auth-session";
import { inputOptionalClass, inputRequiredClass, selectOptionalClass } from "@/lib/form-field-styles";

function generateTenDigitCostCode(): string {
  const suffix = Math.floor(Math.random() * 10_000_000)
    .toString()
    .padStart(7, "0");
  return `880${suffix}`;
}

/** Un utente è membro di un solo team alla volta; il responsabile può coprire più team (lead su più righe `work_teams`). */
function canPickUserAsWorkTeamMember(u: User, team: WorkTeamDto): boolean {
  const tid = u.teamId?.trim() || null;
  if (!tid || tid === team.id) return true;
  if (team.leadUserId && u.id === team.leadUserId) return true;
  return false;
}

export default function AdminCostCentersPage(): React.JSX.Element {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [rolesCatalog, setRolesCatalog] = useState<Role[]>([]);
  const [teams, setTeams] = useState<WorkTeamDto[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [teamNameDraft, setTeamNameDraft] = useState<Record<string, string>>({});
  const [memberPick, setMemberPick] = useState<Record<string, string[]>>({});
  const [leadPick, setLeadPick] = useState<Record<string, { userId: string; roleId: string }>>({});

  const selected = costCenters.find((item) => item.id === selectedId) ?? null;

  const usersInSelectedCc = selected
    ? allUsers.filter((u) => u.costCenterId === selected.id).sort((a, b) => a.fullName.localeCompare(b.fullName, "it"))
    : [];

  useEffect(() => {
    const sessionToken = getToken();
    if (!sessionToken) {
      router.replace("/login");
      return;
    }
    const tokenValue = sessionToken;
    setToken(tokenValue);

    async function load(): Promise<void> {
      try {
        const currentUser = await fetchCurrentUser(tokenValue);
        if (!sessionCanNexaAdmin(currentUser)) {
          router.replace("/");
          return;
        }
        const [list, users, roleList] = await Promise.all([
          fetchAdminCostCenters(tokenValue),
          fetchUsers(tokenValue),
          fetchAdminRoles(tokenValue)
        ]);
        setCostCenters(list);
        setAllUsers(users);
        setRolesCatalog(roleList);
        setSelectedId(list[0]?.id ?? "");
      } catch (loadError) {
        if (shouldClearSessionOnUnauthorizedApiError(loadError)) {
          clearSession();
          router.replace("/login");
        }
        setError(loadError instanceof Error ? loadError.message : "Errore caricamento centri di costo");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [router]);

  useEffect(() => {
    if (!token || !selectedId) {
      setTeams([]);
      return;
    }
    let cancelled = false;
    setTeamsLoading(true);
    void fetchAdminWorkTeams(token, selectedId)
      .then((list) => {
        if (!cancelled) {
          setTeams(list);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Errore caricamento team");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTeamsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, selectedId]);

  useEffect(() => {
    const names: Record<string, string> = {};
    for (const t of teams) {
      names[t.id] = t.name;
    }
    setTeamNameDraft(names);
  }, [teams]);

  useEffect(() => {
    const next: Record<string, string[]> = {};
    for (const t of teams) {
      next[t.id] = allUsers.filter((u) => u.teamId === t.id).map((u) => u.id);
    }
    setMemberPick(next);
  }, [teams, allUsers]);

  useEffect(() => {
    const next: Record<string, { userId: string; roleId: string }> = {};
    for (const t of teams) {
      const defaultRole = rolesCatalog.find((r) => r.name === "team_lead");
      next[t.id] = {
        userId: t.leadUserId ?? "",
        roleId: defaultRole?.id ?? rolesCatalog[0]?.id ?? ""
      };
    }
    setLeadPick(next);
  }, [teams, rolesCatalog]);

  async function refresh(): Promise<void> {
    if (!token) return;
    const [list, users] = await Promise.all([fetchAdminCostCenters(token), fetchUsers(token)]);
    setCostCenters(list);
    setAllUsers(users);
    if (!selectedId && list[0]) {
      setSelectedId(list[0].id);
    }
  }

  async function refreshTeamsAndUsers(): Promise<void> {
    if (!token || !selectedId) return;
    const [list, users] = await Promise.all([fetchAdminWorkTeams(token, selectedId), fetchUsers(token)]);
    setTeams(list);
    setAllUsers(users);
  }

  function toggleTeamMember(team: WorkTeamDto, userId: string, user: User): void {
    if (!canPickUserAsWorkTeamMember(user, team)) {
      return;
    }
    setMemberPick((prev) => {
      const cur = new Set(prev[team.id] ?? []);
      if (cur.has(userId)) {
        cur.delete(userId);
      } else {
        cur.add(userId);
      }
      return { ...prev, [team.id]: [...cur] };
    });
  }

  async function onCreateTeam(): Promise<void> {
    if (!token || !selectedId) return;
    const name = newTeamName.trim();
    if (!name) {
      setError("Nome team obbligatorio.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createAdminWorkTeam(token, selectedId, name);
      setNewTeamName("");
      await refreshTeamsAndUsers();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore creazione team");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSaveTeamName(teamId: string): Promise<void> {
    if (!token) return;
    const name = (teamNameDraft[teamId] ?? "").trim();
    if (!name) {
      setError("Nome team non valido.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await patchAdminWorkTeam(token, teamId, { name });
      await refreshTeamsAndUsers();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore aggiornamento team");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSaveTeamMembers(teamId: string): Promise<void> {
    if (!token) return;
    const ids = memberPick[teamId] ?? [];
    setSubmitting(true);
    setError(null);
    try {
      await setAdminWorkTeamMembers(token, teamId, ids);
      await refreshTeamsAndUsers();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore aggiornamento membri");
    } finally {
      setSubmitting(false);
    }
  }

  async function onNominateLead(teamId: string): Promise<void> {
    if (!token) return;
    const pick = leadPick[teamId];
    if (!pick?.userId || !pick?.roleId) {
      setError("Seleziona dipendente e ruolo catalogo per il responsabile.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await setAdminWorkTeamLead(token, teamId, pick.userId, pick.roleId);
      await refreshTeamsAndUsers();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore nomina responsabile");
    } finally {
      setSubmitting(false);
    }
  }

  async function onCreate(): Promise<void> {
    if (!token) return;
    const name = newName.trim();
    if (!name) {
      setError("Il nome è obbligatorio.");
      return;
    }
    const codeDigits = newCode.replace(/\D/g, "").slice(0, 10);
    if (newCode.trim() && codeDigits.length !== 10) {
      setError("Il codice deve essere esattamente 10 cifre numeriche.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createAdminCostCenter(token, {
        name,
        description: newDescription.trim() || undefined,
        ...(codeDigits.length === 10 ? { code: codeDigits } : {})
      });
      setNewCode("");
      setNewName("");
      setNewDescription("");
      await refresh();
      setSelectedId(created.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore creazione centro di costo");
    } finally {
      setSubmitting(false);
    }
  }

  async function onUpdate(): Promise<void> {
    if (!token || !selected) return;
    const codeDigits = selected.code.replace(/\D/g, "").slice(0, 10);
    if (codeDigits.length !== 10) {
      setError("Il codice deve essere esattamente 10 cifre numeriche.");
      return;
    }
    const name = selected.name.trim();
    if (!name) {
      setError("Il nome è obbligatorio.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await updateAdminCostCenter(token, selected.id, {
        code: codeDigits,
        name,
        description: selected.description,
        payrollItSector: selected.payrollItSector ?? null,
        payrollDefaultInailPermille: selected.payrollDefaultInailPermille ?? null
      });
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore aggiornamento centro di costo");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(): Promise<void> {
    if (!token || !selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteAdminCostCenter(token, selected.id);
      setSelectedId("");
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore eliminazione centro di costo");
    } finally {
      setSubmitting(false);
    }
  }

  function updateSelected(patch: Partial<CostCenter>): void {
    if (!selected) return;
    setCostCenters((current) =>
      current.map((item) => (item.id === selected.id ? { ...item, ...patch } : item))
    );
  }

  if (loading) {
    return <p className="text-sm text-slate-700 dark:text-slate-300">Caricamento centri di costo...</p>;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          Gestione centri di costo
        </h1>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Mantieni codici e descrizioni usati in anagrafica utente.
        </p>
      </header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <GlassCard title="Centri di costo" description="Elenco completo.">
          <div className="space-y-2 text-xs">
            {costCenters.map((center) => (
              <button
                key={center.id}
                type="button"
                onClick={() => setSelectedId(center.id)}
                className={[
                  "w-full rounded-lg px-3 py-2 text-left",
                  selectedId === center.id
                    ? "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800/40"
                ].join(" ")}
              >
                <p className="font-medium text-slate-900 dark:text-slate-50">
                  {center.code} - {center.name}
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  {center.description || "Nessuna descrizione"}
                </p>
              </button>
            ))}
          </div>
        </GlassCard>

        <GlassCard
          title={selected ? "Dettaglio centro di costo" : "Nuovo centro di costo"}
          description={
            selected
              ? "Codice numerico a 10 cifre: genera una proposta o modifica manualmente prima di salvare."
              : "Codice a 10 cifre: usa Genera o inserisci manualmente; se lasci vuoto, il sistema assegna un codice."
          }
        >
          {selected ? (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs md:col-span-2">
                <span className="text-slate-700 dark:text-slate-300">Codice (10 cifre) *</span>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={selected.code}
                    onChange={(event) =>
                      updateSelected({ code: event.target.value.replace(/\D/g, "").slice(0, 10) })
                    }
                    inputMode="numeric"
                    maxLength={10}
                    className={`min-w-0 flex-1 ${inputRequiredClass}`}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => updateSelected({ code: generateTenDigitCostCode() })}
                  >
                    Genera
                  </Button>
                </div>
              </label>
              <label className="flex flex-col gap-1 text-xs md:col-span-2">
                <span className="text-slate-700 dark:text-slate-300">Nome *</span>
                <input
                  value={selected.name}
                  onChange={(event) => updateSelected({ name: event.target.value })}
                  className={inputRequiredClass}
                />
              </label>
              <label className="md:col-span-2 flex flex-col gap-1 text-xs">
                <span className="text-slate-700 dark:text-slate-300">Descrizione</span>
                <input
                  value={selected.description ?? ""}
                  onChange={(event) => updateSelected({ description: event.target.value || undefined })}
                  className={inputOptionalClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs md:col-span-2">
                <span className="text-slate-700 dark:text-slate-300">Default settore IVS (IT) per il reparto</span>
                <select
                  value={selected.payrollItSector ?? ""}
                  onChange={(event) => {
                    const v = event.target.value;
                    updateSelected({ payrollItSector: v === "" ? null : v });
                  }}
                  className={selectOptionalClass}
                >
                  <option value="">— nessun default —</option>
                  <option value="industry">Industria</option>
                  <option value="commerce">Commercio</option>
                  <option value="services">Terziario / servizi</option>
                  <option value="tourism">Turismo / pubblici esercizi</option>
                  <option value="credit_insurance">Credito / assicurazioni</option>
                  <option value="agriculture">Agricoltura (semplif.)</option>
                  <option value="custom">Custom (dipendente: % IVS)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs md:col-span-2">
                <span className="text-slate-700 dark:text-slate-300">Default premio INAIL (permille)</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.1}
                  value={selected.payrollDefaultInailPermille ?? ""}
                  onChange={(event) => {
                    const v = event.target.value;
                    updateSelected({
                      payrollDefaultInailPermille: v === "" ? null : Number(v)
                    });
                  }}
                  placeholder="es. 3"
                  className={inputOptionalClass}
                />
              </label>
              <div className="md:col-span-2 flex gap-2">
                <Button onClick={() => void onUpdate()} disabled={submitting}>
                  {submitting ? "Salvataggio..." : "Salva centro"}
                </Button>
                <Button
                  onClick={() => void onDelete()}
                  disabled={submitting}
                  className="bg-rose-300 text-slate-900 hover:bg-rose-200"
                >
                  Elimina
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs md:col-span-2">
                <span className="text-slate-700 dark:text-slate-300">Codice (10 cifre)</span>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={newCode}
                    onChange={(event) => setNewCode(event.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="Opzionale — Genera o 10 cifre"
                    inputMode="numeric"
                    maxLength={10}
                    className={`min-w-0 flex-1 ${inputOptionalClass}`}
                  />
                  <Button type="button" variant="secondary" className="shrink-0" onClick={() => setNewCode(generateTenDigitCostCode())}>
                    Genera
                  </Button>
                </div>
              </label>
              <label className="flex flex-col gap-1 text-xs md:col-span-2">
                <span className="text-slate-700 dark:text-slate-300">Nome *</span>
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  className={inputRequiredClass}
                />
              </label>
              <label className="md:col-span-2 flex flex-col gap-1 text-xs">
                <span className="text-slate-700 dark:text-slate-300">Descrizione</span>
                <input
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                  className={inputOptionalClass}
                />
              </label>
              <div className="md:col-span-2">
                <Button onClick={() => void onCreate()} disabled={submitting}>
                  {submitting ? "Creazione..." : "Crea centro di costo"}
                </Button>
              </div>
            </div>
          )}
          {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
        </GlassCard>
      </div>

      {selected ? (
        <GlassCard
          title="Team di lavoro"
          description="Team sotto il centro di costo selezionato. Solo utenti con lo stesso CDC possono essere membri; un dipendente può stare in un solo team come membro (compare disabilitato negli altri). Un responsabile può essere nominato su più team (flag su work_teams, non un ruolo piattaforma); dirige gli altri membri nelle approvazioni."
        >
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label className="flex min-w-[200px] flex-1 flex-col gap-1">
              <span className="text-slate-700 dark:text-slate-300">Nuovo team</span>
              <input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Nome team"
                className={inputOptionalClass}
              />
            </label>
            <Button type="button" variant="secondary" disabled={submitting || teamsLoading} onClick={() => void onCreateTeam()}>
              Crea team
            </Button>
          </div>

          {teamsLoading ? (
            <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">Caricamento team…</p>
          ) : teams.length === 0 ? (
            <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">Nessun team per questo centro di costo.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {teams.map((team) => {
                const nameVal = teamNameDraft[team.id] ?? team.name;
                const leadName = team.leadUserId
                  ? allUsers.find((u) => u.id === team.leadUserId)?.fullName ?? team.leadUserId
                  : "—";
                const membersSelected = new Set(memberPick[team.id] ?? []);
                const leadState = leadPick[team.id] ?? { userId: "", roleId: rolesCatalog[0]?.id ?? "" };

                return (
                  <div
                    key={team.id}
                    className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/40"
                  >
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs">
                        <span className="text-slate-700 dark:text-slate-300">Nome team</span>
                        <input
                          value={nameVal}
                          onChange={(e) =>
                            setTeamNameDraft((prev) => ({
                              ...prev,
                              [team.id]: e.target.value
                            }))
                          }
                          className={inputRequiredClass}
                        />
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={submitting}
                        onClick={() => void onSaveTeamName(team.id)}
                      >
                        Salva nome
                      </Button>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Responsabile attuale: <span className="font-medium text-slate-800 dark:text-slate-200">{leadName}</span>
                    </p>

                    <div>
                      <p className="mb-1 text-[11px] font-medium text-slate-700 dark:text-slate-300">Membri (stesso CDC)</p>
                      <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-white/60 p-2 dark:border-slate-600 dark:bg-slate-950/30">
                        {usersInSelectedCc.length === 0 ? (
                          <p className="text-[11px] text-slate-500">Nessun utente su questo centro di costo.</p>
                        ) : (
                          usersInSelectedCc.map((u) => {
                            const canPick = canPickUserAsWorkTeamMember(u, team);
                            const otherTid = u.teamId?.trim();
                            const otherLabel =
                              otherTid && otherTid !== team.id
                                ? teams.find((x) => x.id === otherTid)?.name ?? otherTid
                                : null;
                            return (
                              <label
                                key={u.id}
                                className={[
                                  "flex items-center gap-2 text-[11px]",
                                  canPick ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                                ].join(" ")}
                                title={
                                  canPick
                                    ? undefined
                                    : otherLabel
                                      ? `Già membro del team «${otherLabel}». Rimuovi l’utente da lì per aggiungerlo qui.`
                                      : "Già assegnato a un altro team. Rimuovi l’utente da lì per aggiungerlo qui."
                                }
                              >
                                <input
                                  type="checkbox"
                                  disabled={!canPick}
                                  checked={membersSelected.has(u.id)}
                                  onChange={() => toggleTeamMember(team, u.id, u)}
                                />
                                <span>
                                  {u.fullName}
                                  {u.id === team.leadUserId ? (
                                    <span className="ml-1 text-slate-500">(lead)</span>
                                  ) : null}
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="mt-2"
                        disabled={submitting}
                        onClick={() => void onSaveTeamMembers(team.id)}
                      >
                        Salva membri
                      </Button>
                    </div>

                    <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                      <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Nomina responsabile</p>
                      <div className="flex flex-wrap gap-2">
                        <label className="flex flex-col gap-1 text-xs">
                          <span>Dipendente</span>
                          <select
                            value={leadState.userId}
                            onChange={(e) =>
                              setLeadPick((prev) => ({
                                ...prev,
                                [team.id]: { ...leadState, userId: e.target.value }
                              }))
                            }
                            className={inputRequiredClass}
                          >
                            <option value="">—</option>
                            {usersInSelectedCc.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.fullName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex min-w-[200px] flex-col gap-1 text-xs">
                          <span>Ruolo (catalogo)</span>
                          <select
                            value={leadState.roleId}
                            onChange={(e) =>
                              setLeadPick((prev) => ({
                                ...prev,
                                [team.id]: { ...leadState, roleId: e.target.value }
                              }))
                            }
                            className={inputRequiredClass}
                          >
                            {rolesCatalog.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={submitting}
                        onClick={() => void onNominateLead(team.id)}
                      >
                        Nomina lead
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      ) : null}
    </div>
  );
}
