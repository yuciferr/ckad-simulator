---
title: CKAD Practice - Services & Networking (13% of exam)
duration: 45
pass_percentage: 66
source: https://github.com/dgkanatsios/CKAD-exercises
---

# Documentation References

- kubernetes.io > Documentation > Concepts > Services, Load Balancing, and Networking > [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)

# Question 1 | Create a pod with image nginx called nginx and expose...
weight: 11

Create a pod with image nginx called nginx and expose its port 80

# Question 2 | Confirm that ClusterIP has been created. Also check...
weight: 11

Confirm that ClusterIP has been created. Also check endpoints

# Question 3 | Get service's ClusterIP, create a temp busybox pod and...
weight: 11

Get service's ClusterIP, create a temp busybox pod and 'hit' that IP with wget

# Question 4 | Convert the ClusterIP to NodePort for the same service...
weight: 11

Convert the ClusterIP to NodePort for the same service and find the NodePort port. Hit service using Node's IP. Delete the service and the pod at the end.

# Question 5 | Create a deployment called foo using image...
weight: 11

Create a deployment called foo using image 'dgkanatsios/simpleapp' (a simple server that returns hostname) and 3 replicas. Label it as 'app=foo'. Declare that containers in this pod will accept traffic on port 8080 (do NOT create a service yet)

# Question 6 | Get the pod IPs. Create a temp busybox pod and try...
weight: 11

Get the pod IPs. Create a temp busybox pod and try hitting them on port 8080

# Question 7 | Create a service that exposes the deployment on port...
weight: 11

Create a service that exposes the deployment on port 6262. Verify its existence, check the endpoints

# Question 8 | Create a temp busybox pod and connect via wget to foo...
weight: 11

Create a temp busybox pod and connect via wget to foo service. Verify that each time there's a different hostname returned. Delete deployment and services to cleanup the cluster

# Question 9 | Create an nginx deployment of 2 replicas, expose it via...
weight: 11

Create an nginx deployment of 2 replicas, expose it via a ClusterIP service on port 80. Create a NetworkPolicy so that only pods with labels 'access: granted' can access the pods in this deployment and apply it

kubernetes.io > Documentation > Concepts > Services, Load Balancing, and Networking > [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)

> Note that network policies may not be enforced by default, depending on your k8s implementation. E.g. Azure AKS by default won't have policy enforcement, the cluster must be created with an explicit support for `netpol` https://docs.microsoft.com/en-us/azure/aks/use-network-policies#overview-of-network-policy

