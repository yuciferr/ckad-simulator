# Answer 1

**Weight: 7%**

- [ ] livenessProbe added to Deployment containers spec
- [ ] tcpSocket port set to 80
- [ ] initialDelaySeconds set to 10
- [ ] periodSeconds set to 15
- [ ] Changes saved to /opt/course/p1/project-23-api-new.yaml
- [ ] Changes applied and pods running

**Solution:**

First, get an overview of the resources:

```bash
k -n pluto get all -o wide
```

Copy the original YAML:

```bash
cp /opt/course/p1/project-23-api.yaml /opt/course/p1/project-23-api-new.yaml
```

Edit the new file and add the livenessProbe to the container spec:

```yaml
livenessProbe:
  tcpSocket:
    port: 80
  initialDelaySeconds: 10
  periodSeconds: 15
```

Apply the changes:

```bash
k -f /opt/course/p1/project-23-api-new.yaml apply
```

**Verification:**

```bash
k -n pluto describe deploy project-23-api | grep Liveness
# Expected: Liveness: tcp-socket :80 delay=10s timeout=1s period=15s #success=1 #failure=3
```

---

# Answer 2

**Weight: 4%**

- [ ] Deployment sunny created with 4 replicas
- [ ] Image is nginx:1.17.3-alpine
- [ ] ServiceAccount sa-sun-deploy is used
- [ ] ClusterIP Service sun-srv created on port 9999 targeting port 80
- [ ] Status command written to /opt/course/p2/sunny_status_command.sh

**Solution:**

Create the Deployment:

```bash
k -n sun create deployment sunny --image=nginx:1.17.3-alpine --dry-run=client -o yaml > /tmp/sunny.yaml
```

Edit the YAML to add replicas and serviceAccountName:

```yaml
spec:
  replicas: 4
  template:
    spec:
      serviceAccountName: sa-sun-deploy
```

Apply:

```bash
k create -f /tmp/sunny.yaml
```

Expose the Deployment:

```bash
k -n sun expose deployment sunny --name sun-srv --port 9999 --target-port 80
```

Write the status command:

```bash
echo 'kubectl -n sun get deployment sunny' > /opt/course/p2/sunny_status_command.sh
```

**Verification:**

```bash
k run tmp --restart=Never --rm -i --image=nginx:alpine -- curl -m 5 sun-srv.sun:9999
```

---

# Answer 3

**Weight: 7%**

- [ ] Identified earth-3cc-web Deployment as the broken service
- [ ] Found readinessProbe has wrong port (82 instead of 80)
- [ ] Fixed the readinessProbe port to 80
- [ ] Service earth-3cc-web is now reachable
- [ ] Error reason written to /opt/course/p3/ticket-654.txt

**Solution:**

Get an overview:

```bash
k -n earth get all
k -n earth get endpointslice
```

Identify the Deployment with 0 ready pods: `earth-3cc-web`

Edit the Deployment:

```bash
k -n earth edit deploy earth-3cc-web
```

Fix the readinessProbe port from `82` to `80`:

```yaml
readinessProbe:
  tcpSocket:
    port: 80  # was 82
```

Write the error reason:

```bash
echo 'Wrong port for readinessProbe defined!' > /opt/course/p3/ticket-654.txt
```

**Verification:**

```bash
k run tmp --restart=Never --rm -i --image=nginx:alpine -- curl -m 5 earth-3cc-web.earth:6363
```

---

# Answer 4

**Weight: 5%**

- [ ] CronJob dice created in namespace moon
- [ ] Schedule is */30 * * * *
- [ ] Image is busybox:1.36
- [ ] successfulJobsHistoryLimit set to 3
- [ ] failedJobsHistoryLimit set to 1
- [ ] activeDeadlineSeconds set to 20
- [ ] Test Job dice-test created and ran successfully

**Solution:**

```bash
k -n moon create cronjob dice --image=busybox:1.36 --schedule="*/30 * * * *" \
  -- sh -c 'echo "Rolling dice: $(shuf -i 1-6 -n 1)"'
```

Edit to add history limits and deadline:

```bash
k -n moon edit cronjob dice
```

```yaml
spec:
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      activeDeadlineSeconds: 20
```

Create a test Job:

