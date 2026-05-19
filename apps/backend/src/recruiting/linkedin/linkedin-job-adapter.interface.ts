import type { LinkedInJobAdapterMode, LinkedInPublishedJob } from "./linkedin.types";

export interface PublishJobToLinkedInInput {
  title: string;
  description: string;
  location?: string | null;
  externalReference: string;
}

export interface LinkedInJobAdapter {
  readonly mode: LinkedInJobAdapterMode;
  isConfigured(): boolean;
  publishJob(input: PublishJobToLinkedInInput): Promise<LinkedInPublishedJob>;
}
