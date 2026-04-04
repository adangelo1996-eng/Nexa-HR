import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  BadRequestException
} from "@nestjs/common";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { AuthRole } from "../platform/auth";
import { HrDataStore } from "../platform/hr-data.store";
import { PermissionsService } from "../platform/permissions.service";

export interface HebbChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  name?: string;
}

@Injectable()
export class HebbHrService {
  constructor(
    private readonly store: HrDataStore,
    private readonly permissions: PermissionsService
  ) {}

  private async assertPayrollCalcAccess(auth: { userId: string; role: AuthRole }): Promise<void> {
    if (auth.role === "superuser") {
      return;
    }
    const me = await this.store.getUser(auth.userId);
    const canHr = await this.permissions.canAccessHrExtendedConsole(auth.userId, auth.role, me.email);
    if (!canHr) {
      throw new ForbiddenException("Hebb HR riservato agli amministratori con accesso area payroll");
    }
  }

  private async assertSameCompanyUnlessSuperuser(
    auth: { userId: string; role: AuthRole },
    targetUserId: string
  ): Promise<void> {
    if (auth.role === "superuser") {
      return;
    }
    const viewer = await this.store.getUser(auth.userId);
    const target = await this.store.getUser(targetUserId);
    if (viewer.companyId !== target.companyId) {
      throw new ForbiddenException("Utente non nella stessa azienda");
    }
  }

  private loadResearchDocSnippet(maxChars = 24_000): string {
    const fromEnv = process.env.HEBB_RESEARCH_DOC_PATH?.trim();
    const candidates = [
      fromEnv,
      join(process.cwd(), "Ricerca Cedolino 25-26.md"),
      join(process.cwd(), "..", "..", "Ricerca Cedolino 25-26.md")
    ].filter(Boolean) as string[];
    for (const p of candidates) {
      if (p && existsSync(p)) {
        try {
          const full = readFileSync(p, "utf8");
          return full.length <= maxChars ? full : `${full.slice(0, maxChars)}\n\n[… documento troncato …]`;
        } catch {
          continue;
        }
      }
    }
    return "(Documento Ricerca Cedolino 25-26.md non trovato sul server: configurare HEBB_RESEARCH_DOC_PATH.)";
  }

  private buildTools() {
    return [
      {
        type: "function" as const,
        function: {
          name: "simulatePayslip",
          description:
            "Simula il cedolino italiano per un dipendente usando i dati in anagrafica e il motore interno. Restituisce righe e netto (solo simulazione, non sostituisce consulenza fiscale).",
          parameters: {
            type: "object",
            properties: {
              userId: {
                type: "string",
                description: "ID utente (UUID o id interno Nexa). Se omesso, usa il richiedente."
              },
              period: {
                type: "string",
                description: "Periodo YYYY-MM (es. 2026-04). Default mese corrente."
              },
              grossMonthlySalaryOverride: {
                type: "number",
                description: "Opzionale: lordo mensile base per la sola simulazione."
              }
            }
          }
        }
      }
    ];
  }

  async runChat(
    auth: { userId: string; role: AuthRole },
    body: { messages?: HebbChatMessage[] }
  ): Promise<{ message: string; toolResults?: unknown[] }> {
    await this.assertPayrollCalcAccess(auth);
    const apiKey = process.env.HEBB_LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        "LLM non configurato: impostare HEBB_LLM_API_KEY (o OPENAI_API_KEY)."
      );
    }
    const baseUrl = (process.env.HEBB_LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const model = process.env.HEBB_LLM_MODEL?.trim() || "gpt-4o-mini";
    const incoming = body.messages?.filter((m) => m.role === "user" || m.role === "assistant") ?? [];
    if (incoming.length === 0) {
      throw new BadRequestException("Serve almeno un messaggio (user/assistant).");
    }
    const research = this.loadResearchDocSnippet();
    const system = `Sei Hebb HR, assistente per payroll Italia in Nexa HR. Rispondi in italiano, in modo chiaro e prudente.

Contesto normativo (estratto interno; simulazione non sostituisce consulenza del lavoro o software certificato):
${research}

Regole:
- Per calcoli numerici su cedolino usa sempre il tool simulatePayslip quando l'utente chiede importi o busta paga.
- Non inventare aliquote: se mancano dati, chiedi o usa il tool con i dati in anagrafica.
- Non esporre dati di altri utenti: il tool verifica azienda e permessi.`;

    const tools = this.buildTools();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    };

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: system },
      ...incoming.map((m) => ({ role: m.role, content: m.content ?? "" }))
    ];

    const callOnce = async (msgs: Array<Record<string, unknown>>) => {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: msgs,
          tools,
          tool_choice: "auto",
          temperature: 0.3
        })
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new ServiceUnavailableException(`LLM errore ${res.status}: ${t.slice(0, 500)}`);
      }
      return (await res.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
        }>;
      };
    };

    let response = await callOnce(messages);
    const toolResults: unknown[] = [];

    const choice = response.choices?.[0]?.message;
    const toolCalls = choice?.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      const assistantMsg: Record<string, unknown> = {
        role: "assistant",
        content: choice?.content ?? null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.function.name, arguments: tc.function.arguments }
        }))
      };
      const followUp: Array<Record<string, unknown>> = [...messages, assistantMsg];
      for (const tc of toolCalls) {
        if (tc.function.name === "simulatePayslip") {
          let args: {
            userId?: string;
            period?: string;
            grossMonthlySalaryOverride?: number;
          } = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}") as typeof args;
          } catch {
            args = {};
          }
          const targetId = (args.userId?.trim() || auth.userId) as string;
          await this.assertSameCompanyUnlessSuperuser(auth, targetId);
          const period = args.period?.trim() || new Date().toISOString().slice(0, 7);
          const overrides =
            args.grossMonthlySalaryOverride != null && Number.isFinite(args.grossMonthlySalaryOverride)
              ? { grossMonthlySalary: Number(args.grossMonthlySalaryOverride) }
              : undefined;
          const result = await this.store.simulateItalianPayrollForUser(targetId, period, overrides);
          const payload = JSON.stringify({
            userId: targetId,
            period,
            grossAdjusted: result.grossAdjusted,
            netSalary: result.netSalary,
            lines: result.lines
          });
          toolResults.push(JSON.parse(payload) as object);
          followUp.push({
            role: "tool",
            tool_call_id: tc.id,
            content: payload
          });
        } else {
          followUp.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({ error: "Tool non supportata" })
          });
        }
      }
      response = await callOnce(followUp);
    }

    const finalText = response.choices?.[0]?.message?.content?.trim() || "(Nessuna risposta testuale.)";
    return { message: finalText, toolResults: toolResults.length ? toolResults : undefined };
  }
}
