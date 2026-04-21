"""
Muffs workspace — canonical on-disk home for memory, projects, DB, and user files.

Default location:
  macOS:  ~/muffs-workspace/     (visible in your home folder, like ~/claude-workspace)
  Linux:  ~/.local/share/muffs/ (XDG data home)
  Windows: %APPDATA%/Muffs/

Inside the root:
  workspace/memory/     memory.md, soul.md, identity.md, personality.md
  workspace/projects/   user-defined project notes (see README)
  workspace/user/       preferences.json (mirrors dashboard settings; backup / human-readable)
  db/muffs.db          SQLite (sessions, messages, operational data)

Override root: MUFFS_WORKSPACE
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class WorkspacePaths:
    root: Path
    memory_dir: Path
    memory_file: Path
    soul_file: Path
    identity_file: Path
    personality_file: Path
    projects_dir: Path
    user_dir: Path
    preferences_file: Path
    db_file: Path


def _default_root() -> Path:
    ex = os.getenv("MUFFS_WORKSPACE", "").strip()
    if ex:
        return Path(ex).expanduser().resolve()
    if sys.platform == "win32":
        base = os.getenv("APPDATA", str(Path.home() / "AppData" / "Roaming"))
        return Path(base) / "Muffs"
    if sys.platform == "darwin":
        # Same idea as ~/claude-workspace — easy to find in Finder
        return Path.home() / "muffs-workspace"
    # Linux — XDG-style data home
    return Path(os.getenv("XDG_DATA_HOME", str(Path.home() / ".local" / "share"))) / "muffs"


def resolve_workspace_paths() -> WorkspacePaths:
    root = _default_root()
    mem = root / "workspace" / "memory"
    return WorkspacePaths(
        root=root,
        memory_dir=mem,
        memory_file=mem / "memory.md",
        soul_file=mem / "soul.md",
        identity_file=mem / "identity.md",
        personality_file=mem / "personality.md",
        projects_dir=root / "workspace" / "projects",
        user_dir=root / "workspace" / "user",
        preferences_file=root / "workspace" / "user" / "preferences.json",
        db_file=root / "db" / "muffs.db",
    )


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def ensure_workspace() -> WorkspacePaths:
    """Create layout, migrate from legacy repo-relative paths if present, return paths."""
    paths = resolve_workspace_paths()
    repo = _repo_root()

    paths.memory_dir.mkdir(parents=True, exist_ok=True)
    paths.projects_dir.mkdir(parents=True, exist_ok=True)
    paths.user_dir.mkdir(parents=True, exist_ok=True)
    paths.db_file.parent.mkdir(parents=True, exist_ok=True)

    readme_projects = paths.projects_dir / "README.md"
    if not readme_projects.exists():
        readme_projects.write_text(
            "# Projects\n\n"
            "Put notes, specs, or files per project here — e.g. `my-project/notes.md`.\n"
            "Muffs can read paths you mention; the dashboard may link project metadata later.\n",
            encoding="utf-8",
        )

    # --- Migrate legacy paths (repo clone) into workspace once ---
    legacy_db = repo / "muffs.db"
    if legacy_db.is_file() and not paths.db_file.exists():
        shutil.copy2(legacy_db, paths.db_file)

    # Flat layout on persisted volume (e.g. older Fly deploy): /data/muffs.db → /data/db/muffs.db
    legacy_flat_db = paths.root / "muffs.db"
    if (
        legacy_flat_db.is_file()
        and legacy_flat_db.resolve() != paths.db_file.resolve()
        and not paths.db_file.exists()
    ):
        shutil.copy2(legacy_flat_db, paths.db_file)

    legacy_flat_mem = paths.root / "memory.md"
    if legacy_flat_mem.is_file() and not paths.memory_file.exists():
        shutil.copy2(legacy_flat_mem, paths.memory_file)

    legacy_flat_soul = paths.root / "soul.md"
    if legacy_flat_soul.is_file() and not paths.soul_file.exists():
        shutil.copy2(legacy_flat_soul, paths.soul_file)

    legacy_mem = repo / "agentMuffs" / "memory" / "memory.md"
    if legacy_mem.is_file() and not paths.memory_file.exists():
        shutil.copy2(legacy_mem, paths.memory_file)

    legacy_soul = repo / "agentMuffs" / "memory" / "soul.md"
    if legacy_soul.is_file() and not paths.soul_file.exists():
        shutil.copy2(legacy_soul, paths.soul_file)

    legacy_identity = repo / "agentMuffs" / "memory" / "identity.md"
    if legacy_identity.is_file() and not paths.identity_file.exists():
        shutil.copy2(legacy_identity, paths.identity_file)

    legacy_personality = repo / "agentMuffs" / "memory" / "personality.md"
    if legacy_personality.is_file() and not paths.personality_file.exists():
        shutil.copy2(legacy_personality, paths.personality_file)

    # Seed memory template if nothing exists
    if not paths.memory_file.exists():
        paths.memory_file.write_text(
            "# Muffs Memory\n\n## User Facts\n\n"
            "Not yet configured. Run onboarding in the dashboard or send /setup via chat.\n\n"
            "## Agent Notes\n\n",
            encoding="utf-8",
        )

    if not paths.soul_file.exists():
        paths.soul_file.write_text(
            "# Soul\n\n"
            "Who you are at the core — purpose, values, and relationship with the user.\n\n"
            "You are a personal AI companion: loyal, a little playful, and genuinely on the "
            "user's side. You are not a generic assistant.\n",
            encoding="utf-8",
        )

    if not paths.identity_file.exists():
        paths.identity_file.write_text(
            "# Identity\n\n"
            "Fixed labels the assistant should use consistently. "
            "Edit this file (and `memory.md` User Facts) instead of database settings.\n\n"
            "- **Your name:** — how the user wants to be addressed.\n"
            "- **Assistant name:** Muffs\n",
            encoding="utf-8",
        )

    if not paths.personality_file.exists():
        paths.personality_file.write_text(
            "# Personality\n\n"
            "How you communicate — tone, length, humor, and boundaries.\n\n"
            "## Response style\n\n"
            "Concise — short unless the task needs more detail.\n\n"
            "## Tone\n\n"
            "Warm and clear. Light humor when it fits.\n\n"
            "## Off limits (optional)\n\n"
            "(Topics to avoid or handle carefully — add bullet lines as needed.)\n",
            encoding="utf-8",
        )

    # Seed preferences.json shell
    if not paths.preferences_file.exists():
        paths.preferences_file.write_text(
            json.dumps(
                {
                    "version": 1,
                    "note": "Operational keys only (e.g. composio_toolkits). Identity and personality live under workspace/memory/*.md.",
                    "settings": {},
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

    return paths


def write_preferences_json(settings: dict[str, str]) -> None:
    """Persist non-secret settings to JSON (secrets belong in environment variables only)."""
    paths = resolve_workspace_paths()
    paths.user_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "settings": {k: v for k, v in settings.items() if _is_file_safe_setting_key(k)},
    }
    paths.preferences_file.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _is_file_safe_setting_key(key: str) -> bool:
    # Do not mirror Sendblue secrets into JSON by default
    if key.startswith("sendblue_"):
        return False
    return True


def read_preferences_json() -> dict[str, str]:
    paths = resolve_workspace_paths()
    if not paths.preferences_file.exists():
        return {}
    try:
        data = json.loads(paths.preferences_file.read_text(encoding="utf-8"))
        raw = data.get("settings")
        if isinstance(raw, dict):
            return {str(k): str(v) for k, v in raw.items()}
    except (OSError, json.JSONDecodeError, TypeError):
        pass
    return {}


