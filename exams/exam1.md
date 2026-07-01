---
title: CKAD Mock Exam 1
duration: 120
pass_percentage: 66
---

# Question 1 | Liveness Probe
weight: 7
context: ssh ckad9043

In Namespace `pluto` there is a Deployment named `project-23-api`. It has been working okay for a while but Team Pluto needs it to be more reliable. Implement a liveness-probe which checks the container to be reachable on port `80`. Initially the probe should wait `10`, periodically `15` seconds.

The original Deployment yaml is available at `/opt/course/p1/project-23-api.yaml`. Save your changes at `/opt/course/p1/project-23-api-new.yaml` and apply the changes.

# Question 2 | Deployment and Service
weight: 5
context: ssh ckad9043

Team Sun needs a new Deployment named `sunny` with `4` replicas of image `nginx:1.17.3-alpine` in Namespace `sun`. The Deployment and its Pods should use the existing ServiceAccount `sa-sun-deploy`.

Expose the Deployment internally using a ClusterIP Service named `sun-srv` on port `9999`. The nginx containers should run as default on port `80`.

The management of Team Sun would like to execute a command to check that all Pods are running on occasion. Write that command into file `/opt/course/p2/sunny_status_command.sh`. The command should use kubectl.

# Question 3 | Troubleshooting Service
weight: 7
context: ssh ckad5601

Management of EarthAG recorded that one of their Services stopped working. Dirk, the administrator, left already for the long weekend. All the information they could give you is that it was located in Namespace `earth` and that it stopped working after the latest rollout. All Services of EarthAG should be reachable from inside the cluster.

Find the Service, fix any issues and confirm it's working again. Write the reason of the error into file `/opt/course/p3/ticket-654.txt` so Dirk knows what the issue was.

# Question 4 | CronJob
weight: 5
context: ssh ckad9043

Create a CronJob named `dice` in Namespace `moon` that runs every `30` minutes and uses the image `busybox:1.36`. The Job should execute the command `echo "Rolling dice: $(shuf -i 1-6 -n 1)"`.

The CronJob should:
- Keep `3` successful Job history entries
- Keep `1` failed Job history entry
- Have an active deadline of `20` seconds for each Job

After creating the CronJob, manually trigger a Job named `dice-test` from the CronJob to verify it works.

# Question 5 | NetworkPolicy
weight: 7
context: ssh ckad5601

In Namespace `neptune` there are three Pods: `frontend`, `backend`, and `database`. Currently all Pods can communicate with each other freely.

Create a NetworkPolicy named `np-backend` in Namespace `neptune` that:
- Targets the Pod `backend` (label: `app=backend`)
- Only allows **ingress** traffic from `frontend` Pod (label: `app=frontend`) on port `8080`
- Only allows **egress** traffic to `database` Pod (label: `app=database`) on port `3306`

# Question 6 | ConfigMap and Secret
weight: 5
context: ssh ckad9043

Create a ConfigMap named `app-config` in Namespace `mercury` with the following data:
- `APP_ENV=production`
- `APP_DEBUG=false`

Create a Secret named `app-secret` in Namespace `mercury` with the following data:
- `DB_USER=admin`
- `DB_PASS=s3cure!p@ss`

Create a Pod named `app-pod` in Namespace `mercury` using image `nginx:alpine` that:
- Mounts the ConfigMap as environment variables
- Mounts the Secret as environment variables with prefix `SECRET_`

# Question 7 | Canary Deployment
weight: 7
context: ssh ckad5601

In Namespace `mars` there is a Deployment named `web-app` with `5` replicas using image `nginx:1.24-alpine` and labels `app=web-app` and `version=v1`.

There is a Service named `web-app-svc` that routes traffic to Pods with label `app=web-app`.

Implement a Canary Deployment strategy:
1. Scale the existing Deployment to `8` replicas
2. Create a new Deployment named `web-app-canary` with `2` replicas using image `nginx:1.25-alpine` with labels `app=web-app` and `version=v2`

This should result in approximately 20% of traffic going to the canary version. Save the new Deployment YAML at `/opt/course/p7/canary.yaml`.

# Question 8 | Multi-container Pod (Sidecar)
weight: 5
context: ssh ckad9043

Create a Pod named `multi-pod` in Namespace `venus` with two containers:

1. **Main container** named `app`: image `busybox:1.36`, command: `sh -c 'while true; do echo "$(date) - Main app running" >> /var/log/app.log; sleep 5; done'`
2. **Sidecar container** named `logger`: image `busybox:1.36`, command: `sh -c 'tail -f /var/log/app.log'`

Both containers should share a volume named `log-volume` mounted at `/var/log` in both containers. Use an `emptyDir` volume.

