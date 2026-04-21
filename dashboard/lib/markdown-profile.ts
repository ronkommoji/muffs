import fs from "fs";
import path from "path";
import {
  defaultIdentityPath,
  defaultPersonalityPath,
  defaultSoulPath,
  defaultMemoryPath,
} from "@/lib/workspace-paths";

function readTrimmed(file: string): string {
  try {
    if (!fs.existsSync(file)) return "";
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
}

/** Match Python: identity.md "Assistant name", else soul.md `You are **Name**`, else Muffs. */
export function readAssistantNameFromWorkspace(): string {
  const idPath = process.env.IDENTITY_PATH?.trim()
    ? path.resolve(process.env.IDENTITY_PATH)
    : defaultIdentityPath();
  if (fs.existsSync(idPath)) {
    const text = fs.readFileSync(idPath, "utf8");
    for (const line of text.split("\n")) {
      const ln = line.trim();
      const m =
        ln.match(/(?:[-*]\s+)?\*\*Assistant name:\*\*\s*(.+)$/i) ??
        ln.match(/(?:[-*]\s+)?Assistant name:\s*(.+)$/i);
      if (m?.[1]) {
        const v = m[1].trim().replace(/^\*+|\*+$/g, "").trim();
        if (v && v !== "—") return v;
      }
    }
  }
  const soulPath = process.env.SOUL_PATH?.trim()
    ? path.resolve(process.env.SOUL_PATH)
    : defaultSoulPath();
  if (fs.existsSync(soulPath)) {
    const text = fs.readFileSync(soulPath, "utf8");
    const m = text.match(/You are\s+\*\*([^*]+)\*\*/);
    if (m) return m[1].trim();
  }
  return "Muffs";
}

/**
 * Approximates `agentMuffs.agent._build_system_prompt` for Settings preview (no Python call).
 */
export function buildSystemPromptPreview(): string {
  const promptPath = path.join(
    process.cwd(),
    "..",
    "agentMuffs",
    "prompts",
    "muffs_base.txt"
  );
  let base = fs.existsSync(promptPath)
    ? fs.readFileSync(promptPath, "utf8")
    : "(muffs_base.txt not found)";

  const memoryPath = process.env.MEMORY_PATH?.trim()
    ? path.resolve(process.env.MEMORY_PATH)
    : defaultMemoryPath();
  let userFacts = "Not yet configured. Run /setup.";
  let agentNotes = "Nothing yet.";
  if (fs.existsSync(memoryPath)) {
    const memory = fs.readFileSync(memoryPath, "utf8");
    const ufMatch = memory.match(/## User Facts\n([\s\S]*?)(?=## |\Z)/);
    const anMatch = memory.match(/## Agent Notes\n([\s\S]*?)(?=## |\Z)/);
    if (ufMatch?.[1]) userFacts = ufMatch[1].trim();
    if (anMatch?.[1]) agentNotes = anMatch[1].trim();
  }

  const agentName = readAssistantNameFromWorkspace();

  const soulPath = process.env.SOUL_PATH?.trim()
    ? path.resolve(process.env.SOUL_PATH)
    : defaultSoulPath();
  const identityPath = process.env.IDENTITY_PATH?.trim()
    ? path.resolve(process.env.IDENTITY_PATH)
    : defaultIdentityPath();
  const personalityPath = process.env.PERSONALITY_PATH?.trim()
    ? path.resolve(process.env.PERSONALITY_PATH)
    : defaultPersonalityPath();

  const blocks: string[] = [];
  const soul = readTrimmed(soulPath);
  if (soul) blocks.push("## Soul\n\n" + soul);
  const identity = readTrimmed(identityPath);
  if (identity) blocks.push("## Identity\n\n" + identity);

  let mid = base
    .replace(/\{\{AGENT_NAME\}\}/g, agentName)
    .replace("{{USER_FACTS}}", userFacts)
    .replace("{{AGENT_NOTES}}", agentNotes);

  let prompt =
    blocks.length > 0
      ? blocks.join("\n\n---\n\n") + "\n\n---\n\n" + mid
      : mid;

  const p = readTrimmed(personalityPath);
  if (p) prompt += "\n\n## Personality\n\n" + p;

  return prompt;
}
