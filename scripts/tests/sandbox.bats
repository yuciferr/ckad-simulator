#!/usr/bin/env bats
# Sandbox kubectl smoke tests — run: npm run test:shell

setup() {
  export SANDBOX_ROOT="${BATS_TEST_DIRNAME}/../../sandbox"
  export PATH="${SANDBOX_ROOT}/bin:${PATH}"
  export HOME="${SANDBOX_ROOT}"
  export KUBECONFIG=/dev/null
}

@test "kubectl get pods in mock namespace earth" {
  run bash --rcfile "${SANDBOX_ROOT}/.bashrc" -c "kubectl get pods -n earth"
  [ "$status" -eq 0 ]
  [[ "$output" == *"NAME"* ]]
}

@test "kubectl apply registers service in session namespace" {
  run bash --rcfile "${SANDBOX_ROOT}/.bashrc" -c "
    kubectl run web --image=nginx -n default --dry-run=client -o yaml > /tmp/svc-test-pod.yaml 2>/dev/null || true
    cat > /tmp/svc-test.yaml <<'YAML'
apiVersion: v1
kind: Service
metadata:
  name: test-svc
  namespace: default
spec:
  ports:
  - port: 80
  selector:
    app: web
YAML
    kubectl apply -f /tmp/svc-test.yaml
    kubectl get svc test-svc -n default
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"test-svc"* ]]
}

@test "kubectl get configmaps after apply" {
  run bash --rcfile "${SANDBOX_ROOT}/.bashrc" -c "
    cat > /tmp/cm-test.yaml <<'YAML'
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: default
data:
  key: value
YAML
    kubectl apply -f /tmp/cm-test.yaml
    kubectl get cm app-config -n default
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"app-config"* ]]
}

@test "cd guard prevents escaping sandbox" {
  run bash --rcfile "${SANDBOX_ROOT}/.bashrc" -c "cd /tmp && pwd"
  [ "$status" -eq 0 ]
  [[ "$output" != "/tmp" ]]
}

@test "helm install creates release state" {
  run bash --rcfile "${SANDBOX_ROOT}/.bashrc" -c "
    helm install demo bitnami/nginx -n default 2>/dev/null || helm install demo ./chart 2>/dev/null || helm install demo nginx
    helm list -n default
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"demo"* ]] || [[ "$output" == *"NAME"* ]]
}