```bash
k -n moon create job dice-test --from=cronjob/dice
```

**Verification:**

```bash
k -n moon get jobs
k -n moon logs job/dice-test
```

---

# Answer 5

**Weight: 7%**

- [ ] NetworkPolicy np-backend created in namespace neptune
- [ ] Policy targets pod with label app=backend
- [ ] Ingress rule allows from app=frontend on port 8080
- [ ] Egress rule allows to app=database on port 3306
- [ ] Policy type includes both Ingress and Egress

**Solution:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: np-backend
  namespace: neptune
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
      ports:
        - protocol: TCP
          port: 8080
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: database
      ports:
        - protocol: TCP
          port: 3306
```

Apply:

```bash
k apply -f np-backend.yaml
```

**Verification:**

```bash
k -n neptune describe netpol np-backend
```

---

# Answer 6

**Weight: 4%**

- [ ] ConfigMap app-config created with correct data
- [ ] Secret app-secret created with correct data
- [ ] Pod app-pod created with nginx:alpine image
- [ ] ConfigMap mounted as env vars
- [ ] Secret mounted as env vars with prefix SECRET_

**Solution:**

```bash
k -n mercury create configmap app-config --from-literal=APP_ENV=production --from-literal=APP_DEBUG=false

k -n mercury create secret generic app-secret --from-literal=DB_USER=admin --from-literal='DB_PASS=s3cure!p@ss'
```

Create Pod YAML:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-pod
  namespace: mercury
spec:
  containers:
    - name: nginx
      image: nginx:alpine
      envFrom:
        - configMapRef:
            name: app-config
        - secretRef:
            name: app-secret
          prefix: SECRET_
```

**Verification:**

```bash
k -n mercury exec app-pod -- env | grep -E 'APP_|SECRET_'
```

---

# Answer 7

**Weight: 7%**

- [ ] Existing web-app Deployment scaled to 8 replicas
- [ ] New Deployment web-app-canary created with 2 replicas
- [ ] Canary uses image nginx:1.25-alpine
- [ ] Canary has labels app=web-app and version=v2
- [ ] Traffic split is approximately 80/20
- [ ] YAML saved to /opt/course/p7/canary.yaml

**Solution:**

Scale existing Deployment:

```bash
k -n mars scale deployment web-app --replicas=8
```

Create canary Deployment:

```bash
k -n mars create deployment web-app-canary --image=nginx:1.25-alpine --dry-run=client -o yaml > /opt/course/p7/canary.yaml
```

Edit the YAML:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app-canary
  namespace: mars
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web-app
      version: v2
  template:
    metadata:
      labels:
        app: web-app
        version: v2
    spec:
      containers:
        - name: nginx
          image: nginx:1.25-alpine
```

Apply:

```bash
k apply -f /opt/course/p7/canary.yaml
```

**Verification:**

```bash
k -n mars get pods -l app=web-app --show-labels
# Should show 8 v1 + 2 v2 = 10 total pods
```

---

# Answer 8

**Weight: 5%**

- [ ] Pod multi-pod created in namespace venus
- [ ] Main container app uses busybox:1.36 with correct command
- [ ] Sidecar container logger uses busybox:1.36 with tail -f
- [ ] emptyDir volume log-volume created
- [ ] Volume mounted at /var/log in both containers

**Solution:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: multi-pod
  namespace: venus
spec:
  volumes:
    - name: log-volume
      emptyDir: {}
  containers:
    - name: app
      image: busybox:1.36
      command:
        - sh
        - -c
        - 'while true; do echo "$(date) - Main app running" >> /var/log/app.log; sleep 5; done'
      volumeMounts:
        - name: log-volume
          mountPath: /var/log
    - name: logger
      image: busybox:1.36
      command:
        - sh
        - -c
        - 'tail -f /var/log/app.log'
      volumeMounts:
        - name: log-volume
          mountPath: /var/log
```

**Verification:**

```bash
k -n venus logs multi-pod -c logger
# Should see timestamped log lines
```

---

# Answer 9

**Weight: 4%**

- [ ] PVC data-pvc created with 500Mi storage
- [ ] Access mode is ReadWriteOnce
- [ ] StorageClass is standard
- [ ] Pod data-pod created with nginx:alpine
- [ ] PVC mounted at /data
- [ ] PVC is bound and Pod is running

