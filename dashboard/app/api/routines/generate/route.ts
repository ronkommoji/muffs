export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { user_intent, schedule_description } = await req.json();
  const agentUrl = process.env.PYTHON_AGENT_URL ?? "http://localhost:8000";
  const res = await fetch(`${agentUrl}/generate-routine-prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_intent, schedule_description }),
  });
  const data = await res.json();
  return Response.json(data);
}
