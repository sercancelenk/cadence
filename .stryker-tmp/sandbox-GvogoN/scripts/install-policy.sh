#!/usr/bin/env bash
#
# Cadence enterprise policy installer — macOS / Linux.
#
# Drops a `policy.json` into the highest-precedence path Cadence can read
# WITHOUT requiring MDM. The file is owned by root and made read-only for
# regular users, so the gated features (sync, AI, export…) cannot be
# re-enabled from the app UI or by editing the file as a normal user.
#
# Usage:
#   ./scripts/install-policy.sh <path/to/policy.json>            # macOS or Linux
#   sudo ./scripts/install-policy.sh ./policy.example.json
#   ./scripts/install-policy.sh --validate ./my-policy.json      # dry-run validation only
#
# Re-run with a different source to update; the installer overwrites the
# existing policy atomically (mv from a tmp file inside the same dir).
#
# Exit codes:
#   0 — installed / validated successfully
#   1 — invalid arguments or source file missing
#   2 — source JSON is malformed or fails the schema check
#   3 — destination is not writable (re-run with sudo)
#   4 — atomic install failed mid-flight (system reports details; existing
#       file is unchanged because we mv into place after fsync)

set -euo pipefail

PROG_NAME="$(basename "$0")"

usage() {
  cat <<USAGE
Usage:
  $PROG_NAME <source-policy.json>             Install (requires root on a
                                              shared-device deployment)
  $PROG_NAME --validate <source-policy.json>  Validate only, no install
  $PROG_NAME --uninstall                      Remove the installed policy
                                              (requires root)
  $PROG_NAME -h | --help                      This message
USAGE
}

die() {
  echo "ERROR: $*" >&2
  exit "${2:-1}"
}

# ── Resolve destination path per OS ──────────────────────────────────────────
case "$(uname -s)" in
  Darwin)
    DEST_DIR="/Library/Application Support/Cadence"
    ;;
  Linux)
    DEST_DIR="/etc/cadence"
    ;;
  *)
    die "Unsupported OS: $(uname -s). Use the Windows installer for Windows."
    ;;
esac
DEST_FILE="$DEST_DIR/policy.json"

# ── Parse args ──────────────────────────────────────────────────────────────
MODE="install"
SOURCE=""

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
  --uninstall)
    MODE="uninstall"
    ;;
  --validate)
    MODE="validate"
    SOURCE="${2:-}"
    [[ -n "$SOURCE" ]] || { usage; die "missing source file" 1; }
    ;;
  '')
    usage
    die "missing source file" 1
    ;;
  *)
    SOURCE="$1"
    ;;
esac

# ── Validation helper ───────────────────────────────────────────────────────
# Uses python3 (universally available on macOS + most Linux distros) so we
# don't need a Node toolchain on the target machine. If python3 is missing
# we fall back to a no-op (best effort) — the renderer's parsePolicy() will
# reject malformed JSON anyway.
validate_json() {
  local f="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$f" <<'PY' || return $?
import json, sys
path = sys.argv[1]
try:
    with open(path, 'r', encoding='utf-8') as fp:
        data = json.load(fp)
except Exception as e:
    print(f"JSON parse error: {e}", file=sys.stderr)
    sys.exit(2)

if not isinstance(data, dict):
    print("policy must be a JSON object", file=sys.stderr)
    sys.exit(2)

valid_presets = {"personal", "work-standard", "work-strict"}
preset = data.get("preset")
features = data.get("features")
if preset is None and features is None:
    print("policy must specify a 'preset' OR a 'features' object", file=sys.stderr)
    sys.exit(2)
if preset is not None and preset not in valid_presets:
    print(f"unknown preset {preset!r}; valid: {sorted(valid_presets)}", file=sys.stderr)
    sys.exit(2)
if features is not None and not isinstance(features, dict):
    print("'features' must be an object", file=sys.stderr)
    sys.exit(2)
managed_by = data.get("managedBy")
if managed_by is not None and not isinstance(managed_by, str):
    print("'managedBy' must be a string", file=sys.stderr)
    sys.exit(2)
print(f"OK: policy is valid (preset={preset or '—'}, features={'yes' if features else 'no'}, managedBy={managed_by or '—'})")
PY
  else
    echo "WARN: python3 not found; skipping schema validation (Cadence will reject malformed JSON at runtime)" >&2
  fi
}

# ── Uninstall mode ──────────────────────────────────────────────────────────
if [[ "$MODE" == "uninstall" ]]; then
  if [[ ! -e "$DEST_FILE" ]]; then
    echo "Nothing to do: $DEST_FILE does not exist."
    exit 0
  fi
  if ! rm -f "$DEST_FILE" 2>/dev/null; then
    die "could not remove $DEST_FILE (re-run with sudo?)" 3
  fi
  echo "Removed: $DEST_FILE"
  echo "Restart Cadence on this device to apply."
  exit 0
fi

# ── Source resolution + validation ──────────────────────────────────────────
[[ -f "$SOURCE" ]] || die "source file not found: $SOURCE" 1
validate_json "$SOURCE" || die "source policy is invalid" 2

if [[ "$MODE" == "validate" ]]; then
  exit 0
fi

# ── Install mode ────────────────────────────────────────────────────────────
echo "Installing policy to: $DEST_FILE"

if ! mkdir -p "$DEST_DIR" 2>/dev/null; then
  die "could not create $DEST_DIR (re-run with sudo?)" 3
fi

# Atomic write: copy into a temp file in the SAME directory, fsync via
# `sync`, then `mv` it over the target. mv-within-the-same-filesystem is
# atomic on POSIX, so a power loss mid-install leaves either the old file
# or the new file — never a torn one. Same pattern Cadence's main process
# uses for its data file.
TMP="$(mktemp "$DEST_DIR/.policy.json.XXXXXXXX")" || die "could not create temp file in $DEST_DIR" 3
trap 'rm -f "$TMP"' EXIT

if ! cp "$SOURCE" "$TMP"; then
  die "copy failed" 4
fi
chmod 0644 "$TMP" || die "chmod failed" 4
# Sync once so the bytes are on durable storage before the rename.
sync || true

if ! mv -f "$TMP" "$DEST_FILE"; then
  die "atomic rename failed; original $DEST_FILE (if any) is intact" 4
fi
trap - EXIT  # successful — don't delete the now-active file

# On macOS, make sure root owns the file so end users can't trivially
# overwrite it via Finder. On Linux we follow the same pattern.
if command -v chown >/dev/null 2>&1; then
  if [[ "$(uname -s)" == "Darwin" ]]; then
    chown root:wheel "$DEST_FILE" 2>/dev/null || true
  else
    chown root:root "$DEST_FILE" 2>/dev/null || true
  fi
fi

echo "✔ Installed."
echo
echo "Next steps:"
echo "  1. Quit Cadence completely (Cmd+Q on macOS) and reopen it."
echo "  2. Open Settings → App profile."
echo "  3. Confirm the badge reads 'Managed by organization' and the policy"
echo "     path matches: $DEST_FILE"
echo
echo "Higher-precedence paths (if you ever need MDM-grade enforcement):"
case "$(uname -s)" in
  Darwin)
    echo "  /Library/Managed Preferences/cadence.policy.json    (MDM)"
    echo "  Cadence.app/Contents/Resources/policy.json          (bundled, requires resign)"
    ;;
  Linux)
    echo "  (this script already used the highest-precedence non-MDM path)"
    ;;
esac
