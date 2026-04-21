const PREFIX = "__MUFFS_ROUTINE_PROPOSAL__\n";

export interface RoutineProposalPayload {
  name: string;
  description: string;
  schedule_cron: string;
  timezone: string;
  system_prompt: string;
}

export function parseRoutineProposal(content: string): RoutineProposalPayload | null {
  if (!content.startsWith(PREFIX)) return null;
  const raw = content.slice(PREFIX.length).trim();
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof o.name === "string" &&
      typeof o.schedule_cron === "string" &&
      typeof o.system_prompt === "string"
    ) {
      return {
        name: o.name,
        description: typeof o.description === "string" ? o.description : o.name,
        schedule_cron: o.schedule_cron,
        timezone: typeof o.timezone === "string" ? o.timezone : "UTC",
        system_prompt: o.system_prompt,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function isRoutineProposalContent(content: string): boolean {
  return content.startsWith(PREFIX);
}
