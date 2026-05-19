import { randomUUID } from "node:crypto";
import type { LinkedInJobAdapter, PublishJobToLinkedInInput } from "./linkedin-job-adapter.interface";
import type { LinkedInPublishedJob } from "./linkedin.types";

/** Simulates LinkedIn Jobs when API credentials are absent (dev / Zapier-only setups). */
export class StubLinkedInJobAdapter implements LinkedInJobAdapter {
  readonly mode = "stub" as const;

  isConfigured(): boolean {
    return true;
  }

  async publishJob(input: PublishJobToLinkedInInput): Promise<LinkedInPublishedJob> {
    const id = `stub-${randomUUID()}`;
    const slug = encodeURIComponent(input.title.slice(0, 48).replace(/\s+/g, "-").toLowerCase());
    return {
      linkedinJobId: id,
      linkedinJobUrl: `https://www.linkedin.com/jobs/view/${slug}-${id.slice(-8)}`,
      mode: "stub"
    };
  }
}
