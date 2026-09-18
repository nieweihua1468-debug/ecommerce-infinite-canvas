#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
project_root="$(CDPATH= cd -- "$script_dir/.." && pwd -P)"
data_root="$project_root/data"

apply=0
scope="transient"
retention_days=30

usage() {
  cat <<'EOF'
Usage: ./deploy/cleanup-server.sh [--dry-run] [--apply] [--scope transient|generated] [--days N]

Defaults to a dry run over transient files only. The generated scope also
considers ordinary files in data/generated, but skips every path still
referenced by a top-level data/*.json record.

  --dry-run          Print candidates without deleting (default)
  --apply            Delete the selected, unreferenced candidates
  --scope transient  Only *.tmp, *.part, *.upload and dot-temp files
  --scope generated  All old files under data/generated (reference-aware)
  --days N           Minimum age in whole days (default: 30, minimum: 1)
EOF
}

while (( $# > 0 )); do
  case "$1" in
    --dry-run)
      apply=0
      shift
      ;;
    --apply)
      apply=1
      shift
      ;;
    --scope)
      [[ $# -ge 2 ]] || { printf 'Missing value for --scope\n' >&2; exit 2; }
      scope="$2"
      shift 2
      ;;
    --days)
      [[ $# -ge 2 ]] || { printf 'Missing value for --days\n' >&2; exit 2; }
      retention_days="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

[[ "$scope" == "transient" || "$scope" == "generated" ]] || {
  printf 'Scope must be transient or generated\n' >&2
  exit 2
}
[[ "$retention_days" =~ ^[0-9]+$ ]] && (( retention_days >= 1 )) || {
  printf 'Retention days must be an integer of at least 1\n' >&2
  exit 2
}

target_dir="$data_root/generated"
if [[ ! -d "$target_dir" ]]; then
  printf 'No generated directory: %s\n' "$target_dir"
  exit 0
fi
if [[ -L "$data_root" || -L "$target_dir" ]]; then
  printf 'Refusing symlinked cleanup root\n' >&2
  exit 1
fi

canonical_target="$(CDPATH= cd -- "$target_dir" && pwd -P)"
[[ "$canonical_target" == "$data_root/generated" ]] || {
  printf 'Refusing unexpected cleanup target: %s\n' "$canonical_target" >&2
  exit 1
}

json_records=()
while IFS= read -r -d '' json_record; do
  json_records+=("$json_record")
done < <(find "$data_root" -maxdepth 1 -type f -name '*.json' -print0)

referenced() {
  local relative_path="$1"
  local base_name="${relative_path##*/}"
  if (( ${#json_records[@]} == 0 )); then
    return 1
  fi
  grep -Fq -- "$relative_path" "${json_records[@]}" 2>/dev/null ||
    grep -Fq -- "$base_name" "${json_records[@]}" 2>/dev/null
}

candidate_count=0
skipped_count=0
deleted_count=0
find_expression=(-type f -mtime "+$retention_days")
if [[ "$scope" == "transient" ]]; then
  find_expression+=( '(' -name '*.tmp' -o -name '*.part' -o -name '*.upload' -o -name '.*.tmp' ')' )
fi

while IFS= read -r -d '' candidate; do
  [[ "$candidate" == "$canonical_target/"* ]] || {
    printf 'Refusing out-of-scope path: %s\n' "$candidate" >&2
    exit 1
  }
  [[ ! -L "$candidate" ]] || continue
  relative_path="${candidate#"$project_root/"}"
  if referenced "$relative_path"; then
    printf 'SKIP referenced %s\n' "$relative_path"
    skipped_count=$((skipped_count + 1))
    continue
  fi
  candidate_count=$((candidate_count + 1))
  if (( apply == 1 )); then
    rm -- "$candidate"
    printf 'DELETE %s\n' "$relative_path"
    deleted_count=$((deleted_count + 1))
  else
    printf 'DRY-RUN %s\n' "$relative_path"
  fi
done < <(find "$canonical_target" "${find_expression[@]}" -print0)

printf 'mode=%s scope=%s retention_days=%s candidates=%s skipped_referenced=%s deleted=%s\n' \
  "$([[ $apply -eq 1 ]] && printf apply || printf dry-run)" \
  "$scope" \
  "$retention_days" \
  "$candidate_count" \
  "$skipped_count" \
  "$deleted_count"

