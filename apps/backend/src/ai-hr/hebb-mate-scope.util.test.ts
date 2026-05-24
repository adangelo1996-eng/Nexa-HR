import {
  isCompanyWideEmployeeRequest,
  isGenericCompanyWideRequest,
  resolveEmployeesFromMessage
} from "./hebb-mate-scope.util";

describe("hebb-mate-scope.util", () => {
  const users = [
    {
      id: "u1",
      fullName: "Marco Rossi",
      firstName: "Marco",
      lastName: "Rossi",
      companyId: "c1",
      employmentState: "active"
    },
    {
      id: "u2",
      fullName: "Laura Bianchi",
      firstName: "Laura",
      lastName: "Bianchi",
      companyId: "c1",
      employmentState: "active"
    },
    {
      id: "u3",
      fullName: "Ex Dipendente",
      firstName: "Ex",
      lastName: "Dipendente",
      companyId: "c1",
      employmentState: "offboarding"
    }
  ] as Array<{
    id: string;
    fullName: string;
    firstName: string;
    lastName: string;
    companyId: string;
    employmentState: string;
  }>;

  it("defaults to self when no names in message", () => {
    const r = resolveEmployeesFromMessage("Genera report ferie", users as never, "actor", () => true);
    expect(r.scopeKind).toBe("self");
    expect(r.subjectUserIds).toEqual(["actor"]);
  });

  it("resolves single employee from chat", () => {
    const r = resolveEmployeesFromMessage("Contratto per Marco Rossi", users as never, "actor", () => true);
    expect(r.scopeKind).toBe("employees");
    expect(r.subjectUserIds).toEqual(["u1"]);
    expect(r.resolvedNames).toEqual(["Marco Rossi"]);
  });

  it("resolves multiple employees from chat", () => {
    const r = resolveEmployeesFromMessage(
      "Documenti per Marco Rossi e Laura Bianchi",
      users as never,
      "actor",
      () => true
    );
    expect(r.subjectUserIds).toEqual(["u1", "u2"]);
    expect(r.resolvedNames).toHaveLength(2);
  });

  it("uses company scope for generic automation requests", () => {
    expect(isGenericCompanyWideRequest("Automatizza le timbrature giornaliere")).toBe(true);
    const r = resolveEmployeesFromMessage("Automatizza le timbrature giornaliere", users as never, "actor", () => true);
    expect(r.scopeKind).toBe("company");
    expect(r.subjectUserIds).toEqual(["u1", "u2"]);
  });

  it("detects company-wide employee requests for smartworking contracts", () => {
    const msg = "Genera contratto smartworking per tutti i dipendenti";
    expect(isCompanyWideEmployeeRequest(msg)).toBe(true);
    const r = resolveEmployeesFromMessage(msg, users as never, "actor", () => true);
    expect(r.scopeKind).toBe("company");
    expect(r.subjectUserIds).toEqual(["u1", "u2"]);
  });

  it("excludes offboarding users from company scope", () => {
    const r = resolveEmployeesFromMessage("Contratti per tutti i dipendenti", users as never, "actor", () => true);
    expect(r.subjectUserIds).not.toContain("u3");
  });
});
