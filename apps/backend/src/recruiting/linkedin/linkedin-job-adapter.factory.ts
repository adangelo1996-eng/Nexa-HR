import type { LinkedInJobAdapter } from "./linkedin-job-adapter.interface";
import { OAuthLinkedInJobAdapter } from "./linkedin-job-adapter.oauth";
import { StubLinkedInJobAdapter } from "./linkedin-job-adapter.stub";

let stubSingleton: StubLinkedInJobAdapter | null = null;

export function createLinkedInJobAdapter(): LinkedInJobAdapter {
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim() ?? "";
  const orgUrn = process.env.LINKEDIN_ORGANIZATION_URN?.trim() ?? "";
  if (clientId && clientSecret && orgUrn) {
    return new OAuthLinkedInJobAdapter(clientId, clientSecret, orgUrn);
  }
  if (!stubSingleton) {
    stubSingleton = new StubLinkedInJobAdapter();
  }
  return stubSingleton;
}

export function isLinkedInAutoPublishEnabled(): boolean {
  const raw = process.env.LINKEDIN_JOB_SYNC_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function getLinkedInWebhookDefaultCompanyId(): string {
  return process.env.LINKEDIN_WEBHOOK_COMPANY_ID?.trim() || "comp-1";
}
