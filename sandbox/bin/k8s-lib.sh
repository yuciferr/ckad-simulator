# CKAD Simulator — shared kubectl session state helpers

SESSION_DIR="${SANDBOX_K8S}/session"
MOCK_NS_FILE="${SESSION_DIR}/mock-namespaces.txt"
mkdir -p "$SESSION_DIR" 2>/dev/null

_has_flag() {
  local flag="$1"; shift
  for a in "$@"; do
    [[ "$a" == "$flag" ]] && return 0
  done
  return 1
}

has_all_namespaces() {
  _has_flag "-A" "$@" || _has_flag "--all-namespaces" "$@"
}

# Namespaces enabled for this exam session (mock exam fixtures)
get_session_mock_namespaces() {
  [[ -f "$MOCK_NS_FILE" ]] || return 0
  while IFS= read -r line; do
    [[ -n "$line" && "$line" != \#* ]] && echo "$line"
  done < "$MOCK_NS_FILE"
}

is_mock_namespace_enabled() {
  local ns="$1"
  local enabled
  while IFS= read -r enabled; do
    [[ "$enabled" == "$ns" ]] && return 0
  done < <(get_session_mock_namespaces)
  return 1
}

session_ns_dir() {
  echo "${SESSION_DIR}/ns/${1}"
}

ensure_session_ns() {
  local ns="$1"
  mkdir -p "$(session_ns_dir "$ns")"
  touch "${SESSION_DIR}/namespaces.txt"
  if ! command grep -qxF "$ns" "${SESSION_DIR}/namespaces.txt" 2>/dev/null; then
    echo "$ns" >> "${SESSION_DIR}/namespaces.txt"
  fi
}

is_session_namespace() {
  local ns="$1"
  [[ -f "${SESSION_DIR}/namespaces.txt" ]] && command grep -qxF "$ns" "${SESSION_DIR}/namespaces.txt"
}

list_visible_namespaces() {
  echo "default"
  echo "kube-system"
  if [[ -f "${SESSION_DIR}/namespaces.txt" ]]; then
    while IFS= read -r ns; do
      [[ -n "$ns" ]] && echo "$ns"
    done < "${SESSION_DIR}/namespaces.txt"
  fi
  get_session_mock_namespaces
}

_ns_age() {
  local meta_file="$1"
  local name="$2"
  if [[ -f "$meta_file" ]]; then
    local created
    created=$(command grep "^${name}:" "$meta_file" 2>/dev/null | cut -d: -f2)
    if [[ -n "$created" ]]; then
      local now diff
      now=$(date +%s)
      diff=$((now - created))
      if (( diff < 60 )); then echo "${diff}s"; return; fi
      if (( diff < 3600 )); then echo "$((diff / 60))m"; return; fi
      echo "$((diff / 3600))h"
      return
    fi
  fi
  echo "30s"
}

_set_resource_meta() {
  local meta_file="$1"
  local name="$2"
  command grep -v "^${name}:" "$meta_file" 2>/dev/null > "${meta_file}.tmp" || true
  echo "${name}:$(date +%s)" >> "${meta_file}.tmp"
  mv "${meta_file}.tmp" "$meta_file"
}

add_pod_to_session() {
  local ns="$1" name="$2" ready="${3:-1/1}" status="${4:-Running}" restarts="${5:-0}"
  ensure_session_ns "$ns"
  local dir pod_file meta_file
  dir="$(session_ns_dir "$ns")"
  pod_file="${dir}/pods.txt"
  meta_file="${dir}/pods.meta"

  if [[ ! -f "$pod_file" ]]; then
    echo "NAME                              READY   STATUS    RESTARTS   AGE" > "$pod_file"
  else
    command grep -vi "^${name}[[:space:]]" "$pod_file" > "${pod_file}.tmp" 2>/dev/null || true
    head -1 "$pod_file" > "$pod_file"
    tail -n +2 "${pod_file}.tmp" 2>/dev/null >> "$pod_file" || true
    rm -f "${pod_file}.tmp"
  fi

  local age
  age=$(_ns_age "$meta_file" "$name")
  printf '%-33s %-7s %-9s %-10s %s\n' "$name" "$ready" "$status" "$restarts" "$age" >> "$pod_file"
  _set_resource_meta "$meta_file" "$name"
}

add_deploy_to_session() {
  local ns="$1" name="$2" ready="${3:-1/1}" up_to_date="${4:-1}" available="${5:-1}"
  ensure_session_ns "$ns"
  local dir deploy_file meta_file
  dir="$(session_ns_dir "$ns")"
  deploy_file="${dir}/deploy.txt"
  meta_file="${dir}/deploy.meta"

  if [[ ! -f "$deploy_file" ]]; then
    echo "NAME   READY   UP-TO-DATE   AVAILABLE   AGE" > "$deploy_file"
  else
    command grep -vi "^${name}[[:space:]]" "$deploy_file" > "${deploy_file}.tmp" 2>/dev/null || true
    head -1 "$deploy_file" > "$deploy_file"
    tail -n +2 "${deploy_file}.tmp" 2>/dev/null >> "$deploy_file" || true
    rm -f "${deploy_file}.tmp"
  fi

  local age
  age=$(_ns_age "$meta_file" "$name")
  printf '%-6s %-7s %-12s %-11s %s\n' "$name" "$ready" "$up_to_date" "$available" "$age" >> "$deploy_file"
  _set_resource_meta "$meta_file" "$name"
}

# Merge mock fixture + session-created resources for list output
get_resource_list() {
  local ns="$1" resource_file="$2"
  local mock_file session_file
  mock_file="${SANDBOX_K8S}/mock/${ns}/${resource_file}.txt"
  session_file="$(session_ns_dir "$ns")/${resource_file}.txt"

  local header=""
  local body=""

  if is_mock_namespace_enabled "$ns" && [[ -f "$mock_file" ]]; then
    header=$(head -1 "$mock_file")
    body=$(tail -n +2 "$mock_file" 2>/dev/null)
  fi

  if [[ -f "$session_file" ]]; then
    [[ -z "$header" ]] && header=$(head -1 "$session_file")
    local session_body
    session_body=$(tail -n +2 "$session_file" 2>/dev/null)
    if [[ -n "$body" && -n "$session_body" ]]; then
      body="${body}"$'\n'"${session_body}"
    elif [[ -n "$session_body" ]]; then
      body="$session_body"
    fi
  fi

  if [[ -n "$header" ]]; then
    echo "$header"
    [[ -n "$body" ]] && echo "$body"
    return 0
  fi
  return 1
}

register_resource_from_yaml() {
  local yaml_file="$1"
  [[ -f "$yaml_file" ]] || return 0

  local kind name ns
  kind=$(command grep -m1 '^kind:' "$yaml_file" 2>/dev/null | awk '{print $2}')
  name=$(command grep -m1 '^  name:' "$yaml_file" 2>/dev/null | awk '{print $2}')
  [[ -z "$name" ]] && name=$(command grep -m1 '^name:' "$yaml_file" 2>/dev/null | awk '{print $2}')
  ns=$(command grep -m1 '^  namespace:' "$yaml_file" 2>/dev/null | awk '{print $2}')
  [[ -z "$ns" ]] && ns=$(current_ns)

  case "$kind" in
    Pod) add_pod_to_session "$ns" "$name" ;;
    Deployment) add_deploy_to_session "$ns" "$name" ;;
    Namespace) ensure_session_ns "$name" ;;
  esac
}
