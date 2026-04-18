// SSE endpoint: streams agent_events rows to the browser in real time.
// Polls SQLite every 500ms and pushes new rows as SSE events.
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let lastId = 0;

      const interval = setInterval(() => {
        try {
          const db = getDb();
          const rows = db
            .prepare(
              "SELECT * FROM agent_events WHERE id > ? ORDER BY id ASC LIMIT 50"
            )
            .all(lastId) as Array<{ id: number; [key: string]: unknown }>;

          for (const row of rows) {
            lastId = row.id;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(row)}\n\n`)
            );
          }
        } catch (err) {
          console.error("SSE poll error:", err);
        }
      }, 500);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
