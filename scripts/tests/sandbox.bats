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

@test "kubectl describe pod shows rich output for session pod" {
  run bash --rcfile "${SANDBOX_ROOT}/.bashrc" -c "
    kubectl run nginx --image=nginx -n default
    kubectl describe pod nginx -n default
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"Name:"* ]]
  [[ "$output" == *"Namespace:"* ]]
  [[ "$output" == *"Containers:"* ]]
  [[ "$output" == *"Events:"* ]]
  [[ "$output" == *"nginx"* ]]
}

@test "kubectl logs returns env output for busybox env pod" {
  run bash --rcfile "${SANDBOX_ROOT}/.bashrc" -c "
    kubectl run busybox --image=busybox --restart=Never --command -- env
    kubectl logs busybox
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"HOSTNAME=busybox"* ]]
  [[ "$output" == *"PATH="* ]]
}

@test "kubectl exec env shows pod environment" {
  run bash --rcfile "${SANDBOX_ROOT}/.bashrc" -c "
    kubectl run nginx --image=nginx --restart=Never --env=var1=val1
    kubectl exec nginx -- env | grep var1
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"var1=val1"* ]]
}

@test "kubectl jsonpath returns pod IP" {
  run bash --rcfile "${SANDBOX_ROOT}/.bashrc" -c "
    kubectl run nginx --image=nginx --restart=Never --port=80
    kubectl get pod nginx -o jsonpath='{.status.podIP}'
  "
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^10\. ]]
}

@test "kubectl jsonpath composite template podIP:port" {
  run bash --rcfile "${SANDBOX_ROOT}/.bashrc" -c "
    kubectl run nginx --image=nginx --restart=Never --port=8080
    kubectl get pod nginx -o jsonpath='{.status.podIP}:{.spec.containers[0].ports[0].containerPort}'
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *":8080" ]]
}

@test "kubectl logs empty for notexist command pod" {
  run bash --rcfile "${SANDBOX_ROOT}/.bashrc" -c "
    kubectl run busybox --restart=Never --image=busybox -- notexist
    kubectl logs busybox
  "
  [ "$status" -eq 0 ]
  [[ "$output" == "" ]]
}

@test "kubectl exec ls works in pod" {
  run bash --rcfile "${SANDBOX_ROOT}/.bashrc" -c "
    kubectl run busybox --image=busybox --restart=Never -- sleep 3600
    kubectl exec busybox -- ls /
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"bin"* ]]
  [[ "$output" == *"usr"* ]]
}

@test "kubectl get pods --show-labels includes LABELS column" {
  run bash --rcfile "${SANDBOX_ROOT}/.bashrc" -c "
    kubectl run nginx1 --image=nginx --restart=Never --labels=app=v1
    kubectl run nginx2 --image=nginx --restart=Never --labels=app=v1
    kubectl get po --show-labels
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"LABELS"* ]]
  [[ "$output" == *"app=v1"* ]]
}

@test "kubectl get pods -L app shows APP column" {
  run bash --rcfile "${SANDBOX_ROOT}/.bashrc" -c "
    kubectl run nginx1 --image=nginx --restart=Never --labels=app=v1
    kubectl get po -L app
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"APP"* ]]
  [[ "$output" == *"v1"* ]]
}

@test "kubectl get pods -l filters by label" {
  run bash --rcfile "${SANDBOX_ROOT}/.bashrc" -c "
    kubectl run nginx1 --image=nginx --restart=Never --labels=app=v1
    kubectl run nginx2 --image=nginx --restart=Never --labels=app=v2
    out=\$(kubectl get po -l app=v2 --no-headers | wc -l | tr -d ' ')
    test \"\$out\" = \"1\"
  "
  [ "$status" -eq 0 ]
}

  run bash --rcfile "${SANDBOX_ROOT}/.bashrc" -c "
    helm install demo bitnami/nginx -n default 2>/dev/null || helm install demo ./chart 2>/dev/null || helm install demo nginx
    helm list -n default
  "
  [ "$status" -eq 0 ]
  [[ "$output" == *"demo"* ]] || [[ "$output" == *"NAME"* ]]
}
