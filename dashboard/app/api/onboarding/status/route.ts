import fs from "fs";
import path from "path";
import { defaultMemoryPath } from "@/lib/workspace-paths";

export const dynamic = "force-dynamic";

function memoryPathResolved() {
  return process.env.MEMORY_PATH
    ? path.resolve(process.env.MEMORY_PATH)
    : defaultMemoryPath();
}

function memoryLooksConfigured(): boolean {
  try {
    const p = memoryPathResolved();
    if (!fs.existsSync(p)) return false;
    const memory = fs.readFileSync(p, "utf8");
    return /## User Facts[\s\S]*-\s*Name\s*:/i.test(memory);
  } catch {
    return false;
  }
}

export async function GET() {
  return Response.json({ completed: memoryLooksConfigured() });
}
