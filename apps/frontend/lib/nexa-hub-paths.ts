import type { Route } from "next";

export function hubPathForSlug(slug: string): Route {
  return `/hub/${slug}` as Route;
}

export function employeeSectionIdForHubSlug(slug: string): string | undefined {
  if (slug === "home") return "emp-home";
  if (slug === "io") return "emp-io";
  if (slug === "documenti") return "emp-docs";
  return undefined;
}

export function employeeHubSlugForSectionId(sectionId: string): string | undefined {
  if (sectionId === "emp-home") return "home";
  if (sectionId === "emp-io") return "io";
  if (sectionId === "emp-docs") return "documenti";
  return undefined;
}

export function hrHubSlugForPillarId(pillarId: string): string {
  return pillarId.replace(/^hr-/, "");
}
