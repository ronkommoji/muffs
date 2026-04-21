#!/usr/bin/env bash
# One-liner (after you host the raw URL or use clone path):
#   curl -fsSL https://raw.githubusercontent.com/YOURUSER/muffs/main/scripts/install.sh | bash
#
# Or from an already-cloned repo:
#   bash scripts/install.sh
#
# Environment:
#   MUFFS_REPO   Git URL (default: https://github.com/yourusername/muffs.git)
#   MUFFS_HOME   Install directory (default: $HOME/.local/share/muffs)

set -euo pipefail

MUFFS_REPO="${MUFFS_REPO:-https://github.com/yourusername/muffs.git}"

# Default install dir: clone destination, or this repo when running `bash scripts/install.sh` locally.
MUFFS_HOME="${MUFFS_HOME:-}"
if [[ -z "$MUFFS_HOME" && -n "${BASH_SOURCE[0]:-}" ]]; then
  _here="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || true
  if [[ -n "$_here" && -f "$_here/../pyproject.toml" ]]; then
    MUFFS_HOME="$(cd "$_here/.." && pwd)"
  fi
fi
MUFFS_HOME="${MUFFS_HOME:-$HOME/.local/share/muffs}"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"
CFG_DIR="${CFG_DIR:-$HOME/.config/muffs}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing dependency: $1" >&2
    exit 1
  }
}

need git
need python3
need npm

PY_MINOR="$(python3 -c 'import sys; print(sys.version_info.minor)')"
PY_MAJOR="$(python3 -c 'import sys; print(sys.version_info.major)')"
if [[ "$PY_MAJOR" -lt 3 ]] || [[ "$PY_MAJOR" -eq 3 && "$PY_MINOR" -lt 11 ]]; then
  echo "Python 3.11+ required (found $(python3 -V))" >&2
  exit 1
fi

if [[ ! -d "$MUFFS_HOME/.git" ]]; then
  echo "Cloning Muffs into $MUFFS_HOME ..."
  mkdir -p "$(dirname "$MUFFS_HOME")"
  git clone --depth 1 "$MUFFS_REPO" "$MUFFS_HOME"
else
  echo "Using existing clone at $MUFFS_HOME"
fi

cd "$MUFFS_HOME"

if [[ ! -d .venv ]]; then
  echo "Creating Python virtualenv (.venv) ..."
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "Installing Python package (editable) ..."
python -m pip install -U pip
python -m pip install -e .

echo "Installing dashboard npm dependencies ..."
(cd dashboard && npm install)

echo "Writing $CFG_DIR/env ..."
mkdir -p "$CFG_DIR"
echo "MUFFS_HOME=$MUFFS_HOME" >"$CFG_DIR/env"

mkdir -p "$BIN_DIR"
VENV_BIN="$MUFFS_HOME/.venv/bin"
for cmd in muffs muffs-agent muffs-setup; do
  if [[ -x "$VENV_BIN/$cmd" ]]; then
    echo "Linking $BIN_DIR/$cmd -> $VENV_BIN/$cmd"
    ln -sf "$VENV_BIN/$cmd" "$BIN_DIR/$cmd"
  else
    echo "Warning: missing $VENV_BIN/$cmd (re-run after pip install -e .)" >&2
  fi
done

echo ""
echo "Muffs is installed at: $MUFFS_HOME"
echo "Config stub: $CFG_DIR/env"
echo ""
echo "Next:"
echo "  1. Add to PATH: export PATH=\"$BIN_DIR:\$PATH\"  (e.g. in ~/.zshrc or ~/.bashrc)"
echo "  2. cp $MUFFS_HOME/.env.example $MUFFS_HOME/.env   # add API keys"
echo "  3. Initialize DB (see README) then: muffs onboard"
echo "  4. Optional background service: muffs onboard --install-daemon"
echo ""
