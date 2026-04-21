import { getPythonAgentUrl } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const agentUrl = getPythonAgentUrl();
  try {
    const res = await fetch(`${agentUrl}/context`, { cache: "no-store" });
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({ percentage: 0, totalTokens: 0, maxTokens: 0 });
  }
}
