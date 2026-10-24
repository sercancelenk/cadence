#!/usr/bin/env bash
# Cheap pre-pass for data-safety review: flags added lines in a diff that may delete,
# empty, or overwrite user data. Output is a lead list, not a verdict.
# Usage: scripts/data-safety-scan.sh [git-diff-range]   (default: HEAD, i.e. staged+unstaged)
set -euo pipefail

range="${1:-HEAD}"

patterns=(
  'splice\('
  '\.filter\('
  'delete [A-Za-z_.]+'
  '\.length *= *0'
  'replaceAll\('
  'emptyData\(|normalizeData\(null|createEmpty|scaffold'
  'persistBlocked'
  'unlink|rmSync|fs\.rm|rimraf|truncate'
  'writeFile(Sync)?\(|renameSync|\.rename\('
  'DATA_VERSION'
  'catch *(\([^)]*\))? *\{ *\}|\.catch\(\(\) *=> *(\[\]|\{\}|null|undefined)\)'
  'localStorage\.(removeItem|clear)'
  'Object\.assign\(|\{ *\.\.\.[A-Za-z_.]+ *,'
  'randomUUID|nanoid|uuid\(|newId\(|makeId\('
  'restore|import(Data|Workspace)|mergeWorkspace|lastWrite|updatedAt *[<>]'
)

RE="$(IFS='|'; echo "${patterns[*]}")"
export RE

emit_diff() {
  git diff "$range" -U0 --no-color -- 'src' 'electron' ':!*.test.ts' ':!*.test.tsx'
  # New untracked files are invisible to `git diff`; show them as all-added.
  if [ "$range" = "HEAD" ]; then
    git ls-files --others --exclude-standard -- 'src' 'electron' ':!*.test.ts' ':!*.test.tsx' \
      | while IFS= read -r f; do git diff --no-index -U0 --no-color /dev/null "$f" || true; done
  fi
}

emit_diff \
  | awk '
      /^\+\+\+ b\// { file = substr($0, 7); next }
      /^@@/ { match($0, /\+[0-9]+/); line = substr($0, RSTART + 1, RLENGTH - 1) + 0; next }
      /^\+/ { if ($0 ~ ENVIRON["RE"]) printf "%s:%d: %s\n", file, line, substr($0, 2); line++ }
    ' \
  | cut -c1-200
