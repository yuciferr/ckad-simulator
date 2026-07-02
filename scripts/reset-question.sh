#!/usr/bin/env bash
set -euo pipefail

Q_NUM="${1:?Usage: reset-question.sh <question-number> [exam-id] [group]}"
EXAM_ID="${2:-1}"
GROUP="${3:-mock}"
KUBECONFIG="${KUBECONFIG:-/etc/kind/kubeconfig}"

if [ "${GROUP}" = "practice" ]; then
  SCENARIO_DIR="/app/exams/practice/${EXAM_ID}/scenarios/q${Q_NUM}"
  if [ -d "${SCENARIO_DIR}" ] && [ "$(find "${SCENARIO_DIR}" -maxdepth 1 -name '*.yaml' -o -name '*.yml' | head -1)" ]; then
    echo "Resetting practice Q${Q_NUM} scenario..."
    kubectl delete -f "${SCENARIO_DIR}/" --ignore-not-found --wait=true
    kubectl apply -f "${SCENARIO_DIR}/"
    echo "Practice scenario applied from ${SCENARIO_DIR}"
  else
    echo "Practice Q${Q_NUM}: no scenario manifests (uses default namespace)"
  fi
  exit 0
fi

NS="exam-q${Q_NUM}"
SCENARIO_DIR="/app/exams/mock/${EXAM_ID}/scenarios/q${Q_NUM}"

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
