"use client";

import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { NexaHrAppPage } from "@/components/nexa-hr-app-page";
import { NexaPageHelpButton } from "@/components/nexa-page-help-button";
import { TrainingCoursePlayer } from "@/components/training-course-player";
import { fetchTrainingCourses, type TrainingCourseDto } from "@/lib/api";
import { getSessionUser, getToken, sessionCanAccessHrRecapDashboard } from "@/lib/auth-session";

export default function HrFormazioneCoursePreviewPage(): React.JSX.Element | null {
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const courseId = params.courseId;
  const [course, setCourse] = useState<TrainingCourseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    const user = getSessionUser();
    if (!sessionCanAccessHrRecapDashboard(user) && user?.role !== "superuser") {
      router.replace("/");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const catalog = await fetchTrainingCourses(token);
      const found = catalog.items.find((c) => c.id === courseId) ?? null;
      if (!found) {
        setError("Corso non trovato nel catalogo.");
        return;
      }
      setCourse(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [courseId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <NexaHrAppPage
      eyebrow="Persone · Formazione"
      title={course?.title ?? "Anteprima corso"}
      subtitle="Anteprima del percorso che vedranno i dipendenti assegnati."
      headerTrailing={<NexaPageHelpButton pageKey="hr-formazione" />}
    >
      {loading ? <p className="text-sm text-[var(--prom-muted)]">Caricamento…</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {!loading && course ? (
        <TrainingCoursePlayer
          course={course}
          previewMode
          backHref="/hr/formazione"
          backLabel="← Catalogo formazione"
        />
      ) : null}
    </NexaHrAppPage>
  );
}
