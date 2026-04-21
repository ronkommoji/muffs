import { buildSystemPromptPreview } from "@/lib/markdown-profile";

export const dynamic = "force-dynamic";

/** Merged system prompt as the agent would read it (markdown files only, no SQLite identity rows). */
export async function GET() {
  const prompt = buildSystemPromptPreview();
  return Response.json({ prompt });
}
