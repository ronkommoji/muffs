"""One-time install: `muffs-setup` — Python package + dashboard npm dependencies."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DASHBOARD = ROOT / "dashboard"


def main() -> None:
    print("Installing Python package (editable)…")
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "-e", "."],
        cwd=str(ROOT),
    )

    try:
        from agentMuffs.workspace import ensure_workspace

        paths = ensure_workspace()
        print(f"Workspace ready: {paths.root}")
    except Exception as e:
        print(f"Warning: could not initialize workspace: {e}", file=sys.stderr)

    npm = shutil.which("npm")
    if not npm:
        print(
            "npm not found. Install Node.js 20+, then run:\n"
            f"  cd {DASHBOARD} && npm install",
            file=sys.stderr,
        )
        sys.exit(1)

    print("Installing dashboard dependencies…")
    subprocess.check_call([npm, "install"], cwd=str(DASHBOARD))

    print("\nDone. Copy .env.example to .env, then run:\n  muffs-agent\n")


if __name__ == "__main__":
    main()
