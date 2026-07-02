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

pod_detail_dir() {
  echo "$(session_ns_dir "$1")/pods.d"
}

pod_detail_file() {
  echo "$(pod_detail_dir "$1")/${2}"
}

ensure_session_ns() {
  local ns="$1"
  mkdir -p "$(session_ns_dir "$ns")"
  mkdir -p "$(pod_detail_dir "$ns")"
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

pod_ip_for() {
  local name="$1"
  local hash oct3 oct4
  hash=$(printf '%s' "$name" | cksum | awk '{print $1}')
  oct3=$(( (hash % 250) + 1 ))
  oct4=$(( (hash / 250 % 250) + 1 ))
  echo "10.1.${oct3}.${oct4}"
}

pod_exists() {
  [[ -f "$(pod_detail_file "$1" "$2")" ]]
}

read_pod_field() {
  local ns="$1" name="$2" field="$3"
  local f
  f="$(pod_detail_file "$ns" "$name")"
  [[ -f "$f" ]] || return 1
  command grep -m1 "^${field}=" "$f" 2>/dev/null | cut -d= -f2-
}

write_pod_field() {
  local ns="$1" name="$2" field="$3" value="$4"
  local f
  f="$(pod_detail_file "$ns" "$name")"
  ensure_session_ns "$ns"
  if [[ -f "$f" ]]; then
    command grep -v "^${field}=" "$f" > "${f}.tmp" 2>/dev/null || true
    mv "${f}.tmp" "$f"
  else
    : > "$f"
  fi
  echo "${field}=${value}" >> "$f"
}

read_pod_label() {
  local ns="$1" name="$2" key="$3"
  local f
  f="$(pod_detail_file "$ns" "$name")"
  [[ -f "$f" ]] || return 1
  command grep -m1 "^label_${key}=" "$f" 2>/dev/null | cut -d= -f2-
}

write_pod_label() {
  local ns="$1" name="$2" key="$3" value="$4"
  local f
  f="$(pod_detail_file "$ns" "$name")"
  ensure_session_ns "$ns"
  [[ -f "$f" ]] || init_pod_detail "$ns" "$name" "nginx" "$name"
  command grep -v "^label_${key}=" "$f" > "${f}.tmp" 2>/dev/null || cp "$f" "${f}.tmp"
  echo "label_${key}=${value}" >> "${f}.tmp"
  mv "${f}.tmp" "$f"
}

remove_pod_label() {
  local ns="$1" name="$2" key="$3"
  local f
  f="$(pod_detail_file "$ns" "$name")"
  [[ -f "$f" ]] || return 0
  command grep -v "^label_${key}=" "$f" > "${f}.tmp" 2>/dev/null || true
  mv "${f}.tmp" "$f"
}

read_pod_annotation() {
  local ns="$1" name="$2" key="$3"
  local f
  f="$(pod_detail_file "$ns" "$name")"
  [[ -f "$f" ]] || return 1
  command grep -m1 "^annotation_${key}=" "$f" 2>/dev/null | cut -d= -f2-
}

write_pod_annotation() {
  local ns="$1" name="$2" key="$3" value="$4"
  local f
  f="$(pod_detail_file "$ns" "$name")"
  ensure_session_ns "$ns"
  [[ -f "$f" ]] || init_pod_detail "$ns" "$name" "nginx" "$name"
  command grep -v "^annotation_${key}=" "$f" > "${f}.tmp" 2>/dev/null || cp "$f" "${f}.tmp"
  echo "annotation_${key}=${value}" >> "${f}.tmp"
  mv "${f}.tmp" "$f"
}

remove_pod_annotation() {
  local ns="$1" name="$2" key="$3"
  local f
  f="$(pod_detail_file "$ns" "$name")"
  [[ -f "$f" ]] || return 0
  command grep -v "^annotation_${key}=" "$f" > "${f}.tmp" 2>/dev/null || true
  mv "${f}.tmp" "$f"
}

init_pod_default_labels() {
  local ns="$1" name="$2"
  write_pod_label "$ns" "$name" "run" "$name"
}

get_pod_labels_string() {
  local ns="$1" name="$2"
  local f line key val
  local -a labels=()
  f="$(pod_detail_file "$ns" "$name")"
  if [[ -f "$f" ]]; then
    while IFS= read -r line; do
      [[ "$line" == label_*=* ]] || continue
      key="${line#label_}"
      key="${key%%=*}"
      val="${line#*=}"
      labels+=("${key}=${val}")
    done < "$f"
  fi
  if [[ ${#labels[@]} -eq 0 ]]; then
    echo "run=${name}"
  else
    printf '%s\n' "${labels[@]}" | LC_ALL=C sort | paste -sd, -
  fi
}

get_label_selector_from_args() {
  local sel
  sel=$(get_flag_value "-l" "$@")
  [[ -z "$sel" ]] && sel=$(get_flag_value "--selector" "$@")
  echo "$sel"
}

get_label_columns_from_args() {
  local prev=""
  for a in "$@"; do
    if [[ "$prev" == "-L" || "$prev" == "--label-columns" ]]; then
      echo "$a"
      return
    fi
    if [[ "$a" == -L=* ]]; then echo "${a#-L=}"; return; fi
    if [[ "$a" == --label-columns=* ]]; then echo "${a#--label-columns=}"; return; fi
    prev="$a"
  done
  echo ""
}

has_show_labels_flag() {
  _has_flag "--show-labels" "$@"
}

_normalize_selector() {
  echo "$1" | tr -d "'\"" | sed -E 's/[[:space:]]+/ /g; s/ in *\(/ in (/g; s/ notin *\(/ notin (/g' | sed 's/^ //;s/ $//'
}

pod_matches_selector() {
  local ns="$1" name="$2" selector="$3"
  local cond key val expected inner v match
  [[ -z "$selector" ]] && return 0
  selector=$(_normalize_selector "$selector")

  local -a conds=()
  local current="" ch
  local depth=0
  for (( i=0; i<${#selector}; i++ )); do
    ch="${selector:i:1}"
    if [[ "$ch" == "(" ]]; then depth=$((depth + 1)); fi
    if [[ "$ch" == ")" ]]; then depth=$((depth - 1)); fi
    if [[ "$ch" == "," && $depth -eq 0 ]]; then
      conds+=("$current")
      current=""
      continue
    fi
    current+="$ch"
  done
  [[ -n "$current" ]] && conds+=("$current")

  for cond in "${conds[@]}"; do
    cond="${cond#"${cond%%[![:space:]]*}"}"
    cond="${cond%"${cond##*[![:space:]]}"}"
    [[ -z "$cond" ]] && continue

    if [[ "$cond" == *" notin "* ]]; then
      key="${cond%% notin *}"
      key="${key%"${key##*[![:space:]]}"}"
      inner="${cond#* notin (}"
      inner="${inner%)}"
      val=$(read_pod_label "$ns" "$name" "$key" 2>/dev/null || echo "")
      IFS=',' read -ra _vals <<< "$(echo "$inner" | tr -d ' ')"
      for v in "${_vals[@]}"; do
        [[ -n "$v" && "$val" == "$v" ]] && return 1
      done
    elif [[ "$cond" == *" in "* ]]; then
      key="${cond%% in *}"
      key="${key%"${key##*[![:space:]]}"}"
      inner="${cond#* in (}"
      inner="${inner%)}"
      val=$(read_pod_label "$ns" "$name" "$key" 2>/dev/null || echo "")
      match=false
      IFS=',' read -ra _vals <<< "$(echo "$inner" | tr -d ' ')"
      for v in "${_vals[@]}"; do
        [[ -n "$v" && "$val" == "$v" ]] && match=true
      done
      $match || return 1
    elif [[ "$cond" == *"!="* ]]; then
      key="${cond%%!=*}"
      expected="${cond#*!=}"
      val=$(read_pod_label "$ns" "$name" "$key" 2>/dev/null || echo "")
      [[ "$val" == "$expected" ]] && return 1
    elif [[ "$cond" == *"="* ]]; then
      key="${cond%%=*}"
      expected="${cond#*=}"
      val=$(read_pod_label "$ns" "$name" "$key" 2>/dev/null || echo "")
      [[ "$val" != "$expected" ]] && return 1
    fi
  done
  return 0
}

collect_namespace_pod_names() {
  local ns="$1"
  local detail_dir f line pname
  local -a names=()
  detail_dir="$(pod_detail_dir "$ns")"
  if [[ -d "$detail_dir" ]]; then
    for f in "$detail_dir"/*; do
      [[ -f "$f" ]] || continue
      names+=("$(basename "$f")")
    done
  fi
  local mock_file="$SANDBOX_K8S/mock/${ns}/pods.txt"
  if is_mock_namespace_enabled "$ns" && [[ -f "$mock_file" ]]; then
    while IFS= read -r line; do
      [[ "$line" == NAME* ]] && continue
      [[ -z "$line" ]] && continue
      pname="${line%% *}"
      [[ -n "$pname" ]] && names+=("$pname")
    done < "$mock_file"
  fi
  if [[ ${#names[@]} -eq 0 ]]; then
    return 0
  fi
  printf '%s\n' "${names[@]}" | LC_ALL=C sort -u
}

node_detail_file() {
  echo "${SESSION_DIR}/nodes.d/${1}"
}

read_node_label() {
  local node="$1" key="$2"
  local f
  f="$(node_detail_file "$node")"
  [[ -f "$f" ]] || return 1
  command grep -m1 "^label_${key}=" "$f" 2>/dev/null | cut -d= -f2-
}

write_node_label() {
  local node="$1" key="$2" value="$3"
  local f
  mkdir -p "${SESSION_DIR}/nodes.d"
  f="$(node_detail_file "$node")"
  touch "$f"
  command grep -v "^label_${key}=" "$f" > "${f}.tmp" 2>/dev/null || true
  echo "label_${key}=${value}" >> "${f}.tmp"
  mv "${f}.tmp" "$f"
}

get_node_labels_string() {
  local node="$1"
  local f line key val
  local -a labels=(
    "beta.kubernetes.io/arch=amd64"
    "beta.kubernetes.io/os=linux"
    "kubernetes.io/arch=amd64"
    "kubernetes.io/hostname=${node}"
    "kubernetes.io/os=linux"
  )
  f="$(node_detail_file "$node")"
  if [[ -f "$f" ]]; then
    while IFS= read -r line; do
      [[ "$line" == label_*=* ]] || continue
      key="${line#label_}"
      key="${key%%=*}"
      val="${line#*=}"
      labels+=("${key}=${val}")
    done < "$f"
  fi
  if [[ "$node" == "ckad9043" ]]; then
    labels+=("node-role.kubernetes.io/control-plane=")
  fi
  printf '%s\n' "${labels[@]}" | LC_ALL=C sort -u | paste -sd, -
}

list_nodes_table() {
  local show_labels=false
  has_show_labels_flag "$@" && show_labels=true
  if $show_labels; then
    echo "NAME         STATUS   ROLES           AGE   VERSION        LABELS"
    printf '%-12s %-8s %-15s %-5s %-14s %s\n' "ckad9043" "Ready" "control-plane" "30d" "v1.35.0" "$(get_node_labels_string ckad9043)"
    printf '%-12s %-8s %-15s %-5s %-14s %s\n' "ckad5601" "Ready" "<none>" "30d" "v1.35.0" "$(get_node_labels_string ckad5601)"
  else
    echo "NAME         STATUS   ROLES           AGE   VERSION"
    echo "ckad9043     Ready    control-plane   30d   v1.35.0"
    echo "ckad5601     Ready    <none>          30d   v1.35.0"
  fi
}

apply_label_pairs_to_pod() {
  local ns="$1" name="$2"; shift 2
  local arg key val
  for arg in "$@"; do
    [[ "$arg" == *=* && "$arg" != -* ]] || continue
    key="${arg%%=*}"
    val="${arg#*=}"
    write_pod_label "$ns" "$name" "$key" "$val"
  done
  for arg in "$@"; do
    [[ "$arg" == *- && "$arg" != -* && "$arg" != *"="* ]] || continue
    key="${arg%-}"
    remove_pod_label "$ns" "$name" "$key"
  done
}

apply_annotation_pairs_to_pod() {
  local ns="$1" name="$2"; shift 2
  local arg key val
  for arg in "$@"; do
    [[ "$arg" == *=* && "$arg" != -* ]] || continue
    key="${arg%%=*}"
    val="${arg#*=}"
    write_pod_annotation "$ns" "$name" "$key" "$val"
  done
  for arg in "$@"; do
    [[ "$arg" == *- && "$arg" != -* && "$arg" != *"="* ]] || continue
    key="${arg%-}"
    remove_pod_annotation "$ns" "$name" "$key"
  done
}

_upper() {
  echo "$1" | tr '[:lower:]' '[:upper:]'
}

list_pods_table() {
  local ns="$1"
  shift
  local -a args=("$@")
  local show_labels=false wide=false selector="" label_cols=""
  local -a col_keys=() pod_names=() name k val

  has_show_labels_flag "${args[@]}" && show_labels=true
  wide=false
  if has_wide_output "${args[@]}" || [[ "$(get_output_format_wrapper "${args[@]}")" == "wide" ]]; then
    wide=true
  fi
  selector=$(get_label_selector_from_args "${args[@]}")
  label_cols=$(get_label_columns_from_args "${args[@]}")
  [[ -n "$label_cols" ]] && IFS=',' read -ra col_keys <<< "$label_cols"

  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    pod_matches_selector "$ns" "$name" "$selector" && pod_names+=("$name")
  done < <(collect_namespace_pod_names "$ns")

  if $wide; then
    printf '%-33s %-7s %-9s %-10s %-6s %-15s %-10s' "NAME" "READY" "STATUS" "RESTARTS" "AGE" "IP" "NODE"
  else
    printf '%-33s %-7s %-9s %-10s %s' "NAME" "READY" "STATUS" "RESTARTS" "AGE"
  fi
  for k in "${col_keys[@]}"; do
    k="${k// /}"
    printf ' %-6s' "$(_upper "$k")"
  done
  $show_labels && printf ' %s' "LABELS"
  echo

  if [[ ${#pod_names[@]} -eq 0 ]]; then
    echo "No resources found in ${ns} namespace."
    return 0
  fi

  for name in "${pod_names[@]}"; do
    if pod_exists "$ns" "$name"; then
      if $wide; then
        printf '%-33s %-7s %-9s %-10s %-6s %-15s %-10s' \
          "$name" \
          "$(read_pod_field "$ns" "$name" ready || echo "1/1")" \
          "$(read_pod_field "$ns" "$name" status || echo "Running")" \
          "$(read_pod_field "$ns" "$name" restarts || echo "0")" \
          "$(_ns_age "$(session_ns_dir "$ns")/pods.meta" "$name")" \
          "$(read_pod_field "$ns" "$name" pod_ip || pod_ip_for "$name")" \
          "$(read_pod_field "$ns" "$name" node || echo "ckad5601")"
      else
        sync_pod_table_line "$ns" "$name"
      fi
      for k in "${col_keys[@]}"; do
        k="${k// /}"
        val=$(read_pod_label "$ns" "$name" "$k" 2>/dev/null || echo "")
        [[ -z "$val" ]] && val="<none>"
        printf ' %-6s' "$val"
      done
      $show_labels && printf ' %s' "$(get_pod_labels_string "$ns" "$name")"
      echo
    elif mock_pod_exists "$ns" "$name"; then
      mock_file="$SANDBOX_K8S/mock/${ns}/pods.txt"
      line=$(command grep "^${name}[[:space:]]" "$mock_file" 2>/dev/null | head -1)
      [[ -n "$line" ]] && printf '%s' "$line"
      for k in "${col_keys[@]}"; do
        k="${k// /}"
        printf ' %-6s' "<none>"
      done
      $show_labels && printf ' %s' "app=${name},run=${name}"
      echo
    fi
  done
}

init_pod_detail() {
  local ns="$1" name="$2" image="$3" container_name="${4:-$2}"
  local port="${5:-}" restart_policy="${6:-Never}" status="${7:-Running}"
  local ready="${8:-1/1}" restarts="${9:-0}" command="${10:-}"

  ensure_session_ns "$ns"
  local f ip
  f="$(pod_detail_file "$ns" "$name")"
  ip="$(pod_ip_for "$name")"

  cat > "$f" <<EOF
name=${name}
namespace=${ns}
image=${image}
container_name=${container_name}
container_port=${port}
restart_policy=${restart_policy}
status=${status}
ready=${ready}
restarts=${restarts}
pod_ip=${ip}
node=ckad5601
command=${command}
image_changed=0
has_previous_logs=0
EOF
  init_pod_default_labels "$ns" "$name"
}

append_pod_env() {
  local ns="$1" name="$2" env_pair="$3"
  local f
  f="$(pod_detail_file "$ns" "$name")"
  echo "env_${env_pair}" >> "$f"
}

get_pod_env_lines() {
  local ns="$1" name="$2"
  local f
  f="$(pod_detail_file "$ns" "$name")"
  [[ -f "$f" ]] || return 0
  command grep '^env_' "$f" 2>/dev/null | sed 's/^env_//'
}

sync_pod_table() {
  local ns="$1" name="$2"
  local ready status restarts age meta_file pod_file
  ready=$(read_pod_field "$ns" "$name" ready || echo "1/1")
  status=$(read_pod_field "$ns" "$name" status || echo "Running")
  restarts=$(read_pod_field "$ns" "$name" restarts || echo "0")
  meta_file="$(session_ns_dir "$ns")/pods.meta"
  pod_file="$(session_ns_dir "$ns")/pods.txt"
  age=$(_ns_age "$meta_file" "$name")

  if [[ ! -f "$pod_file" ]]; then
    echo "NAME                              READY   STATUS    RESTARTS   AGE" > "$pod_file"
  else
    command grep -vi "^${name}[[:space:]]" "$pod_file" > "${pod_file}.tmp" 2>/dev/null || true
    head -1 "$pod_file" > "${pod_file}.new"
    tail -n +2 "${pod_file}.tmp" 2>/dev/null >> "${pod_file}.new" || true
    mv "${pod_file}.new" "$pod_file"
    rm -f "${pod_file}.tmp"
  fi
  printf '%-33s %-7s %-9s %-10s %s\n' "$name" "$ready" "$status" "$restarts" "$age" >> "$pod_file"
}

create_session_pod() {
  local ns="$1" name="$2" image="$3" container_name="${4:-$2}"
  local port="${5:-}" restart_policy="${6:-Never}" command="${7:-}"
  init_pod_detail "$ns" "$name" "$image" "$container_name" "$port" "$restart_policy" "Running" "1/1" "0" "$command"
  local meta_file
  meta_file="$(session_ns_dir "$ns")/pods.meta"
  _set_resource_meta "$meta_file" "$name"
  sync_pod_table "$ns" "$name"
}

add_pod_to_session() {
  local ns="$1" name="$2" ready="${3:-1/1}" status="${4:-Running}" restarts="${5:-0}"
  if pod_exists "$ns" "$name"; then
    write_pod_field "$ns" "$name" ready "$ready"
    write_pod_field "$ns" "$name" status "$status"
    write_pod_field "$ns" "$name" restarts "$restarts"
    sync_pod_table "$ns" "$name"
  else
    create_session_pod "$ns" "$name" "nginx" "$name"
    write_pod_field "$ns" "$name" ready "$ready"
    write_pod_field "$ns" "$name" status "$status"
    write_pod_field "$ns" "$name" restarts "$restarts"
    sync_pod_table "$ns" "$name"
  fi
}

parse_run_args() {
  RUN_IMAGE=""
  RUN_PORT=""
  RUN_RESTART="Never"
  RUN_COMMAND=""
  RUN_ENVS=()
  RUN_LABELS=()
  local prev="" skip=false
  for a in "$@"; do
    if $skip; then
      if [[ "$prev" == "--labels" || "$prev" == "-l" ]]; then
        IFS=',' read -ra _lbls <<< "$a"
        RUN_LABELS+=("${_lbls[@]}")
      fi
      skip=false
      prev="$a"
      continue
    fi
    case "$a" in
      --image) skip=true ;;
      --image=*) RUN_IMAGE="${a#--image=}" ;;
      --port) skip=true ;;
      --port=*) RUN_PORT="${a#--port=}" ;;
      --restart) skip=true ;;
      --restart=*) RUN_RESTART="${a#--restart=}" ;;
      --env) skip=true ;;
      --env=*) RUN_ENVS+=("${a#--env=}") ;;
      --labels) skip=true ;;
      --labels=*) IFS=',' read -ra _lbls <<< "${a#--labels=}"; RUN_LABELS+=("${_lbls[@]}") ;;
      -l) skip=true ;;
      -l=*) IFS=',' read -ra _lbls <<< "${a#-l=}"; RUN_LABELS+=("${_lbls[@]}") ;;
      --command) RUN_COMMAND="__command__" ;;
      --) break ;;
    esac
    if [[ "$prev" == "--image" ]]; then RUN_IMAGE="$a"; fi
    if [[ "$prev" == "--port" ]]; then RUN_PORT="$a"; fi
    if [[ "$prev" == "--restart" ]]; then RUN_RESTART="$a"; fi
    if [[ "$prev" == "--env" ]]; then RUN_ENVS+=("$a"); fi
    prev="$a"
  done
  [[ -z "$RUN_IMAGE" ]] && RUN_IMAGE="nginx"
}

extract_command_after_sep() {
  local -a parts=()
  local found=false
  for a in "$@"; do
    if $found; then parts+=("$a"); fi
    [[ "$a" == "--" ]] && found=true
  done
  if [[ ${#parts[@]} -gt 0 ]]; then
    printf '%s' "${parts[*]}"
  fi
}

set_pod_image() {
  local ns="$1" pod_name="$2" container="$3" image="$4"
  if ! pod_exists "$ns" "$pod_name"; then
    echo "Error from server (NotFound): pods \"${pod_name}\" not found" >&2
    return 1
  fi
  local old_restarts
  old_restarts=$(read_pod_field "$ns" "$pod_name" restarts || echo "0")
  write_pod_field "$ns" "$pod_name" image "$image"
  write_pod_field "$ns" "$pod_name" container_name "$container"
  write_pod_field "$ns" "$pod_name" restarts "$((old_restarts + 1))"
  write_pod_field "$ns" "$pod_name" image_changed "1"
  write_pod_field "$ns" "$pod_name" has_previous_logs "1"
  sync_pod_table "$ns" "$pod_name"
  echo "pod/${pod_name} image updated"
}

render_pod_yaml() {
  local ns="$1" name="$2"
  local image container_name port restart_policy command pod_ip
  image=$(read_pod_field "$ns" "$name" image)
  container_name=$(read_pod_field "$ns" "$name" container_name)
  port=$(read_pod_field "$ns" "$name" container_port)
  restart_policy=$(read_pod_field "$ns" "$name" restart_policy)
  command=$(read_pod_field "$ns" "$name" command)
  pod_ip=$(read_pod_field "$ns" "$name" pod_ip)

  cat <<EOF
apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  labels:
$( {
  local lbl key val
  while IFS= read -r lbl; do
    key="${lbl%%=*}"
    val="${lbl#*=}"
    echo "    ${key}: ${val}"
  done < <(get_pod_labels_string "$ns" "$name" | tr ',' '\n')
} )
  name: ${name}
  namespace: ${ns}
spec:
  containers:
  - image: ${image}
    imagePullPolicy: IfNotPresent
    name: ${container_name}
EOF

  if [[ -n "$command" && "$command" != "__command__" ]]; then
    echo "    command:"
    for part in $command; do
      echo "    - ${part}"
    done
  elif [[ "$command" == "__command__" ]]; then
    echo "    command:"
    echo "    - env"
  fi

  local env_lines=()
  while IFS= read -r env_line; do
    [[ -n "$env_line" ]] && env_lines+=("$env_line")
  done < <(get_pod_env_lines "$ns" "$name")
  if [[ ${#env_lines[@]} -gt 0 ]]; then
    echo "    env:"
    for env_line in "${env_lines[@]}"; do
      local k="${env_line%%=*}" v="${env_line#*=}"
      echo "    - name: ${k}"
      echo "      value: \"${v}\""
    done
  fi

  if [[ -n "$port" ]]; then
    cat <<EOF
    ports:
    - containerPort: ${port}
      protocol: TCP
EOF
  fi

  cat <<EOF
    resources: {}
  dnsPolicy: ClusterFirst
  restartPolicy: ${restart_policy}
status:
  phase: Running
  podIP: ${pod_ip}
EOF
}

format_describe_labels() {
  local ns="$1" name="$2"
  local labels first=true line
  labels=$(get_pod_labels_string "$ns" "$name")
  IFS=',' read -ra _parts <<< "$labels"
  for line in "${_parts[@]}"; do
    if $first; then
      echo "Labels:           ${line}"
      first=false
    else
      echo "                  ${line}"
    fi
  done
}

render_pod_describe() {
  local ns="$1" name="$2"
  local image container_name port restart_policy status ready restarts pod_ip node image_changed
  image=$(read_pod_field "$ns" "$name" image)
  container_name=$(read_pod_field "$ns" "$name" container_name)
  port=$(read_pod_field "$ns" "$name" container_port)
  restart_policy=$(read_pod_field "$ns" "$name" restart_policy)
  status=$(read_pod_field "$ns" "$name" status)
  ready=$(read_pod_field "$ns" "$name" ready)
  restarts=$(read_pod_field "$ns" "$name" restarts)
  pod_ip=$(read_pod_field "$ns" "$name" pod_ip)
  node=$(read_pod_field "$ns" "$name" node)
  image_changed=$(read_pod_field "$ns" "$name" image_changed || echo "0")

  cat <<EOF
Name:             ${name}
Namespace:        ${ns}
Priority:         0
Service Account:  default
Node:             ${node}/10.0.0.2
Start Time:       $(date -u +"%a, %d %b %Y %H:%M:%S +0000")
$(format_describe_labels "$ns" "$name")
Annotations:      $( { ann=$(read_pod_annotation "$ns" "$name" description 2>/dev/null); owner=$(read_pod_annotation "$ns" "$name" owner 2>/dev/null); if [[ -n "$ann" || -n "$owner" ]]; then echo "${owner:+owner=${owner} }${ann:+description=${ann}}"; else echo "<none>"; fi; } )
Status:           ${status}
IP:               ${pod_ip}
IPs:
  IP:             ${pod_ip}
Controlled By:    <none>
Containers:
  ${container_name}:
    Container ID:   docker://abc123def456
    Image:          ${image}
    Image ID:       docker-pullable://${image}@sha256:abc123
    Port:           ${port:-<none>}/TCP
    Host Port:      0/TCP
    State:          Running
      Started:      $(date -u +"%a, %d %b %Y %H:%M:%S +0000")
    Ready:          ${ready}
    Restart Count:  ${restarts}
    Limits:
      cpu:          500m
      memory:       512Mi
    Requests:
      cpu:          250m
      memory:       256Mi
EOF

  local env_line has_env=false
  while IFS= read -r env_line; do
    [[ -z "$env_line" ]] && continue
    if ! $has_env; then
      echo "    Environment:"
      has_env=true
    fi
    local k="${env_line%%=*}" v="${env_line#*=}"
    printf '      %-10s %s\n' "${k}:" "${v}"
  done < <(get_pod_env_lines "$ns" "$name")

  cat <<EOF
Conditions:
  Type              Status
  Initialized       True
  Ready             True
  ContainersReady   True
  PodScheduled      True
Volumes:            <none>
QoS Class:          BestEffort
Node-Selectors:     <none>
Tolerations:        <none>
Events:
  Type    Reason     Age   From               Message
  ----    ------     ----  ----               -------
  Normal  Scheduled  2m    default-scheduler  Successfully assigned ${ns}/${name} to ${node}
  Normal  Pulled     2m    kubelet, ${node}   Container image "${image}" already present on machine
  Normal  Created    2m    kubelet, ${node}   Created container ${container_name}
  Normal  Started    2m    kubelet, ${node}   Started container ${container_name}
EOF

  if [[ "$image_changed" == "1" ]]; then
    cat <<EOF
  Normal  Killing    30s   kubelet, ${node}   Container ${container_name} definition changed, will be restarted
  Normal  Pulling    30s   kubelet, ${node}   Pulling image "${image}"
  Normal  Pulled     20s   kubelet, ${node}   Successfully pulled image "${image}"
  Normal  Created    15s   kubelet, ${node}   Created container ${container_name}
  Normal  Started    15s   kubelet, ${node}   Started container ${container_name}
EOF
  fi
}

pod_jsonpath() {
  eval_pod_jsonpath "$1" "$2" "$3"
}

# Resolve a single jsonpath field for a pod (e.g. .status.podIP)
resolve_pod_jsonpath_field() {
  local ns="$1" name="$2" field="$3"
  local status ready

  if [[ "$field" == ".metadata.name" ]]; then
    echo -n "$name"
  elif [[ "$field" == ".metadata.namespace" ]]; then
    echo -n "$ns"
  elif [[ "$field" == ".metadata.labels.run" || "$field" == ".metadata.labels.app" ]]; then
    echo -n "$name"
  elif [[ "$field" == ".metadata.annotations" ]]; then
    echo -n "map[]"
  elif [[ "$field" == ".metadata.annotations.description" ]]; then
    echo -n "sample annotation"
  elif [[ "$field" == ".status.podIP" || "$field" == ".status.podIp" || "$field" == *podIP* || "$field" == *podIp* ]]; then
    if pod_exists "$ns" "$name"; then
      echo -n "$(read_pod_field "$ns" "$name" pod_ip)"
    else
      echo -n "$(mock_pod_ip "$name")"
    fi
  elif [[ "$field" == ".status.hostIP" ]]; then
    echo -n "10.0.0.2"
  elif [[ "$field" == ".status.phase" ]]; then
    if pod_exists "$ns" "$name"; then
      status=$(read_pod_field "$ns" "$name" status || echo "Running")
      echo -n "$status"
    else
      echo -n "Running"
    fi
  elif [[ "$field" == ".spec.nodeName" ]]; then
    if pod_exists "$ns" "$name"; then
      echo -n "$(read_pod_field "$ns" "$name" node || echo "ckad5601")"
    else
      echo -n "ckad5601"
    fi
  elif [[ "$field" == *containers*image* ]]; then
    if pod_exists "$ns" "$name"; then
      echo -n "$(read_pod_field "$ns" "$name" image)"
    else
      echo -n "nginx"
    fi
  elif [[ "$field" == *containers*name* && "$field" != *containerStatuses* ]]; then
    if pod_exists "$ns" "$name"; then
      echo -n "$(read_pod_field "$ns" "$name" container_name || echo "$name")"
    else
      echo -n "$name"
    fi
  elif [[ "$field" == *containerPort* || "$field" == *ports* ]]; then
    if pod_exists "$ns" "$name"; then
      echo -n "$(read_pod_field "$ns" "$name" container_port || echo "80")"
    else
      echo -n "80"
    fi
  elif [[ "$field" == *containerStatuses*ready* ]]; then
    if pod_exists "$ns" "$name"; then
      ready=$(read_pod_field "$ns" "$name" ready || echo "1/1")
      [[ "$ready" == "1/1" ]] && echo -n "true" || echo -n "false"
    else
      echo -n "true"
    fi
  elif [[ "$field" == *conditions*Ready*status* ]]; then
    echo -n "True"
  elif pod_exists "$ns" "$name"; then
    echo -n "$(read_pod_field "$ns" "$name" pod_ip)"
  else
    echo -n "$(mock_pod_ip "$name")"
  fi
}

# Expand a jsonpath template with one or more {.field} segments
eval_pod_jsonpath() {
  local ns="$1" name="$2" template="$3"
  local result="$template" field val safety=0

  result="${result//\\n/$'\n'}"
  result="${result//\\t/$'\t'}"

  while [[ "$result" =~ \{(\.?[^\"{}]+)\} ]] && [[ $safety -lt 20 ]]; do
    field="${BASH_REMATCH[1]}"
    val=$(resolve_pod_jsonpath_field "$ns" "$name" "$field")
    local token="{${field}}"
    local before="${result%%"$token"*}"
    local after="${result#*"$token"}"
    if [[ "${before}${after}" == "$result" ]]; then
      break
    fi
    result="${before}${val}${after}"
    safety=$((safety + 1))
  done

  echo -n "$result"
}

# List jsonpath — supports {range .items[*]}...{end}
eval_pods_list_jsonpath() {
  local ns="$1" template="$2" label_selector="${3:-}"
  local inner range_mode=false

  if [[ "$template" == *'{range'* && "$template" == *'{end}'* ]]; then
    range_mode=true
    inner="${template#*\{range\ \.items\[\*\]\}}"
    inner="${inner%\{end\}*}"
    inner="${inner//\\n/$'\n'}"
  else
    inner="$template"
  fi

  local -a pod_names=()
  local detail_dir f pname line
  detail_dir="$(pod_detail_dir "$ns")"
  if [[ -d "$detail_dir" ]]; then
    for f in "$detail_dir"/*; do
      [[ -f "$f" ]] || continue
      pname=$(basename "$f")
      pod_names+=("$pname")
    done
  fi

  local mock_file="$SANDBOX_K8S/mock/${ns}/pods.txt"
  if [[ -f "$mock_file" ]]; then
    while IFS= read -r line; do
      [[ "$line" == NAME* ]] && continue
      [[ -z "$line" ]] && continue
      pname="${line%% *}"
      [[ -n "$pname" ]] && pod_names+=("$pname")
    done < "$mock_file"
  fi

  local first=true out
  for pname in "${pod_names[@]}"; do
    [[ -z "$pname" ]] && continue
    if [[ -n "$label_selector" ]]; then
      # Simple label match: app=foo → pod name contains or label file check skipped for sim
      :
    fi
    out=$(eval_pod_jsonpath "$ns" "$pname" "$inner")
    if $range_mode; then
      [[ -n "$out" ]] && echo -n "$out"
    else
      echo -n "$out"
      return
    fi
  done
  echo
}

mock_pod_ip() {
  pod_ip_for "${1:-pod}"
}

mock_pod_exists() {
  local ns="$1" name="$2"
  local mock_file="$SANDBOX_K8S/mock/${ns}/pods.txt"
  [[ -f "$mock_file" ]] && command grep -q "^${name}[[:space:]]" "$mock_file" 2>/dev/null
}

get_custom_columns_spec() {
  local prev="" spec=""
  for a in "$@"; do
    if [[ "$a" == custom-columns=* ]]; then
      echo "${a#custom-columns=}"
      return
    fi
    if [[ "$prev" == "-o" && "$a" == custom-columns* ]]; then
      echo "${a#custom-columns=}"
      return
    fi
    prev="$a"
  done
  echo ""
}

render_pod_custom_columns() {
  local ns="$1" name="$2" spec="$3"
  local -a cols=()
  IFS=',' read -ra cols <<< "$spec"
  local col title field val
  for col in "${cols[@]}"; do
    title="${col%%:*}"
    field="${col#*:}"
    case "$field" in
      metadata.name) val="$name" ;;
      metadata.namespace) val="$ns" ;;
      metadata.annotations*|metadata.annotations.description) val="sample annotation" ;;
      status.podIP) val=$(resolve_pod_jsonpath_field "$ns" "$name" ".status.podIP") ;;
      spec.containers[0].image) val=$(resolve_pod_jsonpath_field "$ns" "$name" ".spec.containers[0].image") ;;
      *) val=$(resolve_pod_jsonpath_field "$ns" "$name" ".$field") ;;
    esac
    printf '%s\t' "$val"
  done
  echo
}

has_follow_logs_flag() {
  for a in "$@"; do
    [[ "$a" == "-f" || "$a" == "--follow" ]] && return 0
  done
  return 1
}

get_logs_tail_count() {
  local prev=""
  for a in "$@"; do
    if [[ "$a" == --tail=* ]]; then echo "${a#--tail=}"; return; fi
    if [[ "$prev" == "--tail" && "$a" =~ ^[0-9]+$ ]]; then echo "$a"; return; fi
    prev="$a"
  done
  echo ""
}

get_container_flag() {
  local prev=""
  for a in "$@"; do
    [[ "$a" == "--" ]] && break
    if [[ "$prev" == "-c" || "$prev" == "--container" ]]; then echo "$a"; return; fi
    if [[ "$a" == -c=* || "$a" == --container=* ]]; then echo "${a#*=}"; return; fi
    prev="$a"
  done
  echo ""
}

extract_exec_command() {
  local -a parts=()
  local found=false
  for a in "$@"; do
    if $found; then parts+=("$a"); fi
    [[ "$a" == "--" ]] && found=true
  done
  if [[ ${#parts[@]} -gt 0 ]]; then
    printf '%s\0' "${parts[@]}"
  fi
}

apply_run_command_hints() {
  local ns="$1" name="$2" run_cmd="$3"
  [[ -z "$run_cmd" ]] && return

  if [[ "$run_cmd" == "notexist" || "$run_cmd" == *" notexist" ]]; then
    write_pod_field "$ns" "$name" status "Error"
    write_pod_field "$ns" "$name" ready "0/1"
    write_pod_field "$ns" "$name" log_type "empty"
    sync_pod_table "$ns" "$name"
    return
  fi

  if [[ "$run_cmd" == *"/notexist"* || "$run_cmd" == *"ls /notexist"* ]]; then
    write_pod_field "$ns" "$name" status "Error"
    write_pod_field "$ns" "$name" ready "0/1"
    write_pod_field "$ns" "$name" log_type "ls_error"
    sync_pod_table "$ns" "$name"
    return
  fi

  if [[ "$run_cmd" == *"while true"* && "$run_cmd" == *echo* ]]; then
    write_pod_field "$ns" "$name" log_type "loop"
    return
  fi

  if [[ "$run_cmd" == *hello* ]]; then
    write_pod_field "$ns" "$name" command "$run_cmd"
    write_pod_field "$ns" "$name" status "Completed"
    write_pod_field "$ns" "$name" ready "0/1"
    write_pod_field "$ns" "$name" log_type "hello"
    sync_pod_table "$ns" "$name"
  fi
}

get_jsonpath_template() {
  local prev="" template=""
  for a in "$@"; do
    if [[ "$a" == jsonpath=* ]]; then
      template="${a#jsonpath=}"
      template="${template#\'}"; template="${template%\'}"
      template="${template#\"}"; template="${template%\"}"
      echo "$template"
      return
    fi
    if [[ "$prev" == "jsonpath" ]]; then
      template="$a"
      template="${template#\'}"; template="${template%\'}"
      template="${template#\"}"; template="${template%\"}"
      echo "$template"
      return
    fi
    prev="$a"
  done
  echo ""
}

format_pod_wide_row() {
  local ns="$1" name="$2"
  local ready status restarts age pod_ip node
  ready=$(read_pod_field "$ns" "$name" ready)
  status=$(read_pod_field "$ns" "$name" status)
  restarts=$(read_pod_field "$ns" "$name" restarts)
  pod_ip=$(read_pod_field "$ns" "$name" pod_ip)
  node=$(read_pod_field "$ns" "$name" node)
  age=$(_ns_age "$(session_ns_dir "$ns")/pods.meta" "$name")
  printf '%-33s %-7s %-9s %-10s %-6s %-15s %s\n' "$name" "$ready" "$status" "$restarts" "$age" "$pod_ip" "$node"
}

list_session_pods_wide() {
  local ns="$1"
  local detail_dir
  detail_dir="$(pod_detail_dir "$ns")"
  [[ -d "$detail_dir" ]] || return 1
  echo "NAME                              READY   STATUS    RESTARTS   AGE    IP            NODE"
  local f name
  for f in "$detail_dir"/*; do
    [[ -f "$f" ]] || continue
    name=$(basename "$f")
    format_pod_wide_row "$ns" "$name"
  done
}

list_all_namespaces_pods() {
  echo "NAMESPACE     NAME                              READY   STATUS    RESTARTS   AGE"
  local ns_name detail_dir f name line
  while IFS= read -r ns_name; do
    detail_dir="$(pod_detail_dir "$ns_name")"
    [[ -d "$detail_dir" ]] || continue
    for f in "$detail_dir"/*; do
      [[ -f "$f" ]] || continue
      name=$(basename "$f")
      line=$(sync_pod_table_line "$ns_name" "$name")
      printf '%-13s %s\n' "$ns_name" "$line"
    done
  done < <(list_visible_namespaces | sort -u)
}

sync_pod_table_line() {
  local ns="$1" name="$2"
  local ready status restarts age
  ready=$(read_pod_field "$ns" "$name" ready)
  status=$(read_pod_field "$ns" "$name" status)
  restarts=$(read_pod_field "$ns" "$name" restarts)
  age=$(_ns_age "$(session_ns_dir "$ns")/pods.meta" "$name")
  printf '%-33s %-7s %-9s %-10s %s' "$name" "$ready" "$status" "$restarts" "$age"
}

get_pod_logs() {
  local ns="$1" name="$2" previous="${3:-false}" container="${4:-}" follow="${5:-false}"
  local image command status log_type
  image=$(read_pod_field "$ns" "$name" image)
  command=$(read_pod_field "$ns" "$name" command)
  status=$(read_pod_field "$ns" "$name" status || echo "Running")
  log_type=$(read_pod_field "$ns" "$name" log_type || echo "")

  if [[ -n "$container" && "$container" != "$(read_pod_field "$ns" "$name" container_name || echo "$name")" ]]; then
    echo "Error from server (BadRequest): container ${container} is not valid for pod ${name}" >&2
    return 1
  fi

  local mock_logs="$SANDBOX_K8S/mock/${ns}/logs-${name}.txt"
  if [[ -f "$mock_logs" ]]; then
    cat "$mock_logs"
    return 0
  fi

  if [[ "$previous" == "true" ]]; then
    if [[ "$(read_pod_field "$ns" "$name" has_previous_logs)" == "1" ]]; then
      cat <<EOF
/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration
/docker-entrypoint.sh: Configuration complete; ready for start up
EOF
      return 0
    fi
    echo "Error from server (BadRequest): previous terminated container \"$(read_pod_field "$ns" "$name" container_name)\" not found" >&2
    return 1
  fi

  if [[ "$log_type" == "empty" || ( "$status" == "Error" && "$command" == "notexist" ) ]]; then
    return 0
  fi

  if [[ "$log_type" == "ls_error" || "$command" == *"/notexist"* ]]; then
    echo "/bin/sh: ls: /notexist: No such file or directory"
    return 0
  fi

  if [[ "$log_type" == "hello" || ( "$command" == *hello* && "$image" == busybox* ) ]]; then
    echo "hello world"
    return 0
  fi

  if [[ "$log_type" == "loop" || ( "$command" == *"while true"* && "$command" == *echo* ) ]]; then
    local i=0
    while [[ $i -lt 5 ]]; do
      echo "${i}: $(date)"
      i=$((i + 1))
    done
    $follow && echo "(stream open — simulated follow)"
    return 0
  fi

  if [[ "$command" == "__command__" || "$command" == "env" ]]; then
    cat <<EOF
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
HOSTNAME=${name}
KUBERNETES_SERVICE_HOST=10.96.0.1
KUBERNETES_SERVICE_PORT=443
KUBERNETES_SERVICE_PORT_HTTPS=443
KUBERNETES_PORT=tcp://10.96.0.1:443
KUBERNETES_PORT_443_TCP=tcp://10.96.0.1:443
KUBERNETES_PORT_443_TCP_ADDR=10.96.0.1
KUBERNETES_PORT_443_TCP_PORT=443
KUBERNETES_PORT_443_TCP_PROTO=tcp
EOF
    local env_line
    while IFS= read -r env_line; do
      [[ -n "$env_line" ]] && echo "$env_line"
    done < <(get_pod_env_lines "$ns" "$name")
    return 0
  fi

  if [[ "$image" == busybox* ]]; then
    if [[ "$command" == *hello* ]]; then
      echo "hello world"
      return 0
    fi
    echo "BusyBox v1.36.1 () multi-call binary."
    return 0
  fi

  cat <<EOF
/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration
/docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/
/docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh
10-listen-on-ipv6-by-default.sh: info: Getting the checksum of /etc/nginx/conf.d/default.conf
10-listen-on-ipv6-by-default.sh: info: Enabled listen on IPv6 in /etc/nginx/conf.d/default.conf
/docker-entrypoint.sh: Configuration complete; ready for start up
EOF
  $follow && echo "(stream open — simulated follow)"
}

exec_pod_command() {
  local ns="$1" name="$2"
  shift 2
  local -a cmd=("$@")
  local container="${EXEC_CONTAINER:-}"

  if [[ -n "$container" && "$container" != "$(read_pod_field "$ns" "$name" container_name || echo "$name")" ]]; then
    echo "Error from server (BadRequest): container ${container} is not valid for pod ${name}" >&2
    return 1
  fi

  if [[ ${#cmd[@]} -eq 0 || ( ${#cmd[@]} -eq 1 && ( "${cmd[0]}" == "/bin/sh" || "${cmd[0]}" == "sh" ) ) ]]; then
    echo "# simulated shell — type 'exit' to leave"
    return 0
  fi

  if [[ "${cmd[0]}" == "env" && ${#cmd[@]} -eq 1 ]]; then
    echo "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    echo "HOSTNAME=${name}"
    echo "KUBERNETES_SERVICE_HOST=10.96.0.1"
    local env_line
    while IFS= read -r env_line; do
      [[ -n "$env_line" ]] && echo "$env_line"
    done < <(get_pod_env_lines "$ns" "$name")
    return 0
  fi

  local joined="${cmd[*]}"
  if [[ "$joined" == *'echo $var1'* ]] || [[ "$joined" == *"echo \$var1"* ]]; then
    local v
    v=$(get_pod_env_lines "$ns" "$name" | command grep '^var1=' | cut -d= -f2)
    echo "${v:-val1}"
    return 0
  fi

  if [[ "${cmd[0]}" == "ls" ]]; then
    local target="${cmd[1]:-}"
    if [[ "$target" == "/notexist" || "$target" == "/notexist/"* ]]; then
      echo "ls: ${target}: No such file or directory" >&2
      return 1
    fi
    case "$target" in
      ""|/)
        echo "bin"
        echo "dev"
        echo "etc"
        echo "home"
        echo "lib"
        echo "proc"
        echo "root"
        echo "tmp"
        echo "usr"
        echo "var"
        ;;
      /usr/share/nginx/html|/work-dir)
        echo "index.html"
        ;;
      *)
        echo "index.html"
        ;;
    esac
    return 0
  fi

  if [[ "${cmd[0]}" == "cat" ]]; then
    local f="${cmd[1]:-}"
    if [[ "$f" == *index.html* || "$f" == /work-dir/index.html ]]; then
      echo "Test"
      return 0
    fi
    echo "cat: ${f}: No such file or directory" >&2
    return 1
  fi

  if [[ "${cmd[0]}" == "grep" ]]; then
    echo "val1"
    return 0
  fi

  if [[ "${cmd[0]}" == "/bin/sh" && "${cmd[1]}" == "-c" ]]; then
    simulate_shell_command "${cmd[2]}"
    return 0
  fi

  if [[ "${cmd[0]}" == "sh" && "${cmd[1]}" == "-c" ]]; then
    simulate_shell_command "${cmd[2]}"
    return 0
  fi

  echo "<simulated exec output for: ${joined}>"
}

simulate_shell_command() {
  local cmd="$1"
  case "$cmd" in
    *wget*)
      cat <<'WGEOF'
Connecting to 10.1.1.131:80 (10.1.1.131:80)
writing to stdout
<!DOCTYPE html>
<html>
<head><title>Welcome to nginx!</title></head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and
working. Further configuration is required.</p>
</body>
</html>
-                    100% |********************************|   612  0:00:00 ETA
written to stdout
WGEOF
      ;;
    *echo*hello*)
      echo "hello world"
      ;;
    *echo*var1*|*'\$var1'*)
      echo "val1"
      ;;
    *ls*notexist*)
      echo "ls: /notexist: No such file or directory" >&2
      return 1
      ;;
    *ls*)
      echo "bin"
      echo "etc"
      echo "usr"
      ;;
    *cat*index.html*|*/work-dir/*)
      echo "Test"
      ;;
    *)
      echo "<simulated output for: $cmd>"
      ;;
  esac
}

simulate_run_inline() {
  local pod_name="$1"
  shift
  local -a cmd=("$@")
  if [[ ${#cmd[@]} -eq 0 ]]; then return; fi

  if [[ "${cmd[0]}" == "env" ]]; then
    echo "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    echo "HOSTNAME=${pod_name}"
    echo "KUBERNETES_SERVICE_HOST=10.96.0.1"
    local env_line
    for env_line in "${RUN_ENVS[@]}"; do
      echo "$env_line"
    done
    return
  fi

  if [[ "${cmd[0]}" == "wget" ]]; then
    simulate_shell_command "wget"
    return
  fi

  local joined="${cmd[*]}"
  simulate_shell_command "$joined"
}

add_list_resource_to_session() {
  local ns="$1" resource_file="$2" name="$3" display_line="$4"
  ensure_session_ns "$ns"
  local list_file meta_file
  list_file="$(session_ns_dir "$ns")/${resource_file}.txt"
  meta_file="$(session_ns_dir "$ns")/${resource_file}.meta"

  if [[ ! -f "$list_file" ]]; then
    case "$resource_file" in
      services)
        echo "NAME   TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)   AGE" > "$list_file"
        ;;
      configmaps)
        echo "NAME   DATA   AGE" > "$list_file"
        ;;
      secrets)
        echo "NAME   TYPE     DATA   AGE" > "$list_file"
        ;;
      cronjobs)
        echo "NAME   SCHEDULE   SUSPEND   ACTIVE   LAST SCHEDULE   AGE" > "$list_file"
        ;;
      jobs)
        echo "NAME   COMPLETIONS   DURATION   AGE" > "$list_file"
        ;;
      ingresses)
        echo "NAME   CLASS   HOSTS   ADDRESS   PORTS   AGE" > "$list_file"
        ;;
      pvc)
        echo "NAME   STATUS   VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   AGE" > "$list_file"
        ;;
      networkpolicies)
        echo "NAME   POD-SELECTOR   AGE" > "$list_file"
        ;;
      serviceaccounts)
        echo "NAME   SECRETS   AGE" > "$list_file"
        ;;
      resourcequotas)
        echo "NAME   AGE   REQUEST   LIMIT" > "$list_file"
        ;;
      hpa)
        echo "NAME   REFERENCE   TARGETS   MINPODS   MAXPODS   REPLICAS   AGE" > "$list_file"
        ;;
      *)
        echo "NAME   AGE" > "$list_file"
        ;;
    esac
  else
    command grep -vi "^${name}[[:space:]]" "$list_file" > "${list_file}.tmp" 2>/dev/null || true
    head -1 "$list_file" > "${list_file}.new"
    tail -n +2 "${list_file}.tmp" 2>/dev/null >> "${list_file}.new" || true
    mv "${list_file}.new" "$list_file"
    rm -f "${list_file}.tmp"
  fi

  echo "$display_line" >> "$list_file"
  _set_resource_meta "$meta_file" "$name"
}

register_resource_from_yaml() {
  local yaml_file="$1"
  [[ -f "$yaml_file" ]] || return 0

  local kind name ns image container_name port command_line schedule storage capacity access_mode storage_class selector
  kind=$(command grep -m1 '^kind:' "$yaml_file" 2>/dev/null | awk '{print $2}')
  name=$(command grep -m1 '^  name:' "$yaml_file" 2>/dev/null | awk '{print $2}')
  [[ -z "$name" ]] && name=$(command grep -m1 '^name:' "$yaml_file" 2>/dev/null | awk '{print $2}')
  ns=$(command grep -m1 '^  namespace:' "$yaml_file" 2>/dev/null | awk '{print $2}')
  [[ -z "$ns" ]] && ns=$(current_ns)
  image=$(command grep -m1 'image:' "$yaml_file" 2>/dev/null | awk '{print $2}')
  container_name=$(command grep -m1 'name:' "$yaml_file" 2>/dev/null | tail -1 | awk '{print $2}')
  port=$(command grep -m1 'containerPort:' "$yaml_file" 2>/dev/null | awk '{print $2}')
  schedule=$(command grep -m1 'schedule:' "$yaml_file" 2>/dev/null | awk '{print $2}' | tr -d '"')
  storage=$(command grep -m1 'storage:' "$yaml_file" 2>/dev/null | awk '{print $2}')
  access_mode=$(command grep -m1 '- ReadWriteOnce' "$yaml_file" 2>/dev/null && echo "RWO" || echo "RWO")
  storage_class=$(command grep -m1 'storageClassName:' "$yaml_file" 2>/dev/null | awk '{print $2}')
  selector=$(command grep -A1 'matchLabels:' "$yaml_file" 2>/dev/null | command grep 'app:' | head -1 | awk '{print $2}' | tr -d '"')
  [[ -n "$selector" ]] && selector="app=${selector}"

  if command grep -q '^  - command:' "$yaml_file" 2>/dev/null; then
    command_line="__command__"
  fi

  local age_line
  age_line=$(_ns_age "$(session_ns_dir "$ns")/${kind}.meta" "$name" 2>/dev/null || echo "30s")

  case "$kind" in
    Pod)
      create_session_pod "$ns" "$name" "${image:-nginx}" "${container_name:-$name}" "$port"
      if [[ "$command_line" == "__command__" ]]; then
        write_pod_field "$ns" "$name" command "__command__"
      fi
      ;;
    Deployment)
      add_deploy_to_session "$ns" "$name"
      init_deploy_detail "$ns" "$name" "$(command grep -m1 'replicas:' "$yaml_file" 2>/dev/null | awk '{print $2}' || echo 1)" "${image:-nginx}"
      ;;
    Namespace) ensure_session_ns "$name" ;;
    Service)
      local svc_port="${port:-80}"
      add_list_resource_to_session "$ns" "services" "$name" \
        "$(printf '%-6s %-11s %-12s %-13s %-9s %s' "$name" "ClusterIP" "10.96.0.10" "<none>" "${svc_port}/TCP" "30s")"
      ;;
    ConfigMap)
      local data_count
      data_count=$(command grep -c '^  [A-Za-z0-9_.-]\+:' "$yaml_file" 2>/dev/null || echo "1")
      add_list_resource_to_session "$ns" "configmaps" "$name" \
        "$(printf '%-6s %-4s %s' "$name" "$data_count" "30s")"
      ;;
    Secret)
      local secret_count
      secret_count=$(command grep -c '^  [A-Za-z0-9_.-]\+:' "$yaml_file" 2>/dev/null || echo "1")
      add_list_resource_to_session "$ns" "secrets" "$name" \
        "$(printf '%-6s %-8s %-4s %s' "$name" "Opaque" "$secret_count" "30s")"
      ;;
    CronJob)
      add_list_resource_to_session "$ns" "cronjobs" "$name" \
        "$(printf '%-6s %-10s %-7s %-6s %-15s %s' "$name" "${schedule:-*/30 * * * *}" "False" "0" "<none>" "30s")"
      ;;
    Job)
      add_list_resource_to_session "$ns" "jobs" "$name" \
        "$(printf '%-6s %-13s %-8s %s' "$name" "0/1" "0s" "30s")"
      ;;
    Ingress)
      local host
      host=$(command grep -m1 'host:' "$yaml_file" 2>/dev/null | awk '{print $2}')
      add_list_resource_to_session "$ns" "ingresses" "$name" \
        "$(printf '%-6s %-5s %-20s %-9s %-5s %s' "$name" "nginx" "${host:-app.ckad-exam.com}" "<none>" "80" "30s")"
      ;;
    PersistentVolumeClaim)
      add_list_resource_to_session "$ns" "pvc" "$name" \
        "$(printf '%-6s %-6s %-8s %-10s %-14s %-14s %s' "$name" "Bound" "pv-auto" "${storage:-500Mi}" "$access_mode" "${storage_class:-standard}" "30s")"
      ;;
    NetworkPolicy)
      add_list_resource_to_session "$ns" "networkpolicies" "$name" \
        "$(printf '%-6s %-14s %s' "$name" "${selector:-app=backend}" "30s")"
      ;;
    ServiceAccount)
      add_list_resource_to_session "$ns" "serviceaccounts" "$name" \
        "$(printf '%-6s %-7s %s' "$name" "0" "30s")"
      ;;
    ResourceQuota)
      add_list_resource_to_session "$ns" "resourcequotas" "$name" \
        "$(printf '%-6s %-3s %-7s %s' "$name" "30d" "cpu: 0/2" "memory: 0/4Gi")"
      ;;
  esac
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

deploy_detail_dir() {
  echo "$(session_ns_dir "$1")/deploy.d"
}

deploy_detail_file() {
  echo "$(deploy_detail_dir "$1")/${2}"
}

deploy_exists() {
  [[ -f "$(deploy_detail_file "$1" "$2")" ]] || \
    { [[ -f "$(session_ns_dir "$1")/deploy.txt" ]] && command grep -q "^${2}[[:space:]]" "$(session_ns_dir "$1")/deploy.txt" 2>/dev/null; }
}

read_deploy_field() {
  local ns="$1" name="$2" field="$3"
  local f
  f="$(deploy_detail_file "$ns" "$name")"
  [[ -f "$f" ]] || return 1
  command grep -m1 "^${field}=" "$f" 2>/dev/null | cut -d= -f2-
}

write_deploy_field() {
  local ns="$1" name="$2" field="$3" value="$4"
  local f
  f="$(deploy_detail_file "$ns" "$name")"
  mkdir -p "$(deploy_detail_dir "$ns")"
  [[ -f "$f" ]] || init_deploy_detail "$ns" "$name"
  command grep -v "^${field}=" "$f" > "${f}.tmp" 2>/dev/null || cp "$f" "${f}.tmp"
  echo "${field}=${value}" >> "${f}.tmp"
  mv "${f}.tmp" "$f"
}

init_deploy_detail() {
  local ns="$1" name="$2" replicas="${3:-1}" image="${4:-nginx}" port="${5:-80}"
  mkdir -p "$(deploy_detail_dir "$ns")"
  local f
  f="$(deploy_detail_file "$ns" "$name")"
  cat > "$f" <<EOF
name=${name}
replicas=${replicas}
image=${image}
port=${port}
revision=1
paused=0
selector_app=${name}
EOF
  record_deploy_revision "$ns" "$name" 1 "$image" "create"
  sync_deployment_pods "$ns" "$name"
}

record_deploy_revision() {
  local ns="$1" name="$2" rev="$3" image="$4" cause="${5:-<none>}"
  local rev_file rs_name hash
  rev_file="$(session_ns_dir "$ns")/rev-${name}.meta"
  if [[ ! -f "$rev_file" ]]; then
    printf 'REVISION  CHANGE-CAUSE\n' > "$rev_file"
  else
    command grep -v "^${rev}[[:space:]]" "$rev_file" > "${rev_file}.tmp" 2>/dev/null || true
    head -1 "$rev_file" > "${rev_file}.new"
    tail -n +2 "${rev_file}.tmp" 2>/dev/null | command grep -v '^REVISION' >> "${rev_file}.new" || true
    mv "${rev_file}.new" "$rev_file"
    rm -f "${rev_file}.tmp"
  fi
  printf '%-9s %s\n' "$rev" "$cause" >> "$rev_file"
  write_deploy_field "$ns" "$name" revision "$rev"
  write_deploy_field "$ns" "$name" image "$image"

  hash=$(printf '%s-%s' "$name" "$rev" | cksum | awk '{print $1}' | tail -c 9)
  rs_name="${name}-${hash}"
  write_deploy_field "$ns" "$name" current_rs "$rs_name"
  add_list_resource_to_session "$ns" "replicasets" "$rs_name" \
    "$(printf '%-30s %-5s %-5s %-5s %s' "$rs_name" "$(read_deploy_field "$ns" "$name" replicas || echo 1)" "$(read_deploy_field "$ns" "$name" replicas || echo 1)" "$(read_deploy_field "$ns" "$name" replicas || echo 1)" "30s")"
  write_rs_detail "$ns" "$rs_name" "$name" "$rev" "$image"
}

write_rs_detail() {
  local ns="$1" rs_name="$2" deploy="$3" rev="$4" image="$5"
  mkdir -p "$(session_ns_dir "$ns")/rs.d"
  cat > "$(session_ns_dir "$ns")/rs.d/${rs_name}" <<EOF
deployment=${deploy}
revision=${rev}
image=${image}
EOF
}

sync_deployment_pods() {
  local ns="$1" name="$2" replicas image i pod_name rs
  replicas=$(read_deploy_field "$ns" "$name" replicas || echo 1)
  image=$(read_deploy_field "$ns" "$name" image || echo nginx)
  rs=$(read_deploy_field "$ns" "$name" current_rs || echo "${name}-rs")
  local pod_file
  pod_file="$(session_ns_dir "$ns")/pods.txt"
  if [[ -f "$pod_file" ]]; then
    command grep -vi "^${name}-" "$pod_file" > "${pod_file}.tmp" 2>/dev/null || true
    head -1 "$pod_file" > "${pod_file}.new"
    tail -n +2 "${pod_file}.tmp" 2>/dev/null >> "${pod_file}.new" || true
    mv "${pod_file}.new" "$pod_file"
    rm -f "${pod_file}.tmp"
  fi
  for (( i=1; i<=replicas; i++ )); do
    pod_name="${rs}-$(printf '%c' "$(($i + 96))")"
    create_session_pod "$ns" "$pod_name" "$image" "$name"
    write_pod_label "$ns" "$pod_name" "app" "$name"
    write_pod_label "$ns" "$pod_name" "run" "$name"
  done
}

set_deploy_image() {
  local ns="$1" name="$2" container="$3" new_image="$4"
  if ! deploy_exists "$ns" "$name"; then
    echo "error: resource \"deployment\" \"${name}\" not found" >&2
    return 1
  fi
  local paused rev
  paused=$(read_deploy_field "$ns" "$name" paused || echo 0)
  if [[ "$paused" == "1" ]]; then
    write_deploy_field "$ns" "$name" pending_image "$new_image"
    echo "deployment.apps/${name} image updated"
    return 0
  fi
  rev=$(read_deploy_field "$ns" "$name" revision || echo 1)
  rev=$((rev + 1))
  record_deploy_revision "$ns" "$name" "$rev" "$new_image" "kubectl set image"
  sync_deployment_pods "$ns" "$name"
  echo "deployment.apps/${name} image updated"
}

scale_deployment() {
  local ns="$1" name="$2" replicas="$3"
  write_deploy_field "$ns" "$name" replicas "$replicas"
  sync_deployment_pods "$ns" "$name"
  local dep_file tmp_f line
  dep_file="$(session_ns_dir "$ns")/deploy.txt"
  if [[ -f "$dep_file" ]]; then
    tmp_f=$(mktemp)
    while IFS= read -r line; do
      if [[ "$line" =~ ^NAME[[:space:]] ]]; then
        echo "$line" >> "$tmp_f"
      elif [[ "$line" =~ ^${name}[[:space:]] ]]; then
        printf '%-6s %-7s %-12s %-11s %s\n' "$name" "${replicas}/${replicas}" "$replicas" "$replicas" "30s" >> "$tmp_f"
      elif [[ -n "$line" ]]; then
        echo "$line" >> "$tmp_f"
      fi
    done < "$dep_file"
    mv "$tmp_f" "$dep_file"
  fi
}

add_hpa_to_session() {
  local ns="$1" name="$2" min="$3" max="$4" cpu="$5"
  local replicas
  replicas=$(read_deploy_field "$ns" "$name" replicas || echo "$min")
  add_list_resource_to_session "$ns" "hpa" "$name" \
    "$(printf '%-20s %-20s %-8s %-8s %-8s %-8s %s' "$name" "Deployment/$name" "${cpu}%" "$min" "$max" "$replicas" "30s")"
  mkdir -p "$(session_ns_dir "$ns")/hpa.d"
  cat > "$(session_ns_dir "$ns")/hpa.d/${name}" <<EOF
min=${min}
max=${max}
cpu=${cpu}
target=Deployment/${name}
EOF
}

render_endpoints() {
  local ns="$1" svc_name="$2"
  local selector pname pod_ip port endpoints=""
  selector=$(read_service_selector "$ns" "$svc_name")
  port=$(read_service_port "$ns" "$svc_name")
  if [[ -d "$(pod_detail_dir "$ns")" ]]; then
    local f
    for f in "$(pod_detail_dir "$ns")"/*; do
      [[ -f "$f" ]] || continue
      pname=$(basename "$f")
      if [[ -n "$selector" ]]; then
        key="${selector%%=*}"
        val="${selector#*=}"
        lbl=$(read_pod_label "$ns" "$pname" "$key" 2>/dev/null || echo "")
        if [[ -n "$lbl" && "$lbl" != "$val" ]]; then
          continue
        fi
        if [[ -z "$lbl" && "$key" == "app" ]]; then
          lbl=$(read_pod_label "$ns" "$pname" "run" 2>/dev/null || echo "")
          [[ -n "$lbl" && "$lbl" != "$val" ]] && continue
        fi
      fi
      pod_ip=$(read_pod_field "$ns" "$pname" pod_ip 2>/dev/null || pod_ip_for "$pname")
      endpoints+="${pod_ip}:${port},"
    done
  fi
  endpoints="${endpoints%,}"
  [[ -z "$endpoints" ]] && endpoints="<none>"
  echo "NAME         ENDPOINTS   AGE"
  printf '%-12s %-11s %s\n' "$svc_name" "$endpoints" "30s"
}

read_service_selector() {
  local ns="$1" name="$2"
  local f
  f="$(session_ns_dir "$ns")/services.d/${name}"
  [[ -f "$f" ]] && command grep '^selector=' "$f" | cut -d= -f2-
  echo "run=${name}"
}

read_service_port() {
  local ns="$1" name="$2"
  local f
  f="$(session_ns_dir "$ns")/services.d/${name}"
  [[ -f "$f" ]] && command grep '^port=' "$f" | cut -d= -f2-
  echo "80"
}

write_service_meta() {
  local ns="$1" name="$2" selector="$3" port="$4" svc_type="${5:-ClusterIP}"
  mkdir -p "$(session_ns_dir "$ns")/services.d"
  cat > "$(session_ns_dir "$ns")/services.d/${name}" <<EOF
selector=${selector}
port=${port}
type=${svc_type}
EOF
}

patch_service_type() {
  local ns="$1" name="$2" new_type="$3"
  local svc_file
  svc_file="$(session_ns_dir "$ns")/services.txt"
  if [[ ! -f "$svc_file" ]] || ! command grep -q "^${name}[[:space:]]" "$svc_file" 2>/dev/null; then
    echo "error: resource \"service\" \"${name}\" not found" >&2
    return 1
  fi
  local cl_ip port target
  cl_ip=$(command grep "^${name}[[:space:]]" "$svc_file" 2>/dev/null | awk '{print $3}')
  [[ -z "$cl_ip" || "$cl_ip" == "ClusterIP" || "$cl_ip" == "NodePort" ]] && cl_ip="10.96.0.10"
  port=$(read_service_port "$ns" "$name")
  target="$port"
  node_port="3$(printf '%s' "$name" | cksum | awk '{print $1}' | tail -c 4)"
  tmp_f=$(mktemp)
  while IFS= read -r line; do
    if [[ "$line" =~ ^${name}[[:space:]] ]]; then
      if [[ "$new_type" == "NodePort" ]]; then
        printf '%-20s %-11s %-15s %-13s %-15s %s\n' "$name" "NodePort" "$cl_ip" "<none>" "${port}:${target}" "30s" >> "$tmp_f"
      else
        printf '%-20s %-11s %-15s %-13s %-9s %s\n' "$name" "$new_type" "$cl_ip" "<none>" "${port}/TCP" "30s" >> "$tmp_f"
      fi
    else
      echo "$line" >> "$tmp_f"
    fi
  done < "$svc_file"
  mv "$tmp_f" "$svc_file"
  write_service_meta "$ns" "$name" "$(read_service_selector "$ns" "$name")" "$port" "$new_type"
  echo "service/${name} patched"
}

simulate_kubectl_cp() {
  local ns="$1" src="$2" dest="$3"
  local pod_name remote_path local_path
  pod_name="${src%%:*}"
  remote_path="${src#*:}"
  local_path="$dest"
  case "$local_path" in
    /opt/*|/tmp/*) local_path="${SANDBOX_ROOT}${local_path}" ;;
  esac
  mkdir -p "$(dirname "$local_path")" 2>/dev/null
  if ! pod_exists "$ns" "$pod_name"; then
    echo "error: unable to find container named in pod ${pod_name}" >&2
    return 1
  fi
  case "$remote_path" in
    /etc/passwd)
      cat > "$local_path" <<'EOF'
root:x:0:0:root:/root:/bin/sh
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
EOF
      ;;
    *)
      echo "simulated content from ${pod_name}:${remote_path}" > "$local_path"
      ;;
  esac
}

write_node_taint() {
  local node="$1" taint="$2"
  mkdir -p "${SESSION_DIR}/nodes.d"
  local f
  f="$(node_detail_file "$node")"
  touch "$f"
  echo "taint_${taint//:/_}=${taint}" >> "$f"
}

render_node_describe() {
  local node="$1"
  echo "Name:               ${node}"
  echo "Roles:              $( [[ "$node" == "ckad9043" || "$node" == "controlplane" ]] && echo control-plane || echo "<none>" )"
  echo "Labels:             $(get_node_labels_string "$node")"
  local f taints=""
  f="$(node_detail_file "$node")"
  if [[ -f "$f" ]]; then
    taints=$(command grep '^taint_' "$f" 2>/dev/null | cut -d= -f2- | paste -sd, -)
  fi
  echo "Taints:             ${taints:-<none>}"
  echo "Unschedulable:      false"
  echo "Conditions:"
  echo "  Type             Status  Reason"
  echo "  ----             ------  ------"
  echo "  Ready            True    KubeletReady"
}

mark_job_complete() {
  local ns="$1" name="$2"
  local job_file
  job_file="$(session_ns_dir "$ns")/jobs.txt"
  if [[ -f "$job_file" ]]; then
    tmp_f=$(mktemp)
    while IFS= read -r line; do
      if [[ "$line" =~ ^${name}[[:space:]] ]]; then
        printf '%-20s %-13s %-8s %s\n' "$name" "1/1" "Complete" "30s" >> "$tmp_f"
      else
        echo "$line" >> "$tmp_f"
      fi
    done < "$job_file"
    mv "$tmp_f" "$job_file"
  fi
}

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

delete_pod_from_session() {
  local ns="$1" name="$2"
  local pod_file detail
  pod_file="$(session_ns_dir "$ns")/pods.txt"
  detail="$(pod_detail_file "$ns" "$name")"
  rm -f "$detail"
  if [[ -f "$pod_file" ]]; then
    command grep -vi "^${name}[[:space:]]" "$pod_file" > "${pod_file}.tmp" 2>/dev/null || true
    head -1 "$pod_file" > "${pod_file}.new"
    tail -n +2 "${pod_file}.tmp" 2>/dev/null >> "${pod_file}.new" || true
    mv "${pod_file}.new" "$pod_file"
    rm -f "${pod_file}.tmp"
  fi
}

has_watch_flag() {
  _has_flag "-w" "$@" || _has_flag "--watch" "$@"
}

has_wide_output() {
  local fmt
  fmt="$(get_output_format_wrapper "$@")"
  [[ "$fmt" == "wide" ]]
}

get_output_format_wrapper() {
  local prev=""
  for a in "$@"; do
    [[ "$a" == "-owide" || "$a" == "--output=wide" || "$a" == "-o=wide" ]] && echo "wide" && return
    if [[ "$prev" == "-o" && "$a" == "wide" ]]; then echo "wide"; return; fi
    prev="$a"
  done
  echo ""
}

# ─── Dry-run YAML generation (no cluster contact needed) ─────────────────────

_dryrun_get_flag() {
  local flag="$1"; shift
  local prev=""
  for a in "$@"; do
    if [[ "$prev" == "$flag" && -n "$a" ]]; then echo "$a"; return; fi
    if [[ "$a" == "${flag}="* ]]; then echo "${a#*=}"; return; fi
    prev="$a"
  done
}

_dryrun_ns() {
  local ns
  ns=$(_dryrun_get_flag "-n" "$@")
  [[ -z "$ns" ]] && ns=$(_dryrun_get_flag "--namespace" "$@")
  echo "$ns"
}

_dryrun_quote_if_numeric() {
  local v="$1"
  if [[ "$v" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
    echo "\"${v}\""
  else
    echo "$v"
  fi
}

_dryrun_run_yaml() {
  local pod_name="$1"; shift
  local image port restart ns has_cmd_flag
  image=$(_dryrun_get_flag "--image" "$@")
  port=$(_dryrun_get_flag "--port" "$@")
  restart=$(_dryrun_get_flag "--restart" "$@")
  ns=$(_dryrun_ns "$@")
  [[ -z "$restart" ]] && restart="Never"
  [[ -z "$image" ]] && image="nginx"
  has_cmd_flag=false
  for a in "$@"; do [[ "$a" == "--command" ]] && has_cmd_flag=true; done

  local -a envs=()
  local prev=""
  for a in "$@"; do
    [[ "$a" == "--" ]] && break
    if [[ "$prev" == "--env" ]]; then envs+=("$a"); fi
    if [[ "$a" == "--env="* ]]; then envs+=("${a#--env=}"); fi
    prev="$a"
  done

  local -a cmd_args=()
  local found_sep=false
  for a in "$@"; do
    if $found_sep; then cmd_args+=("$a"); fi
    [[ "$a" == "--" ]] && found_sep=true
  done

  echo "apiVersion: v1"
  echo "kind: Pod"
  echo "metadata:"
  echo "  creationTimestamp: null"
  echo "  labels:"
  echo "    run: ${pod_name}"
  echo "  name: ${pod_name}"
  [[ -n "$ns" ]] && echo "  namespace: ${ns}"
  echo "spec:"
  echo "  containers:"
  if [[ ${#cmd_args[@]} -gt 0 && "$has_cmd_flag" == "true" ]]; then
    printf '  - command:\n'
    for c in "${cmd_args[@]}"; do printf '    - %s\n' "$c"; done
    printf '    image: %s\n' "$image"
    printf '    imagePullPolicy: IfNotPresent\n'
  else
    printf '  - image: %s\n' "$image"
    printf '    imagePullPolicy: IfNotPresent\n'
    if [[ ${#cmd_args[@]} -gt 0 ]]; then
      printf '    args:\n'
      for c in "${cmd_args[@]}"; do printf '    - %s\n' "$c"; done
    fi
  fi
  if [[ ${#envs[@]} -gt 0 ]]; then
    printf '    env:\n'
    for e in "${envs[@]}"; do
      local k="${e%%=*}" v="${e#*=}"
      printf '    - name: %s\n' "$k"
      printf '      value: "%s"\n' "$v"
    done
  fi
  printf '    name: %s\n' "$pod_name"
  if [[ -n "$port" ]]; then
    printf '    ports:\n'
    printf '    - containerPort: %s\n' "$port"
  fi
  printf '    resources: {}\n'
  echo "  dnsPolicy: ClusterFirst"
  echo "  restartPolicy: ${restart}"
  echo "status: {}"
}

_dryrun_namespace_yaml() {
  local name="$1"
  echo "apiVersion: v1"
  echo "kind: Namespace"
  echo "metadata:"
  echo "  creationTimestamp: null"
  echo "  name: ${name}"
  echo "spec:"
  echo "  finalizers:"
  echo "  - kubernetes"
  echo "status:"
  echo "  phase: \"\""
}

_dryrun_resourcequota_yaml() {
  local name="$1"; shift
  local ns hard
  ns=$(_dryrun_ns "$@")
  hard=$(_dryrun_get_flag "--hard" "$@")

  echo "apiVersion: v1"
  echo "kind: ResourceQuota"
  echo "metadata:"
  echo "  creationTimestamp: null"
  echo "  name: ${name}"
  [[ -n "$ns" ]] && echo "  namespace: ${ns}"
  echo "spec:"
  if [[ -n "$hard" ]]; then
    echo "  hard:"
    local old_IFS="$IFS"
    IFS=',' read -ra pairs <<< "$hard"
    IFS="$old_IFS"
    for pair in "${pairs[@]}"; do
      local k="${pair%%=*}" v="${pair#*=}"
      echo "    ${k}: $(_dryrun_quote_if_numeric "$v")"
    done
  fi
  echo "status: {}"
}

_dryrun_deployment_yaml() {
  local name="$1"; shift
  local image replicas ns
  image=$(_dryrun_get_flag "--image" "$@")
  replicas=$(_dryrun_get_flag "--replicas" "$@")
  ns=$(_dryrun_ns "$@")
  [[ -z "$replicas" ]] && replicas=1
  [[ -z "$image" ]] && image="nginx"

  echo "apiVersion: apps/v1"
  echo "kind: Deployment"
  echo "metadata:"
  echo "  creationTimestamp: null"
  echo "  labels:"
  echo "    app: ${name}"
  echo "  name: ${name}"
  [[ -n "$ns" ]] && echo "  namespace: ${ns}"
  echo "spec:"
  echo "  replicas: ${replicas}"
  echo "  selector:"
  echo "    matchLabels:"
  echo "      app: ${name}"
  echo "  strategy: {}"
  echo "  template:"
  echo "    metadata:"
  echo "      creationTimestamp: null"
  echo "      labels:"
  echo "        app: ${name}"
  echo "    spec:"
  echo "      containers:"
  echo "      - image: ${image}"
  echo "        name: ${name}"
  echo "        resources: {}"
  echo "status: {}"
}

gen_dryrun_yaml() {
  local subcmd="$1"; shift

  if [[ "$subcmd" == "run" ]]; then
    _dryrun_run_yaml "$@"
  elif [[ "$subcmd" == "create" ]]; then
    local create_sub="$1"; shift
    case "$create_sub" in
      namespace|ns)
        _dryrun_namespace_yaml "$1"
        ;;
      resourcequota|quota)
        _dryrun_resourcequota_yaml "$@"
        ;;
      deployment|deploy)
        _dryrun_deployment_yaml "$@"
        ;;
      *)
        echo "Error: dry-run YAML generation not implemented for: create ${create_sub}" >&2
        return 1
        ;;
    esac
  fi
}
