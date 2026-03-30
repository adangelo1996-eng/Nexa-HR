import { Controller, MessageEvent, Sse, UseGuards } from "@nestjs/common";
import { Observable, interval, map } from "rxjs";
import { NexaPermissionGuard, RequireNexaPermissions } from "../platform/nexa-permission.guard";

/**
 * Heartbeat SSE (30 s). Il client può sostituire con Supabase Realtime sulle stesse entità.
 */
@Controller("realtime")
@UseGuards(NexaPermissionGuard)
export class RealtimeController {
  @Sse("heartbeat")
  @RequireNexaPermissions("nexa.attendance:read")
  heartbeat(): Observable<MessageEvent> {
    return interval(30_000).pipe(map(() => ({ data: { ok: true, at: new Date().toISOString() } })));
  }
}