**Solution:**

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-pvc
  namespace: jupiter
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: standard
  resources:
    requests:
      storage: 500Mi
---
apiVersion: v1
kind: Pod
metadata:
  name: data-pod
  namespace: jupiter
spec:
  volumes:
    - name: data-vol
      persistentVolumeClaim:
        claimName: data-pvc
  containers:
    - name: nginx
      image: nginx:alpine
      volumeMounts:
        - name: data-vol
          mountPath: /data
```

**Verification:**

```bash
k -n jupiter get pvc data-pvc
k -n jupiter get pod data-pod
```

---

# Answer 10

**Weight: 7%**

- [ ] ServiceAccount inspector-sa created
- [ ] Role pod-reader created with get, list, watch on pods
- [ ] RoleBinding inspector-binding created correctly
- [ ] Pod inspector updated to use ServiceAccount inspector-sa
- [ ] Pod can now list pods successfully

**Solution:**

Check the error first:

```bash
k -n saturn logs inspector
```

Create the ServiceAccount:

```bash
k -n saturn create sa inspector-sa
```

Create the Role:

```bash
k -n saturn create role pod-reader --verb=get,list,watch --resource=pods
```

Create the RoleBinding:

```bash
k -n saturn create rolebinding inspector-binding --role=pod-reader --serviceaccount=saturn:inspector-sa
```

Update the Pod (delete and recreate with SA):

```bash
k -n saturn get pod inspector -o yaml > /tmp/inspector.yaml
```

Edit to add `serviceAccountName: inspector-sa`, delete old pod and create new:

```bash
k -n saturn delete pod inspector
k apply -f /tmp/inspector.yaml
```

**Verification:**

```bash
k -n saturn logs inspector
# Should now list pods without error
```

---

# Answer 11

**Weight: 5%**

- [ ] Ingress app-ingress created in namespace uranus
- [ ] IngressClassName set to nginx
- [ ] Host app.ckad-exam.com configured
- [ ] Path / routes to app-svc on port 80
- [ ] Path /api routes to api-svc on port 8080
- [ ] pathType is Prefix for both rules

**Solution:**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  namespace: uranus
spec:
  ingressClassName: nginx
  rules:
    - host: app.ckad-exam.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: app-svc
                port:
                  number: 80
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api-svc
                port:
                  number: 8080
```

Or imperatively:

```bash
k -n uranus create ingress app-ingress \
  --class=nginx \
  --rule="app.ckad-exam.com/=app-svc:80" \
  --rule="app.ckad-exam.com/api=api-svc:8080"
```

**Verification:**

```bash
k -n uranus describe ingress app-ingress
```

---

# Answer 12

**Weight: 4%**

- [ ] Deployment updated to httpd:2.4.58-alpine
- [ ] Rollout completed successfully
- [ ] Rollout history shows revision entries
- [ ] Rollback performed to previous version
- [ ] Image reverted to httpd:2.4-alpine
- [ ] Commands written to /opt/course/p12/commands.sh

**Solution:**

```bash
# Update image
k -n titan set image deployment rolling-app httpd=httpd:2.4.58-alpine --record

# Wait for rollout
k -n titan rollout status deployment rolling-app

# Check history
k -n titan rollout history deployment rolling-app

# Rollback
k -n titan rollout undo deployment rolling-app

# Verify
k -n titan describe deployment rolling-app | grep Image
```

Write commands to file:

```bash
cat << 'EOF' > /opt/course/p12/commands.sh
kubectl -n titan set image deployment rolling-app httpd=httpd:2.4.58-alpine --record
kubectl -n titan rollout status deployment rolling-app
kubectl -n titan rollout history deployment rolling-app
kubectl -n titan rollout undo deployment rolling-app
kubectl -n titan describe deployment rolling-app | grep Image
EOF
```

---

# Answer 13

**Weight: 5%**

- [ ] Pod secure-pod created in namespace io
- [ ] runAsUser set to 1000 at pod level
- [ ] runAsGroup set to 3000 at pod level
- [ ] NET_ADMIN capability added at container level
- [ ] readOnlyRootFilesystem set to true
- [ ] emptyDir volumes mounted at /var/cache/nginx and /var/run

