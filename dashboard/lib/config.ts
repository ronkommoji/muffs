/** Defaults match `muffs-agent` (see agentMuffs/cli.py). Override with PYTHON_AGENT_URL / NEXT_PUBLIC_APP_URL. */

export const DEFAULT_AGENT_PORT = 8141;
export const DEFAULT_DASHBOARD_PORT = 3141;

export function getPythonAgentUrl(): string {
  return (
    process.env.PYTHON_AGENT_URL ?? `http://127.0.0.1:${DEFAULT_AGENT_PORT}`
  );
}

export function getPublicAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    `http://localhost:${DEFAULT_DASHBOARD_PORT}`
  );
}
