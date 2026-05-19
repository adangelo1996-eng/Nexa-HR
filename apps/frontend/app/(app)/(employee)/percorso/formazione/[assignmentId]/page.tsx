"use client";

import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
import { TrainingCoursePlayer } from "@/components/training-course-player";
import {
  fetchMyTrainingAssignments,
  patchTrainingAssignmentStatus,
  type TrainingAssignmentDto
} from "@/lib/api";
import { getToken } from "@/lib/auth-session";

export default function FormazioneCoursePlayerPage(): React.JSX.Element {
  const params = useParams<{ assignmentId: string }>();
  const router = useRouter();
  const assignmentId = params.assignmentId;
  const [assignment, setAssignment] = useState<TrainingAssignmentDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = await fetchMyTrainingAssignments(token);
      const found = body.items.find((a) => a.id === assignmentId) ?? null;
      if (!found?.course) {
        setError("Corso non trovato o non assegnato al tuo profilo.");
        setAssignment(null);
        return;
      }
      setAssignment(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [assignmentId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const course = assignment?.course;

  const subtitle = useMemo(() => {
    if (!course) return "Caricamento corso…";
    return `${course.durationMinutes} min · ${course.courseContent?.length ?? 0} moduli`;
  }, [course]);

  async function onStatusChange(status: TrainingAssignmentDto["status"]): Promise<void> {
    const token = getToken();
    if (!token || !assignment) return;
    const updated = await patchTrainingAssignmentStatus(token, assignment.id, status);
    setAssignment((prev) => (prev ? { ...prev, ...updated, course: prev.course } : prev));
  }

  return (
    <NexaHrAppPage
      eyebrow="Percorso · Formazione"
      title={course?.title ?? "Corso"}
      subtitle={subtitle}
      headerTrailing={<NexaPageHelpButton pageKey="formazione" />}
    >
      {loading ? <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {!loading && course ? (
        <TrainingCoursePlayer
          course={course}
          assignment={assignment}
          onStatusChange={onStatusChange}
          onComplete={() => router.push("/percorso/formazione" as Route)}
          backHref="/percorso/formazione"
          backLabel="← Torna ai corsi"
        />
      ) : null}
    </NexaHrAppPage>
  );
}
