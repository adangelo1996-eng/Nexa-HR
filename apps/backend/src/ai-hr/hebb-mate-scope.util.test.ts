import { resolveEmployeesFromMessage } from "./hebb-mate-scope.util";

describe("hebb-mate-scope.util", () => {
  const users = [
    {
      id: "u1",
      fullName: "Marco Rossi",
      firstName: "Marco",
      lastName: "Rossi",
      companyId: "c1"
    },
    {
      id: "u2",
      fullName: "Laura Bianchi",
      firstName: "Laura",
      lastName: "Bianchi",
      companyId: "c1"
    }
  ] as Array<{
    id: string;
    fullName: string;
    firstName: string;
    lastName: string;
    companyId: string;
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
});
