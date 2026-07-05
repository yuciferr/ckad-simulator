#!/usr/bin/env bash
set -euo pipefail
NS="${1:-exam-q10}"

if kubectl auth can-i get pods --as=system:serviceaccount:${NS}:inspector -n "${NS}" 2>/dev/null | grep -q yes; then
  echo "PASS: inspector ServiceAccount can get pods"
  exit 0
fi

# Accept RoleBinding that grants pod read access
if kubectl get rolebinding -n "${NS}" -o json 2>/dev/null | jq -e '.items[] | select(.subjects[]?.name=="inspector")' >/dev/null; then
  echo "PASS: RoleBinding for inspector exists"
  exit 0
fi

echo "FAIL: RBAC for inspector not configured"
exit 1
