/**
 * Defaults match agentMuffs/workspace.py.
 * macOS: ~/muffs-workspace (like ~/claude-workspace). Linux: ~/.local/share/muffs. Windows: %APPDATA%/Muffs.
 * If DB_PATH / MEMORY_PATH / SOUL_PATH are set in the environment, those win.
 */

import fs from "fs";
import os from "os";
import path from "path";

export function getDefaultMuffsDataRoot(): string {
  const ex = process.env.MUFFS_WORKSPACE?.trim();
  if (ex) return path.resolve(ex);
  if (process.platform === "win32") {
    const base =
      process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, "Muffs");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "muffs-workspace");
  }
  const xdg = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
  return path.join(xdg, "muffs");
}

export function defaultDbPath(): string {
  return path.join(getDefaultMuffsDataRoot(), "db", "muffs.db");
}

export function defaultMemoryPath(): string {
  return path.join(getDefaultMuffsDataRoot(), "workspace", "memory", "memory.md");
}

export function defaultSoulPath(): string {
  return path.join(getDefaultMuffsDataRoot(), "workspace", "memory", "soul.md");
}

export function defaultIdentityPath(): string {
  return path.join(getDefaultMuffsDataRoot(), "workspace", "memory", "identity.md");
}

export function defaultPersonalityPath(): string {
  return path.join(getDefaultMuffsDataRoot(), "workspace", "memory", "personality.md");
}

export function preferencesFilePath(): string {
  return path.join(getDefaultMuffsDataRoot(), "workspace", "user", "preferences.json");
}

/** Ensure workspace dirs exist (Next.js side; mirrors Python ensure_workspace). */
export function ensureWorkspaceDirs(): void {
  const root = getDefaultMuffsDataRoot();
  for (const p of [
    path.join(root, "workspace", "memory"),
    path.join(root, "workspace", "projects"),
    path.join(root, "workspace", "user"),
    path.join(root, "db"),
  ]) {
    fs.mkdirSync(p, { recursive: true });
  }
  const readme = path.join(root, "workspace", "projects", "README.md");
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(
      readme,
      "# Projects\n\nPut per-project notes or files here.\n",
      "utf8"
    );
  }
}
