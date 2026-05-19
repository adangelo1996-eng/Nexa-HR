import { Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type TrainingCourseCategory = "mandatory" | "optional";
export type TrainingAssignmentStatus = "not_started" | "in_progress" | "completed";

export type TrainingCourseModule = {
  id: string;
  title: string;
  summary: string;
  steps: string[];
};

export interface TrainingCourseDto {
  id: string;
  companyId: string;
  code: string;
  title: string;
  description: string;
  category: TrainingCourseCategory;
  durationMinutes: number;
  hasQuizPlaceholder: boolean;
  courseContent: TrainingCourseModule[];
}

export const NEXA_HR_PLATFORM_COURSE_CODE = "nexa-hr-piattaforma";

export interface TrainingAssignmentDto {
  id: string;
  userId: string;
  courseId: string;
  dueDate: string;
  status: TrainingAssignmentStatus;
  completedAt: string | null;
  course?: TrainingCourseDto;
}

@Injectable()
export class TrainingService {
  private readonly memCourses = new Map<string, TrainingCourseDto[]>();
  private readonly memAssignments = new Map<string, TrainingAssignmentDto[]>();

  private sb(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return null;
    }
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private seedMemCourses(companyId: string): TrainingCourseDto[] {
    const existing = this.memCourses.get(companyId);
    if (existing?.length) {
      return existing;
    }
    const seeded: TrainingCourseDto[] = [
      {
        id: "tc-sicurezza",
        companyId,
        code: "sicurezza-lavoro",
        title: "Sicurezza sul lavoro",
        description: "Normativa D.Lgs. 81/08, DPI, emergenze e cultura della sicurezza.",
        category: "mandatory",
        durationMinutes: 90,
        hasQuizPlaceholder: true,
        courseContent: []
      },
      {
        id: "tc-gdpr",
        companyId,
        code: "gdpr-base",
        title: "GDPR e privacy",
        description: "Trattamento dati personali, diritti interessati e obblighi del dipendente.",
        category: "mandatory",
        durationMinutes: 60,
        hasQuizPlaceholder: true,
        courseContent: []
      },
      {
        id: "tc-etico",
        companyId,
        code: "codice-etico",
        title: "Codice etico aziendale",
        description: "Valori, conflitti di interesse e canali di segnalazione.",
        category: "mandatory",
        durationMinutes: 45,
        hasQuizPlaceholder: true,
        courseContent: []
      },
      {
        id: "tc-harass",
        companyId,
        code: "anti-harassment",
        title: "Anti-harassment e rispetto",
        description: "Prevenzione molestie, discriminazioni e ambiente inclusivo.",
        category: "mandatory",
        durationMinutes: 50,
        hasQuizPlaceholder: true,
        courseContent: []
      },
      {
        id: "tc-excel",
        companyId,
        code: "excel-avanzato",
        title: "Excel avanzato",
        description: "Tabelle pivot, formule avanzate e automazioni per il lavoro quotidiano.",
        category: "optional",
        durationMinutes: 120,
        hasQuizPlaceholder: true,
        courseContent: []
      },
      {
        id: "tc-speaking",
        companyId,
        code: "public-speaking",
        title: "Public speaking",
        description: "Comunicazione efficace in riunioni e presentazioni.",
        category: "optional",
        durationMinutes: 90,
        hasQuizPlaceholder: true,
        courseContent: []
      },
      {
        id: "tc-nexa-platform",
        companyId,
        code: NEXA_HR_PLATFORM_COURSE_CODE,
        title: "Nexa HR — Guida alla piattaforma",
        description: "Percorso guidato su timbratura, ferie, cedolini, sale riunioni, formazione e Nexa Guide.",
        category: "mandatory",
        durationMinutes: 45,
        hasQuizPlaceholder: false,
        courseContent: [
          {
            id: "timbratura",
            title: "Timbratura e presenze",
            summary: "Registra entrate/uscite dalla sezione Presenze.",
            steps: ["Apri Presenze.", "Avvia/Termina timbratura.", "Rettifiche via Workflow se necessario."]
          }
        ]
      }
    ];
    this.memCourses.set(companyId, seeded);
    return seeded;
  }

  private mapCourseContent(raw: unknown): TrainingCourseModule[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .map((m) => {
        const mod = m as Record<string, unknown>;
        const steps = Array.isArray(mod.steps) ? mod.steps.map((s) => String(s)) : [];
        return {
          id: String(mod.id ?? ""),
          title: String(mod.title ?? ""),
          summary: String(mod.summary ?? ""),
          steps
        };
      })
      .filter((m) => m.id && m.title);
  }

  private mapCourse(row: Record<string, unknown>): TrainingCourseDto {
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      code: String(row.code),
      title: String(row.title),
      description: String(row.description ?? ""),
      category: row.category as TrainingCourseCategory,
      durationMinutes: Number(row.duration_minutes ?? 60),
      hasQuizPlaceholder: Boolean(row.has_quiz_placeholder ?? true),
      courseContent: this.mapCourseContent(row.course_content)
    };
  }

  private mapAssignment(row: Record<string, unknown>, course?: TrainingCourseDto): TrainingAssignmentDto {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      courseId: String(row.course_id),
      dueDate: String(row.due_date).slice(0, 10),
      status: row.status as TrainingAssignmentStatus,
      completedAt: row.completed_at != null ? String(row.completed_at) : null,
      course
    };
  }

  async listCourses(
    companyId: string,
    filters?: { category?: TrainingCourseCategory }
  ): Promise<TrainingCourseDto[]> {
    const sb = this.sb();
    if (!sb) {
      let items = this.seedMemCourses(companyId);
      if (filters?.category) {
        items = items.filter((c) => c.category === filters.category);
      }
      return items;
    }
    let q = sb.from("training_courses").select("*").eq("company_id", companyId).eq("active", true).order("title");
    if (filters?.category) {
      q = q.eq("category", filters.category);
    }
    const { data, error } = await q;
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return (data ?? []).map((r) => this.mapCourse(r as Record<string, unknown>));
  }

  async listAssignmentsForCompany(companyId: string): Promise<TrainingAssignmentDto[]> {
    const sb = this.sb();
    if (!sb) {
      const all: TrainingAssignmentDto[] = [];
      for (const [, list] of this.memAssignments) {
        all.push(...list);
      }
      return all.filter((a) => a.course?.companyId === companyId);
    }
    const { data, error } = await sb
      .from("training_assignments")
      .select("*, training_courses (*)")
      .eq("company_id", companyId)
      .order("due_date", { ascending: true });
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return (data ?? []).map((r) => {
      const raw = r as Record<string, unknown>;
      const nested = raw.training_courses as Record<string, unknown> | null;
      const course = nested ? this.mapCourse(nested) : undefined;
      return this.mapAssignment(raw, course);
    });
  }

  async getCourseById(companyId: string, courseId: string): Promise<TrainingCourseDto> {
    const courses = await this.listCourses(companyId);
    const course = courses.find((c) => c.id === courseId);
    if (!course) {
      throw new NotFoundException("Corso non trovato");
    }
    return course;
  }

  async findCourseByCode(companyId: string, code: string): Promise<TrainingCourseDto | null> {
    const courses = await this.listCourses(companyId);
    return courses.find((c) => c.code === code) ?? null;
  }

  async listAssignableEmployeeIds(companyId: string): Promise<string[]> {
    const sb = this.sb();
    if (!sb) {
      return [];
    }
    const { data, error } = await sb
      .from("users")
      .select("id")
      .eq("company_id", companyId)
      .neq("role", "superuser");
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return (data ?? []).map((r) => String((r as { id: string }).id));
  }

  async assignCoursesBatch(input: {
    companyId: string;
    userIds: string[];
    courseIds: string[];
    dueDate: string;
    assignedBy?: string;
  }): Promise<TrainingAssignmentDto[]> {
    const uniqueUsers = [...new Set(input.userIds.filter(Boolean))];
    const uniqueCourses = [...new Set(input.courseIds.filter(Boolean))];
    const items: TrainingAssignmentDto[] = [];
    for (const userId of uniqueUsers) {
      for (const courseId of uniqueCourses) {
        items.push(
          await this.assignCourse({
            companyId: input.companyId,
            userId,
            courseId,
            dueDate: input.dueDate,
            assignedBy: input.assignedBy
          })
        );
      }
    }
    return items;
  }

  async ensureNexaPlatformCourseAssigned(input: {
    companyId: string;
    userId: string;
    assignedBy?: string;
    dueDate?: string;
  }): Promise<TrainingAssignmentDto | null> {
    const course = await this.findCourseByCode(input.companyId, NEXA_HR_PLATFORM_COURSE_CODE);
    if (!course) {
      return null;
    }
    const dueDate =
      input.dueDate ?? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    return this.assignCourse({
      companyId: input.companyId,
      userId: input.userId,
      courseId: course.id,
      dueDate,
      assignedBy: input.assignedBy
    });
  }

  async listAssignmentsForUser(userId: string): Promise<TrainingAssignmentDto[]> {
    const sb = this.sb();
    if (!sb) {
      return (this.memAssignments.get(userId) ?? []).map((a) => {
        const courses = this.memCourses.get(a.course?.companyId ?? "comp-1") ?? [];
        const course = courses.find((c) => c.id === a.courseId);
        return { ...a, course };
      });
    }
    const { data, error } = await sb
      .from("training_assignments")
      .select("*, training_courses (*)")
      .eq("user_id", userId)
      .order("due_date", { ascending: true });
    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return (data ?? []).map((r) => {
      const raw = r as Record<string, unknown>;
      const nested = raw.training_courses as Record<string, unknown> | null;
      const course = nested ? this.mapCourse(nested) : undefined;
      return this.mapAssignment(raw, course);
    });
  }

  async assignCourse(input: {
    companyId: string;
    userId: string;
    courseId: string;
    dueDate: string;
    assignedBy?: string;
  }): Promise<TrainingAssignmentDto> {
    const sb = this.sb();
    if (!sb) {
      const courses = this.seedMemCourses(input.companyId);
      const course = courses.find((c) => c.id === input.courseId);
      if (!course) {
        throw new NotFoundException("Corso non trovato");
      }
      const list = this.memAssignments.get(input.userId) ?? [];
      const existing = list.find((a) => a.courseId === input.courseId);
      if (existing) {
        return existing;
      }
      const row: TrainingAssignmentDto = {
        id: `ta-${Date.now()}`,
        userId: input.userId,
        courseId: input.courseId,
        dueDate: input.dueDate,
        status: "not_started",
        completedAt: null,
        course
      };
      list.push(row);
      this.memAssignments.set(input.userId, list);
      return row;
    }
    const { data, error } = await sb
      .from("training_assignments")
      .upsert(
        {
          company_id: input.companyId,
          user_id: input.userId,
          course_id: input.courseId,
          due_date: input.dueDate,
          assigned_by: input.assignedBy ?? null
        },
        { onConflict: "user_id,course_id" }
      )
      .select("*, training_courses (*)")
      .single();
    if (error || !data) {
      throw new InternalServerErrorException(`Assegnazione corso: ${error?.message ?? "nessun dato"}`);
    }
    const raw = data as Record<string, unknown>;
    const nested = raw.training_courses as Record<string, unknown> | null;
    return this.mapAssignment(raw, nested ? this.mapCourse(nested) : undefined);
  }

  async patchAssignmentStatus(input: {
    assignmentId: string;
    userId: string;
    status: TrainingAssignmentStatus;
  }): Promise<TrainingAssignmentDto> {
    const completedAt =
      input.status === "completed" ? new Date().toISOString() : input.status === "not_started" ? null : undefined;
    const sb = this.sb();
    if (!sb) {
      const list = this.memAssignments.get(input.userId) ?? [];
      const idx = list.findIndex((a) => a.id === input.assignmentId);
      if (idx < 0) {
        throw new NotFoundException("Assegnazione non trovata");
      }
      list[idx] = {
        ...list[idx],
        status: input.status,
        completedAt: input.status === "completed" ? new Date().toISOString() : null
      };
      return list[idx];
    }
    const patch: Record<string, unknown> = { status: input.status };
    if (completedAt !== undefined) {
      patch.completed_at = completedAt;
    }
    const { data, error } = await sb
      .from("training_assignments")
      .update(patch)
      .eq("id", input.assignmentId)
      .eq("user_id", input.userId)
      .select("*, training_courses (*)")
      .single();
    if (error || !data) {
      throw new NotFoundException("Assegnazione non trovata");
    }
    const raw = data as Record<string, unknown>;
    const nested = raw.training_courses as Record<string, unknown> | null;
    return this.mapAssignment(raw, nested ? this.mapCourse(nested) : undefined);
  }

  progressSummary(assignments: TrainingAssignmentDto[]): {
    total: number;
    completed: number;
    inProgress: number;
    overdue: number;
    percentComplete: number;
  } {
    const today = new Date().toISOString().slice(0, 10);
    const total = assignments.length;
    const completed = assignments.filter((a) => a.status === "completed").length;
    const inProgress = assignments.filter((a) => a.status === "in_progress").length;
    const overdue = assignments.filter((a) => a.status !== "completed" && a.dueDate < today).length;
    const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, overdue, percentComplete };
  }
}
