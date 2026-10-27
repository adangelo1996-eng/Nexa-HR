import type { ActivityTemplateId, LeaveApprover, TenantPackApplyInput } from "./types";

/** Settori del questionario. «Tutto» = suite completa. */
export const INTAKE_SECTORS = [
  "professional_services",
  "retail_commerce",
  "manufacturing",
  "hospitality",
  "full_suite"
] as const satisfies readonly ActivityTemplateId[];

export type IntakeSector = (typeof INTAKE_SECTORS)[number];
export type IntakeHeadcount = "up_to_30" | "up_to_150" | "over_150";

export interface TenantIntakeAnswers {
  sector: IntakeSector;
  headcount: IntakeHeadcount;
  shifts: boolean;
  payslips: boolean;
  expenses: boolean;
  hiring: boolean;
  remote: boolean;
  leaveApprover: LeaveApprover;
}

const HEADCOUNT: Record<IntakeHeadcount, number> = {
  up_to_30: 30,
  up_to_150: 150,
  over_150: 800
};

/** Risposte del primo accesso → input di apply. Le always-on le forza il template. */
export function intakeToApplyInput(answers: TenantIntakeAnswers): TenantPackApplyInput {
  return {
    templateId: answers.sector,
    overlay: {
      modules: {
        "nexa.scheduling": answers.shifts,
        "nexa.payroll": answers.payslips,
        "nexa.payslips": answers.payslips,
        "nexa.expenses": answers.expenses,
        "nexa.recruiting": answers.hiring,
        "nexa.lifecycle": answers.hiring,
        "nexa.smartworking": answers.remote
      },
      limits: { maxEmployees: HEADCOUNT[answers.headcount] },
      workflows: { leaveApprover: answers.leaveApprover }
    }
  };
}
