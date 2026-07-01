#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export SANDBOX_ROOT="$ROOT/sandbox"
export REAL_HOME="$HOME"
export PATH="$SANDBOX_ROOT/bin:$PATH"

K8S="$SANDBOX_ROOT/etc/kubernetes"
rm -rf "$K8S/session"
mkdir -p "$K8S/applied" "$K8S/session"
echo "default" > "$K8S/namespace"
echo "kubernetes-admin@kubernetes" > "$K8S/context"

k() { kubectl "$@"; }

pass=0
fail=0
check() {
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "OK  $desc"
    pass=$((pass + 1))
  else
    echo "FAIL $desc"
    fail=$((fail + 1))
  fi
}

check_contains() {
  local desc="$1" needle="$2"; shift 2
  local out
  out="$("$@" 2>&1)" || true
  if echo "$out" | grep -qF "$needle"; then
    echo "OK  $desc"
    pass=$((pass + 1))
  else
    echo "FAIL $desc (missing: $needle)"
    echo "$out" | head -5
    fail=$((fail + 1))
  fi
}

echo "=== core_concepts sandbox test ==="

# Q1
k create namespace mynamespace
k run nginx --image=nginx --restart=Never -n mynamespace
check_contains "Q1: nginx in mynamespace" "nginx" k get pods -n mynamespace

# Q3
k run busybox --image=busybox --command --restart=Never -- env >/dev/null
check_contains "Q3: busybox env logs" "HOSTNAME=busybox" k logs busybox

# Q5/Q6 dry-run (native YAML generation — no cluster needed)
check_contains "Q5: namespace dry-run yaml" "kind: Namespace" k create namespace myns -o yaml --dry-run=client
check_contains "Q6: quota dry-run yaml" "kind: ResourceQuota" k create quota myrq --hard=cpu=1,memory=1G,pods=2 --dry-run=client -o yaml

# Q7
k get po -A | grep -q mynamespace && echo "OK  Q7: get pods -A" && pass=$((pass+1)) || { echo "FAIL Q7"; fail=$((fail+1)); }

# Q8
k run nginx --image=nginx --restart=Never --port=80
check_contains "Q8: nginx in default" "nginx" k get pods

# Q9
k set image pod/nginx nginx=nginx:1.24.0
check_contains "Q9: image updated message" "image updated" k set image pod/nginx nginx=nginx:1.24.0 2>/dev/null || true
out=$(k get po nginx -o jsonpath='{.spec.containers[].image}')
[[ "$out" == "nginx:1.24.0" ]] && echo "OK  Q9: jsonpath image" && pass=$((pass+1)) || { echo "FAIL Q9 jsonpath: $out"; fail=$((fail+1)); }
check_contains "Q9: describe events" "Pulling image" k describe po nginx

# Q10
check_contains "Q10: wide output has IP" "10.1." k get po -o wide
check_contains "Q10: wget nginx" "Welcome to nginx" k run busybox --image=busybox --rm -it --restart=Never -- wget -O- "$(k get pod nginx -o jsonpath='{.status.podIP}'):80"

# Q11
check_contains "Q11: get yaml" "kind: Pod" k get po nginx -o yaml

# Q12
check_contains "Q12: describe" "Containers:" k describe po nginx

# Q13
check_contains "Q13: logs" "docker-entrypoint" k logs nginx

# Q14
check_contains "Q14: previous logs" "docker-entrypoint" k logs nginx -p

# Q15
check_contains "Q15: exec env" "PATH=" k exec nginx -- env

# Q16
check_contains "Q16: echo hello" "hello world" k run busybox --image=busybox -it --restart=Never -- echo 'hello world'

# Q18
k delete pod nginx 2>/dev/null || true
k run nginx --image=nginx --restart=Never --env=var1=val1
check_contains "Q18: env in exec" "var1=val1" k exec nginx -- env
check_contains "Q18: env in describe" "val1" k describe po nginx

echo ""
echo "Results: $pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