**Solution:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-pod
  namespace: io
spec:
  securityContext:
    runAsUser: 1000
    runAsGroup: 3000
  containers:
    - name: nginx
      image: nginx:alpine
      securityContext:
        readOnlyRootFilesystem: true
        capabilities:
          add:
            - NET_ADMIN
      volumeMounts:
        - name: cache
          mountPath: /var/cache/nginx
        - name: run
          mountPath: /var/run
  volumes:
    - name: cache
      emptyDir: {}
    - name: run
      emptyDir: {}
```

**Verification:**

```bash
k -n io get pod secure-pod
k -n io describe pod secure-pod | grep -A5 "Security"
```

---

# Answer 14

**Weight: 5%**

- [ ] Helm repo updated
- [ ] bitnami/nginx installed as web-release in namespace europa
- [ ] replicaCount set to 2
- [ ] service.type set to ClusterIP
- [ ] Release upgraded to replicaCount=3
- [ ] Release history verified

**Solution:**

```bash
helm repo update

helm install web-release bitnami/nginx -n europa --create-namespace \
  --set replicaCount=2 \
  --set service.type=ClusterIP

helm -n europa status web-release

helm -n europa upgrade web-release bitnami/nginx \
  --set replicaCount=3 \
  --set service.type=ClusterIP

helm -n europa history web-release
```

**Verification:**

```bash
helm -n europa list
k -n europa get pods
# Should see 3 nginx pods
```

---

# Answer 15

**Weight: 4%**

- [ ] Job backup-manual created from CronJob backup-job
- [ ] Job completed successfully
- [ ] Logs retrieved from completed Job
- [ ] Output written to /opt/course/p15/backup-output.txt

**Solution:**

```bash
k -n callisto create job backup-manual --from=cronjob/backup-job

k -n callisto wait --for=condition=complete job/backup-manual --timeout=60s

k -n callisto logs job/backup-manual > /opt/course/p15/backup-output.txt
```

**Verification:**

```bash
k -n callisto get jobs
cat /opt/course/p15/backup-output.txt
```

---

# Answer 16

**Weight: 5%**

- [ ] Pod resource-pod created in namespace ganymede
- [ ] CPU request is 100m
- [ ] CPU limit is 200m
- [ ] Memory request is 64Mi
- [ ] Memory limit is 128Mi
- [ ] ResourceQuota usage verified

**Solution:**

```bash
k -n ganymede run resource-pod --image=nginx:alpine \
  --requests='cpu=100m,memory=64Mi' \
  --limits='cpu=200m,memory=128Mi'
```

Or via YAML:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: resource-pod
  namespace: ganymede
spec:
  containers:
    - name: nginx
      image: nginx:alpine
      resources:
        requests:
          cpu: 100m
          memory: 64Mi
        limits:
          cpu: 200m
          memory: 128Mi
```

**Verification:**

```bash
k -n ganymede describe quota compute-quota
k -n ganymede describe pod resource-pod | grep -A6 "Limits"
```

---

# Answer 17

**Weight: 8%**

- [ ] Identified the issues causing CrashLoopBackOff
- [ ] Fixed wrong image name/tag
- [ ] Fixed incorrect container port
- [ ] Fixed misconfigured readiness probe
- [ ] Deployment has 3 running replicas
- [ ] All issues written to /opt/course/p17/issues.txt

**Solution:**

Debug the Deployment:

```bash
k -n pandora get pods
k -n pandora describe pod <pod-name>
k -n pandora logs <pod-name>
k -n pandora get deploy web-app -o yaml
```

Common issues to check and fix:

```bash
k -n pandora edit deploy web-app
```

Fix issues such as:
- Wrong image: change to correct image (e.g., `nginx:alpine`)
- Wrong containerPort: should be `80`
- Wrong readinessProbe: should check correct port and path

Write issues:

```bash
cat << 'EOF' > /opt/course/p17/issues.txt
1. Wrong image name/tag - container image was incorrect
2. Incorrect container port configuration
3. Readiness probe checking wrong port/path
EOF
```

**Verification:**

```bash
k -n pandora get deploy web-app
# READY should show 3/3
k -n pandora get pods -l app=web-app
# All pods should be Running and Ready
```
