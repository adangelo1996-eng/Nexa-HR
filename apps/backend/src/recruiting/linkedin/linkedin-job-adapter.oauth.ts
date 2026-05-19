import type { LinkedInJobAdapter, PublishJobToLinkedInInput } from "./linkedin-job-adapter.interface";
import type { LinkedInPublishedJob } from "./linkedin.types";

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

/**
 * Minimal LinkedIn Jobs adapter (partner API often required in production).
 * Uses client-credentials token then posts a simplified job payload.
 * Falls back to explicit error when LinkedIn rejects the call.
 */
export class OAuthLinkedInJobAdapter implements LinkedInJobAdapter {
  readonly mode = "oauth" as const;
  private cachedToken: { token: string; expiresAtMs: number } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly organizationUrn: string
  ) {}

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.organizationUrn);
  }

  private async accessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAtMs > now + 60_000) {
      return this.cachedToken.token;
    }
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret
    });
    const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`LinkedIn OAuth token failed (${res.status}): ${text.slice(0, 240)}`);
    }
    const json = (await res.json()) as TokenResponse;
    if (!json.access_token) {
      throw new Error("LinkedIn OAuth: access_token mancante");
    }
    const ttlSec = Number(json.expires_in ?? 3600);
    this.cachedToken = { token: json.access_token, expiresAtMs: now + ttlSec * 1000 };
    return json.access_token;
  }

  async publishJob(input: PublishJobToLinkedInInput): Promise<LinkedInPublishedJob> {
    const token = await this.accessToken();
    const payload = {
      company: this.organizationUrn,
      title: input.title,
      description: input.description,
      location: input.location ?? undefined,
      externalJobPostingId: input.externalReference
    };
    const res = await fetch("https://api.linkedin.com/v2/simpleJobPostings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0"
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`LinkedIn job publish failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const json = (await res.json()) as { id?: string; jobPostingUrl?: string; url?: string };
    const linkedinJobId = String(json.id ?? `li-${input.externalReference}`);
    const linkedinJobUrl =
      String(json.jobPostingUrl ?? json.url ?? `https://www.linkedin.com/jobs/view/${linkedinJobId}`);
    return { linkedinJobId, linkedinJobUrl, mode: "oauth" };
  }
}