# Question 9 | PersistentVolumeClaim
weight: 5
context: ssh ckad5601

In Namespace `jupiter` create a PersistentVolumeClaim named `data-pvc` that:
- Requests `500Mi` of storage
- Uses access mode `ReadWriteOnce`
- Uses StorageClass `standard`

Create a Pod named `data-pod` in Namespace `jupiter` using image `nginx:alpine` that mounts the PVC at `/data`.

Verify the PVC is bound and the Pod is running.

# Question 10 | RBAC - ServiceAccount, Role, RoleBinding
weight: 7
context: ssh ckad9043

In Namespace `saturn` there is a Pod named `inspector` that fails to list Pods. Check the Pod logs to confirm the error.

Fix this by performing the following steps:
1. Create a ServiceAccount named `inspector-sa` in Namespace `saturn`
2. Create a Role named `pod-reader` in Namespace `saturn` that allows `get`, `list`, and `watch` on `pods`
3. Create a RoleBinding named `inspector-binding` in Namespace `saturn` that binds the Role to the ServiceAccount
4. Update the Pod `inspector` to use the ServiceAccount `inspector-sa`

# Question 11 | Ingress
weight: 6
context: ssh ckad5601

In Namespace `uranus` there are two Services:
- `app-svc` running on port `80`
- `api-svc` running on port `8080`

Create an Ingress named `app-ingress` in Namespace `uranus` with the following rules:
- Host `app.ckad-exam.com` with path `/` should route to `app-svc` on port `80`
- Host `app.ckad-exam.com` with path `/api` should route to `api-svc` on port `8080`

Use `pathType: Prefix` for both rules. Set the IngressClassName to `nginx`.

# Question 12 | Rolling Update and Rollback
weight: 5
context: ssh ckad9043

In Namespace `titan` there is a Deployment named `rolling-app` using image `httpd:2.4-alpine`.

Perform the following:
1. Update the Deployment image to `httpd:2.4.58-alpine` and record the change
2. Wait for the rollout to complete
3. Verify the rollout history
4. Roll back to the previous version
5. Verify the rollback was successful by checking the current image

Write all commands you used into `/opt/course/p12/commands.sh`.

# Question 13 | Security Context
weight: 5
context: ssh ckad5601

Create a Pod named `secure-pod` in Namespace `io` using image `nginx:alpine` with the following security settings:

- The Pod should run as user `1000` and group `3000`
- The container should have the `NET_ADMIN` capability added
- The container filesystem should be read-only
- Mount an `emptyDir` volume at `/var/cache/nginx` and another at `/var/run` to allow nginx to run with read-only filesystem

# Question 14 | Helm
weight: 5
context: ssh ckad9043

The Helm chart repository `bitnami` is already added with URL `https://charts.bitnami.com/bitnami`.

Perform the following tasks:
1. Update the Helm repo
2. Install the chart `bitnami/nginx` with release name `web-release` in Namespace `europa` with the following values:
   - `replicaCount=2`
   - `service.type=ClusterIP`
3. After installation, verify the release status
4. Upgrade the release to set `replicaCount=3`
5. Verify the upgrade by checking the release history

# Question 15 | Job from CronJob
weight: 5
context: ssh ckad5601

In Namespace `callisto` there is an existing CronJob named `backup-job`.

Perform the following:
1. Create a one-off Job named `backup-manual` from the CronJob `backup-job`
2. Wait for the Job to complete
3. Check the logs of the completed Job
4. Write the output of the Job logs to `/opt/course/p15/backup-output.txt`

# Question 16 | Resource Requests and Limits
weight: 6
context: ssh ckad9043

Create a Pod named `resource-pod` in Namespace `ganymede` using image `nginx:alpine` with the following resource configuration:

- CPU request: `100m`
- CPU limit: `200m`
- Memory request: `64Mi`
- Memory limit: `128Mi`

Also, there is an existing ResourceQuota named `compute-quota` in Namespace `ganymede`. Verify that the Pod can be scheduled by checking the quota usage after creating the Pod.

# Question 17 | Container Image Build and Debugging
weight: 8
context: ssh ckad9043

In Namespace `pandora` there is a Deployment named `web-app` that is in a `CrashLoopBackOff` state.

Debug the Deployment and fix all issues. The expected behavior is:
- The Deployment should have `3` running replicas
- The container should serve content on port `80`
- The container should pass its readiness probe

Check the following possible issues:
- Wrong image name or tag
- Incorrect container port configuration
- Misconfigured readiness probe
- Wrong command or args

Write all the issues you found into `/opt/course/p17/issues.txt`.
