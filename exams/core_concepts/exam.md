---
title: CKAD Practice - Core Concepts (13% of exam)
duration: 90
pass_percentage: 66
source: https://github.com/dgkanatsios/CKAD-exercises
---

# Documentation References

- kubernetes.io > Documentation > Reference > kubectl CLI > [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- kubernetes.io > Documentation > Tasks > Monitoring, Logging, and Debugging > [Get a Shell to a Running Container](https://kubernetes.io/docs/tasks/debug-application-cluster/get-shell-running-container/)
- kubernetes.io > Documentation > Tasks > Access Applications in a Cluster > [Configure Access to Multiple Clusters](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)
- kubernetes.io > Documentation > Tasks > Access Applications in a Cluster > [Accessing Clusters](https://kubernetes.io/docs/tasks/access-application-cluster/access-cluster/) using API
- kubernetes.io > Documentation > Tasks > Access Applications in a Cluster > [Use Port Forwarding to Access Applications in a Cluster](https://kubernetes.io/docs/tasks/access-application-cluster/port-forward-access-application-cluster/)

# Question 1 | Create a namespace called 'mynamespace' and a pod with...
weight: 5

Create a namespace called 'mynamespace' and a pod with image nginx called nginx on this namespace

# Question 2 | Create the pod that was just described using YAML
weight: 5

Create the pod that was just described using YAML

# Question 3 | Create a busybox pod (using kubectl command) that runs...
weight: 5

Create a busybox pod (using kubectl command) that runs the command "env". Run it and see the output

# Question 4 | Create a busybox pod (using YAML) that runs the command...
weight: 5

Create a busybox pod (using YAML) that runs the command "env". Run it and see the output

# Question 5 | Get the YAML for a new namespace called 'myns' without...
weight: 5

Get the YAML for a new namespace called 'myns' without creating it

# Question 6 | Create the YAML for a new ResourceQuota called 'myrq'...
weight: 5

Create the YAML for a new ResourceQuota called 'myrq' with hard limits of 1 CPU, 1G memory and 2 pods without creating it

# Question 7 | Get pods on all namespaces
weight: 5

Get pods on all namespaces

# Question 8 | Create a pod with image nginx called nginx and expose...
weight: 5

Create a pod with image nginx called nginx and expose traffic on port 80

# Question 9 | Change pod's image to nginx:1.24.0. Observe that the...
weight: 5

Change pod's image to nginx:1.24.0. Observe that the container will be restarted as soon as the image gets pulled

# Question 10 | Get nginx pod's ip created in previous step, use a temp...
weight: 5

Get nginx pod's ip created in previous step, use a temp busybox image to wget its '/'

# Question 11 | Get pod's YAML
weight: 5

Get pod's YAML

# Question 12 | Get information about the pod, including details about...
weight: 5

Get information about the pod, including details about potential issues (e.g. pod hasn't started)

# Question 13 | Get pod logs
weight: 5

Get pod logs

# Question 14 | If pod crashed and restarted, get logs about the...
weight: 5

If pod crashed and restarted, get logs about the previous instance

# Question 15 | Execute a simple shell on the nginx pod
weight: 5

Execute a simple shell on the nginx pod

# Question 16 | Create a busybox pod that echoes 'hello world' and then...
weight: 5

Create a busybox pod that echoes 'hello world' and then exits

# Question 17 | Do the same, but have the pod deleted automatically when...
weight: 5

Do the same, but have the pod deleted automatically when it's completed

# Question 18 | Create an nginx pod and set an env value as 'var1=val1'....
weight: 5

Create an nginx pod and set an env value as 'var1=val1'. Check the env value existence within the pod

