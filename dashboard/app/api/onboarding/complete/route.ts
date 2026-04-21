import fs from "fs";
import path from "path";
import { writePreferencesMirror } from "@/lib/preferences-file";
import {
  defaultIdentityPath,
  defaultMemoryPath,
  defaultPersonalityPath,
  defaultSoulPath,
} from "@/lib/workspace-paths";

export const dynamic = "force-dynamic";

function memoryFile(): string {
  return process.env.MEMORY_PATH
    ? path.resolve(process.env.MEMORY_PATH)
    : defaultMemoryPath();
}

function soulFile(): string {
  return process.env.SOUL_PATH ? path.resolve(process.env.SOUL_PATH) : defaultSoulPath();
}

function identityFile(): string {
  return process.env.IDENTITY_PATH ? path.resolve(process.env.IDENTITY_PATH) : defaultIdentityPath();
}

function personalityFile(): string {
  return process.env.PERSONALITY_PATH
    ? path.resolve(process.env.PERSONALITY_PATH)
    : defaultPersonalityPath();
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    userName?: string;
    agentName?: string;
    timezone?: string;
    composioToolkits?: string;
  };

  const userName = (body.userName ?? "").trim();
  const agentName = (body.agentName ?? "").trim();
  const timezone = (body.timezone ?? "UTC").trim();
  const composioToolkits = (body.composioToolkits ?? "").trim();

  if (!userName || !agentName) {
    return Response.json({ ok: false, error: "Name and agent name are required." }, { status: 400 });
  }

  const memPath = memoryFile();
  const soulPath = soulFile();
  const idPath = identityFile();
  const persPath = personalityFile();

  const dir = path.dirname(memPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.dirname(soulPath), { recursive: true });

  const memoryContent = `# Muffs Memory

## User Facts

- Name: ${userName}
- Timezone: ${timezone}
- Onboarding: completed via dashboard (${new Date().toISOString().slice(0, 10)})

## Agent Notes

`;

  fs.writeFileSync(memPath, memoryContent, "utf8");

  const soulContent = `# Soul

You are **${agentName}**, a personal AI companion for **${userName}**. Stay consistent with this relationship.

`;

  fs.writeFileSync(soulPath, soulContent, "utf8");

  const identityContent = `# Identity

- **Your name:** ${userName}
- **Assistant name:** ${agentName}

`;

  fs.writeFileSync(idPath, identityContent, "utf8");

  if (!fs.existsSync(persPath)) {
    fs.writeFileSync(
      persPath,
      `# Personality

## Response style

Concise — short unless the task needs more detail.

## Tone

Warm and clear. Light humor when it fits.

## Off limits (optional)

(Add topics to handle carefully, if any.)

`,
      "utf8"
    );
  }

  writePreferencesMirror({
    composio_toolkits: composioToolkits,
    auto_rotate_session: "true",
  });

  return Response.json({ ok: true });
}
