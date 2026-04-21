"""CLI: `muffs-agent` starts the FastAPI worker and Next.js dashboard on non-default ports."""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DASHBOARD = ROOT / "dashboard"

DEFAULT_AGENT_PORT = 8141
DEFAULT_DASHBOARD_PORT = 3141


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Run Muffs: Python agent (Claude SDK) + Next.js dashboard together by default.",
    )
    p.add_argument(
        "--agent-only",
        action="store_true",
        help="Only run the FastAPI / uvicorn agent (no Next.js).",
    )
    p.add_argument(
        "--dashboard-only",
        action="store_true",
        help="Only run the Next.js dev server (no Python agent).",
    )
    p.add_argument(
        "--agent-port",
        type=int,
        default=int(os.getenv("MUFFS_AGENT_PORT", str(DEFAULT_AGENT_PORT))),
        help=f"Port for FastAPI (default {DEFAULT_AGENT_PORT}).",
    )
    p.add_argument(
        "--dashboard-port",
        type=int,
        default=int(os.getenv("MUFFS_DASHBOARD_PORT", str(DEFAULT_DASHBOARD_PORT))),
        help=f"Port for Next.js (default {DEFAULT_DASHBOARD_PORT}).",
    )
    p.add_argument(
        "--host",
        default=os.getenv("MUFFS_HOST", "0.0.0.0"),
        help="Bind address for the agent (default 0.0.0.0).",
    )
    p.add_argument(
        "--reload",
        action="store_true",
        help="Uvicorn auto-reload (use with --agent-only; good for dev).",
    )
    ns = p.parse_args()
    if os.getenv("MUFFS_RELOAD", "").lower() in ("1", "true", "yes"):
        ns.reload = True
    return ns


def _run_agent_only(host: str, port: int, reload: bool) -> None:
    import uvicorn

    uvicorn.run(
        "agentMuffs.agent:app",
        host=host,
        port=port,
        reload=reload,
    )


def _run_dashboard_only(dashboard_port: int) -> int:
    npm = _npm_cmd()
    agent_url = f"http://127.0.0.1:{int(os.getenv('MUFFS_AGENT_PORT', DEFAULT_AGENT_PORT))}"
    env = os.environ.copy()
    env["PYTHON_AGENT_URL"] = os.getenv("PYTHON_AGENT_URL", agent_url)
    env["NEXT_PUBLIC_APP_URL"] = os.getenv(
        "NEXT_PUBLIC_APP_URL",
        f"http://localhost:{dashboard_port}",
    )
    proc = subprocess.Popen(
        npm + ["run", "dev", "--", "-p", str(dashboard_port)],
        cwd=str(DASHBOARD),
        env=env,
    )
    return proc.wait()


def _npm_cmd() -> list[str]:
    npm = os.getenv("MUFFS_NPM_EXE", "").strip()
    if npm:
        return [npm]
    return ["npm"]


def _spawn_agent(args: argparse.Namespace, *, uvicorn_reload: bool) -> subprocess.Popen:
    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "agentMuffs.agent:app",
        "--host",
        args.host,
        "--port",
        str(args.agent_port),
    ]
    if uvicorn_reload:
        cmd.append("--reload")
    return subprocess.Popen(cmd, cwd=str(ROOT))


def _spawn_dashboard(agent_port: int, dashboard_port: int) -> subprocess.Popen:
    npm = _npm_cmd()
    env = os.environ.copy()
    env["PYTHON_AGENT_URL"] = f"http://127.0.0.1:{agent_port}"
    env["NEXT_PUBLIC_APP_URL"] = f"http://localhost:{dashboard_port}"
    return subprocess.Popen(
        npm + ["run", "dev", "--", "-p", str(dashboard_port)],
        cwd=str(DASHBOARD),
        env=env,
    )


def main() -> None:
    args = _parse_args()

    if args.agent_only and args.dashboard_only:
        print("Choose at most one of --agent-only and --dashboard-only.", file=sys.stderr)
        sys.exit(2)

    if args.agent_only:
        _run_agent_only(args.host, args.agent_port, args.reload)
        return

    if args.dashboard_only:
        code = _run_dashboard_only(args.dashboard_port)
        raise SystemExit(code)

    if not DASHBOARD.is_dir():
        print(f"Missing dashboard at {DASHBOARD}", file=sys.stderr)
        sys.exit(1)

    procs: list[subprocess.Popen] = []

    def cleanup(signum: int | None = None, _frame: object | None = None) -> None:
        for p in procs:
            if p.poll() is None:
                p.terminate()
        for p in procs:
            try:
                p.wait(timeout=8)
            except subprocess.TimeoutExpired:
                p.kill()
        if signum is not None:
            sys.exit(128 + signum)

    signal.signal(signal.SIGINT, cleanup)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, cleanup)

    base = f"http://localhost:{args.dashboard_port}"
    print(
        f"Muffs — agent http://127.0.0.1:{args.agent_port}  |  dashboard {base}\n"
        f"Open {base}/overview after the Next.js server is ready.\n",
        flush=True,
    )

    # Reload + multiprocess Next dev is awkward; use --agent-only for MUFFS_RELOAD.
    procs.append(_spawn_agent(args, uvicorn_reload=False))
    time.sleep(0.3)
    procs.append(_spawn_dashboard(args.agent_port, args.dashboard_port))

    try:
        while True:
            for p in procs:
                if p.poll() is not None:
                    print("A process exited; stopping the others.", file=sys.stderr)
                    cleanup()
                    raise SystemExit(p.returncode or 1)
            time.sleep(0.35)
    except KeyboardInterrupt:
        cleanup()
        sys.exit(0)


if __name__ == "__main__":
    main()
