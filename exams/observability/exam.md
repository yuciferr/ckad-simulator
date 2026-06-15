---
title: CKAD Practice - Observability (18% of exam)
duration: 40
pass_percentage: 66
source: https://github.com/dgkanatsios/CKAD-exercises
---

# Documentation References

- kubernetes.io > Documentation > Tasks > Configure Pods and Containers > [Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)

# Question 1 | Create an nginx pod with a liveness probe that just runs...
weight: 12

Create an nginx pod with a liveness probe that just runs the command 'ls'. Save its YAML in pod.yaml. Run it, check its probe status, delete it.

# Question 2 | Modify the pod.yaml file so that liveness probe starts...
weight: 12

Modify the pod.yaml file so that liveness probe starts kicking in after 5 seconds whereas the interval between probes would be 5 seconds. Run it, check the probe, delete it.

# Question 3 | Create an nginx pod (that includes port 80) with an HTTP...
weight: 12

Create an nginx pod (that includes port 80) with an HTTP readinessProbe on path '/' on port 80. Again, run it, check the readinessProbe, delete it.

# Question 4 | Lots of pods are running in `qa`,`alan`,`test`,`productio...
weight: 12

Lots of pods are running in `qa`,`alan`,`test`,`production` namespaces.  All of these pods are configured with liveness probe.  Please list all pods whose liveness probe are failed in the format of `<namespace>/<pod name>` per line.

# Question 5 | Create a busybox pod that runs `i=0; while true; do echo...
weight: 12

Create a busybox pod that runs `i=0; while true; do echo "$i: $(date)"; i=$((i+1)); sleep 1; done`. Check its logs

# Question 6 | Create a busybox pod that runs 'ls /notexist'. Determine...
weight: 12

Create a busybox pod that runs 'ls /notexist'. Determine if there's an error (of course there is), see it. In the end, delete the pod

# Question 7 | Create a busybox pod that runs 'notexist'. Determine if...
weight: 12

Create a busybox pod that runs 'notexist'. Determine if there's an error (of course there is), see it. In the end, delete the pod forcefully with a 0 grace period

# Question 8 | Get CPU/memory utilization for nodes...
weight: 12

Get CPU/memory utilization for nodes ([metrics-server](https://github.com/kubernetes-incubator/metrics-server) must be running)

