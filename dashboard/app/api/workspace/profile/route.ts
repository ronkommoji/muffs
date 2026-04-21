import { readAssistantNameFromWorkspace } from "@/lib/markdown-profile";

export const dynamic = "force-dynamic";

export async function GET() {
  const assistantName = readAssistantNameFromWorkspace();
  return Response.json({ assistantName });
}
