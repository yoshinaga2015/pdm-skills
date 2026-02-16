#!/usr/bin/env bash
set -euo pipefail

REPO_OWNER="yoshinaga2015"
REPO_NAME="pdm-skills"
REF="main"
MODE="project"
DEST=""

print_help() {
  cat <<'EOF'
Install pdm-skills into Cursor skills directories.

Usage:
  install.sh [--project|--global|--dest PATH] [--ref REF]

Options:
  --project       Install to ./.cursor/skills (default)
  --global        Install to ~/.cursor/skills
  --dest PATH     Install to a custom destination path
  --ref REF       Git ref to install (branch/tag/sha). Default: main
  -h, --help      Show this help message

Examples:
  install.sh
  install.sh --global
  install.sh --dest "$HOME/.cursor/skills" --ref main
EOF
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: required command not found: $cmd" >&2
    exit 1
  fi
}

expand_home() {
  local path="$1"
  if [[ "$path" == "~/"* ]]; then
    printf "%s/%s\n" "$HOME" "${path#~/}"
  else
    printf "%s\n" "$path"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      MODE="project"
      DEST=""
      shift
      ;;
    --global)
      MODE="global"
      DEST=""
      shift
      ;;
    --dest)
      if [[ $# -lt 2 ]]; then
        echo "Error: --dest requires a path argument" >&2
        exit 1
      fi
      MODE="custom"
      DEST="$(expand_home "$2")"
      shift 2
      ;;
    --ref)
      if [[ $# -lt 2 ]]; then
        echo "Error: --ref requires a value" >&2
        exit 1
      fi
      REF="$2"
      shift 2
      ;;
    -h|--help)
      print_help
      exit 0
      ;;
    *)
      echo "Error: unknown option: $1" >&2
      print_help >&2
      exit 1
      ;;
  esac
done

case "$MODE" in
  project)
    DEST="$(pwd)/.cursor/skills"
    ;;
  global)
    DEST="$HOME/.cursor/skills"
    ;;
  custom)
    ;;
esac

require_cmd curl
require_cmd tar
require_cmd rsync
require_cmd mktemp

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

ARCHIVE_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${REF}.tar.gz"
if [[ "$REF" != "main" ]]; then
  ARCHIVE_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/${REF}.tar.gz"
fi

echo "Downloading ${REPO_OWNER}/${REPO_NAME}@${REF} ..."
curl -fsSL "$ARCHIVE_URL" | tar -xz -C "$TMP_DIR"

EXTRACTED_ROOT="$(printf '%s\n' "$TMP_DIR"/"${REPO_NAME}"-* | head -n 1)"
SOURCE_DIR="${EXTRACTED_ROOT}/skills"
if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Error: skills directory not found in downloaded archive." >&2
  exit 1
fi

mkdir -p "$DEST"

installed_count=0
installed_names=()
shopt -s nullglob
for skill_md in "$SOURCE_DIR"/*/SKILL.md; do
  skill_dir="$(basename "$(dirname "$skill_md")")"
  rsync -a --delete "$(dirname "$skill_md")/" "$DEST/$skill_dir/"
  installed_names+=("$skill_dir")
  installed_count=$((installed_count + 1))
done
shopt -u nullglob

if [[ "$installed_count" -eq 0 ]]; then
  echo "Warning: no skills were found in the source archive."
  exit 1
fi

echo "Installed ${installed_count} skill(s) to: $DEST"
printf ' - %s\n' "${installed_names[@]}"
echo "Done."
