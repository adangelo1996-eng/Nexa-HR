import { NextResponse } from "next/server";

/** Health check per load balancer / Render (nessun cookie richiesto). */
export function GET(): NextResponse {
  return NextResponse.json({ ok: true, service: "nexa-hr-frontend" }, { status: 200 });
}
