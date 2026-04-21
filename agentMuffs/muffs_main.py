"""Top-level `muffs` CLI: setup, start (agent+dashboard), onboard, daemon (launchd/systemd)."""

from __future__ import annotations

import argparse
import http.client
import os
import shutil
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

DEFAULT_DASHBOARD_PORT = 3141


def _repo_root() -> Path:
    """Directory containing `pyproject.toml` (the Muffs clone)."""
    env = os.getenv("MUFFS_HOME", "").strip()
    if env:
        return Path(env).resolve()

    here = Path(__file__).resolve().parent.parent
    if (here / "pyproject.toml").is_file():
        return here

    cfg = Path.home() / ".config" / "muffs" / "env"
    if cfg.is_file():
        for line in cfg.read_text().splitlines():
            line = line.strip()
            if line.startswith("MUFFS_HOME="):
                p = Path(line.split("=", 1)[1].strip().strip('"')).expanduser()
                if p.is_dir():
                    return p.resolve()

    return here


def _venv_bin(repo: Path, name: str) -> Path:
    v = repo / ".venv" / "bin" / name
    if v.is_file():
        return v
    w = repo / ".venv" / "Scripts" / f"{name}.exe"
    if w.is_file():
        return w
    w2 = shutil.which(name)
    if w2:
        return Path(w2)
    return Path(name)


def _cmd_setup(_: argparse.Namespace) -> int:
    from agentMuffs.setup_cli import main as setup_main

    setup_main()
    return 0


