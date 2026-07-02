#!/usr/bin/env bash
set -euo pipefail

Q_NUM="${1:?Usage: reset-question.sh <question-number>}"
EXAM_ID="${2:-1}"
NS="exam-q${Q_NUM}"
SCENARIO_DIR="/app/exams/mock/${EXAM_ID}/scenarios/q${Q_NUM}"
KUBECONFIG="${KUBECONFIG:-/etc/kind/kubeconfig}"

echo "Resetting question ${Q_NUM} (namespace: ${NS})..."

kubectl delete namespace "${NS}" --ignore-not-found --wait=true

if [ -d "${SCENARIO_DIR}" ] && [ "$(find "${SCENARIO_DIR}" -maxdepth 1 -name '*.yaml' -o -name '*.yml' | head -1)" ]; then
  kubectl apply -f "${SCENARIO_DIR}/"
  kubectl wait --for=condition=Ready pods --all -n "${NS}" --timeout=30s 2>/dev/null || true
  echo "Scenario applied from ${SCENARIO_DIR}"
else
  kubectl create namespace "${NS}"
  echo "Empty namespace ${NS} created (no scenario manifests)."
fi

echo "Question ${Q_NUM} reset complete."
