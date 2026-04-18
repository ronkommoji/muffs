import fs from "fs";
import path from "path";
import { getSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

// Returns the merged system prompt as Muffs would read it — used by the Settings live preview.
export async function GET() {
  const promptPath = path.join(
    process.cwd(),
    "..",
    "agent",
    "prompts",
    "muffs_base.txt"
  );
  const memoryPath = path.join(
    process.cwd(),
    "..",
    "agent",
    "memory",
    "memory.md"
  );

  let base = fs.existsSync(promptPath)
    ? fs.readFileSync(promptPath, "utf8")
    : "(muffs_base.txt not found)";

  let userFacts = "Not yet configured.";
  let agentNotes = "Nothing yet.";

  if (fs.existsSync(memoryPath)) {
    const memory = fs.readFileSync(memoryPath, "utf8");
    const ufMatch = memory.match(/## User Facts\n([\s\S]*?)(?=## |\Z)/);
    const anMatch = memory.match(/## Agent Notes\n([\s\S]*?)(?=## |\Z)/);
    if (ufMatch) userFacts = ufMatch[1].trim();
    if (anMatch) agentNotes = anMatch[1].trim();
  }

  let prompt = base
    .replace("{{USER_FACTS}}", userFacts)
    .replace("{{AGENT_NOTES}}", agentNotes);

  const personalityNotes = getSetting("personality_notes");
  const responseStyle = getSetting("response_style", "Concise");
  const toneAdjustments = getSetting("tone_adjustments");
  const offLimits = getSetting("off_limits_topics");

  const extra: string[] = [];
  if (personalityNotes) extra.push(`Additional personality context: ${personalityNotes}`);
  if (responseStyle !== "Concise") extra.push(`Response style: ${responseStyle}`);
  if (toneAdjustments) extra.push(`Tone adjustments: ${toneAdjustments}`);
  if (offLimits) extra.push(`Never bring up: ${offLimits}`);

  if (extra.length > 0) {
    prompt += "\n\n## User Preferences\n" + extra.join("\n");
  }

  return Response.json({ prompt });
}