def _wait_http_ok(host: str, port: int, path: str = "/", timeout: float = 60.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            conn = http.client.HTTPConnection(host, port, timeout=2)
            conn.request("GET", path)
            resp = conn.getresponse()
            conn.close()
            if resp.status < 500:
                return True
        except OSError:
            pass
        time.sleep(0.4)
    return False


def _cmd_onboard(ns: argparse.Namespace) -> int:
    repo = _repo_root()
    dash_port = int(os.getenv("MUFFS_DASHBOARD_PORT", str(DEFAULT_DASHBOARD_PORT)))
    onboard_url = f"http://127.0.0.1:{dash_port}/onboarding"

    if not _wait_http_ok("127.0.0.1", dash_port, "/", timeout=2.0):
        print("Starting Muffs (muffs-agent) in the background…", flush=True)
        log = repo / "muffs-agent.log"
        log.parent.mkdir(parents=True, exist_ok=True)
        exe = _venv_bin(repo, "muffs-agent")
        with open(log, "a", encoding="utf-8") as out:
            proc = subprocess.Popen(
                [str(exe)],
                cwd=str(repo),
                stdout=out,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        if not _wait_http_ok("127.0.0.1", dash_port, "/", timeout=90.0):
            proc.terminate()
            print(
                f"Dashboard did not become ready on port {dash_port}. "
                f"Check {log} or run: muffs start\n",
                file=sys.stderr,
            )
            return 1
        print("Dashboard is up.", flush=True)

    if not ns.no_browser:
        print(f"Opening {onboard_url}", flush=True)
        try:
            webbrowser.open(onboard_url)
        except Exception as e:
            print(f"Open this URL in your browser: {onboard_url}\n({e})", flush=True)
    else:
        print(onboard_url, flush=True)

    if ns.install_daemon:
        _cmd_daemon_install(argparse.Namespace())

    return 0


def _launch_agents_dir() -> Path:
    return Path.home() / "Library" / "LaunchAgents"


def _cmd_daemon_install(_: argparse.Namespace) -> int:
    if sys.platform == "win32":
        print(
            "Daemon install is not automated on Windows. Use Task Scheduler or WSL, or run `muffs start`.",
            file=sys.stderr,
        )
        return 1

    repo = _repo_root()
    exe = _venv_bin(repo, "muffs-agent")
    if not exe.exists():
        print(f"muffs-agent not found at {exe}. Run muffs-setup from {repo}.", file=sys.stderr)
        return 1

    if sys.platform == "darwin":
        label = "ai.muffs.agent"
        plist_dir = _launch_agents_dir()
        plist_dir.mkdir(parents=True, exist_ok=True)
        plist_path = plist_dir / f"{label}.plist"
        log_out = Path.home() / "Library" / "Logs" / "muffs-agent.log"
        log_out.parent.mkdir(parents=True, exist_ok=True)

        def esc(s: str) -> str:
            return (
                s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace('"', "&quot;")
            )

        plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{label}</string>
  <key>WorkingDirectory</key>
  <string>{esc(str(repo))}</string>
  <key>ProgramArguments</key>
  <array>
    <string>{esc(str(exe))}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>{esc(str(log_out))}</string>
  <key>StandardErrorPath</key>
  <string>{esc(str(log_out))}</string>
</dict>
</plist>
"""
        plist_path.write_text(plist, encoding="utf-8")
        subprocess.run(
            ["launchctl", "bootout", "gui/" + str(os.getuid()), str(plist_path)],
            capture_output=True,
        )
        r = subprocess.run(["launchctl", "bootstrap", "gui/" + str(os.getuid()), str(plist_path)])
        if r.returncode != 0:
            print(
                "launchctl bootstrap failed. Try: launchctl load -w " + str(plist_path),
                file=sys.stderr,
            )
            return r.returncode
        print(f"Installed Launch Agent: {plist_path}\nLogs: {log_out}")
        return 0

    # Linux: systemd user unit
    systemd = shutil.which("systemctl")
    if not systemd:
        print("systemctl not found. Install systemd or run `muffs start` manually.", file=sys.stderr)
        return 1

    unit_dir = Path.home() / ".config" / "systemd" / "user"
    unit_dir.mkdir(parents=True, exist_ok=True)
    unit_path = unit_dir / "muffs-agent.service"
    log_path = repo / "muffs-daemon.log"

    body = f"""[Unit]
Description=Muffs AI agent (FastAPI + Next.js)
After=network-online.target

[Service]
Type=simple
WorkingDirectory={repo}
ExecStart={exe}
Restart=on-failure
RestartSec=5
StandardOutput=append:{log_path}
StandardError=append:{log_path}

[Install]
WantedBy=default.target
"""
    unit_path.write_text(body, encoding="utf-8")
    subprocess.run([systemd, "--user", "daemon-reload"], check=False)
    r = subprocess.run(
        [systemd, "--user", "enable", "--now", "muffs-agent.service"],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0 and r.stderr:
        print(r.stderr, file=sys.stderr)
    print(f"Installed systemd user unit: {unit_path}\nLogs: {log_path}")
    if r.returncode != 0:
        print("If enable failed, run: systemctl --user enable --now muffs-agent.service")
    return 0 if r.returncode == 0 else r.returncode


def _cmd_daemon_uninstall(_: argparse.Namespace) -> int:
    if sys.platform == "darwin":
        label = "ai.muffs.agent"
        plist_path = _launch_agents_dir() / f"{label}.plist"
        if plist_path.is_file():
            subprocess.run(
                ["launchctl", "bootout", "gui/" + str(os.getuid()), str(plist_path)],
                capture_output=True,
            )
            plist_path.unlink(missing_ok=True)
            print(f"Removed {plist_path}")
        else:
            print("No Launch Agent plist found.", file=sys.stderr)
        return 0
    if sys.platform == "win32":
        print("Nothing to remove on Windows (daemon not installed via this tool).")
        return 0
    systemd = shutil.which("systemctl")
    if systemd:
        subprocess.run([systemd, "--user", "disable", "--now", "muffs-agent.service"], capture_output=True)
    unit = Path.home() / ".config" / "systemd" / "user" / "muffs-agent.service"
    unit.unlink(missing_ok=True)
    if shutil.which("systemctl"):
        subprocess.run(["systemctl", "--user", "daemon-reload"], capture_output=True)
    print("systemd user unit muffs-agent.service disabled and removed (if present).")
    return 0


def _cmd_daemon_status(_: argparse.Namespace) -> int:
    if sys.platform == "darwin":
        r = subprocess.run(["launchctl", "list"], capture_output=True, text=True)
        if r.stdout and "ai.muffs.agent" in r.stdout:
            print("Launch Agent ai.muffs.agent: loaded")
        else:
            print("Launch Agent ai.muffs.agent: not in launchctl list (not loaded?).")
        return 0
    if sys.platform != "win32" and shutil.which("systemctl"):
        subprocess.run(["systemctl", "--user", "status", "muffs-agent.service"], check=False)
    return 0


def main() -> None:
    if len(sys.argv) >= 2 and sys.argv[1] == "start":
        sys.argv = ["muffs-agent"] + sys.argv[2:]
        from agentMuffs.cli import main as agent_main

        agent_main()
        return

    parser = argparse.ArgumentParser(
        prog="muffs",
        description="Muffs — setup, run, onboard, and optional background daemon.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_setup = sub.add_parser("setup", help="Install Python + dashboard npm deps (same as muffs-setup).")
    p_setup.set_defaults(func=_cmd_setup)

    p_on = sub.add_parser("onboard", help="Open the onboarding wizard (starts the stack if needed).")
    p_on.add_argument(
        "--install-daemon",
        action="store_true",
        help="After onboarding, install a login daemon (launchd / systemd --user).",
    )
    p_on.add_argument(
        "--no-browser",
        action="store_true",
        help="Print the onboarding URL instead of opening a browser.",
    )
    p_on.set_defaults(func=_cmd_onboard)

    p_dm = sub.add_parser("daemon", help="Background service (macOS launchd / Linux systemd --user).")
    dm_sub = p_dm.add_subparsers(dest="daemon_cmd", required=True)
    d_install = dm_sub.add_parser("install", help="Install daemon to start muffs-agent at login.")
    d_install.set_defaults(func=_cmd_daemon_install)
    d_remove = dm_sub.add_parser("uninstall", help="Remove the daemon unit.")
    d_remove.set_defaults(func=_cmd_daemon_uninstall)
    d_stat = dm_sub.add_parser("status", help="Show daemon status (best-effort).")
    d_stat.set_defaults(func=_cmd_daemon_status)

    args = parser.parse_args()

    fn = args.func
    delattr(args, "func")
    code = fn(args)
    raise SystemExit(code if code is not None else 0)


if __name__ == "__main__":
    main()
