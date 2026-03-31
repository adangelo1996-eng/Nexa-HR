import { Controller, Get, Query } from "@nestjs/common";

type SearchResult = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

@Controller("search")
export class SearchController {
  @Get()
  search(@Query("q") qRaw?: string): SearchResult[] {
    const q = String(qRaw ?? "").trim();
    if (!q) return [];
    return [
      {
        id: "nexa-person-1",
        title: `Persona: ${q}`,
        subtitle: "Nexa People (mock)",
        href: `/people/search?q=${encodeURIComponent(q)}`
      }
    ];
  }
}

