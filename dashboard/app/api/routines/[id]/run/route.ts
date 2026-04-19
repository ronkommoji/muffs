export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agentUrl = process.env.PYTHON_AGENT_URL ?? "http://localhost:8000";
  try {
    await fetch(`${agentUrl}/routine/run/${id}`, { method: "POST" });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 502 });
  }
}
