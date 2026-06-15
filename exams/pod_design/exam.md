---
title: CKAD Practice - Pod Design (20% of exam)
duration: 255
pass_percentage: 66
source: https://github.com/dgkanatsios/CKAD-exercises
---

# Documentation References

- kubernetes.io > Documentation > Concepts > Overview > Working with Kubernetes Objects > [Labels and Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#label-selectors)
- kubernetes.io > Documentation > Concepts > Workloads > Workload Resources > [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment)
- kubernetes.io > Documentation > Tasks > Run Jobs > [Running Automated Tasks with a CronJob](https://kubernetes.io/docs/tasks/job/automated-tasks-with-cron-jobs/)

# Question 1 | Create 3 pods with names nginx1,nginx2,nginx3. All of...
weight: 1

Create 3 pods with names nginx1,nginx2,nginx3. All of them should have the label app=v1

# Question 2 | Show all labels of the pods
weight: 1

Show all labels of the pods

# Question 3 | Change the labels of pod 'nginx2' to be app=v2
weight: 1

Change the labels of pod 'nginx2' to be app=v2

# Question 4 | Get the label 'app' for the pods (show a column with APP...
weight: 1

Get the label 'app' for the pods (show a column with APP labels)

# Question 5 | Get only the 'app=v2' pods
weight: 1

Get only the 'app=v2' pods

# Question 6 | Get 'app=v2' and not 'tier=frontend' pods
weight: 1

Get 'app=v2' and not 'tier=frontend' pods

# Question 7 | Add a new label tier=web to all pods having 'app=v2' or...
weight: 1

Add a new label tier=web to all pods having 'app=v2' or 'app=v1' labels

# Question 8 | Add an annotation 'owner: marketing' to all pods having...
weight: 1

Add an annotation 'owner: marketing' to all pods having 'app=v2' label

# Question 9 | Remove the 'app' label from the pods we created before
weight: 1

Remove the 'app' label from the pods we created before

# Question 10 | Annotate pods nginx1, nginx2, nginx3 with...
weight: 1

Annotate pods nginx1, nginx2, nginx3 with "description='my description'" value

# Question 11 | Check the annotations for pod nginx1
weight: 1

Check the annotations for pod nginx1

# Question 12 | Remove the annotations for these three pods
weight: 1

Remove the annotations for these three pods

# Question 13 | Remove these pods to have a clean state in your cluster
weight: 1

Remove these pods to have a clean state in your cluster

# Question 14 | Create a pod that will be deployed to a Node that has...
weight: 1

Create a pod that will be deployed to a Node that has the label 'accelerator=nvidia-tesla-p100'

# Question 15 | Create a pod that will be placed on node `node01` using...
weight: 1

Create a pod that will be placed on node `node01` using `nodeName`

# Question 16 | Taint a node with key `tier` and value `frontend` with...
weight: 1

Taint a node with key `tier` and value `frontend` with the effect `NoSchedule`. Then, create a pod that tolerates this taint.

# Question 17 | Create a pod that will be placed on node `controlplane`....
weight: 1

Create a pod that will be placed on node `controlplane`. Use nodeSelector and tolerations.

# Question 18 | Create a deployment with image nginx:1.18.0, called...
weight: 1

Create a deployment with image nginx:1.18.0, called nginx, having 2 replicas, defining port 80 as the port that this container exposes (don't create a service for this deployment)

# Question 19 | View the YAML of this deployment
weight: 1

View the YAML of this deployment

# Question 20 | View the YAML of the replica set that was created by...
weight: 1

View the YAML of the replica set that was created by this deployment

# Question 21 | Get the YAML for one of the pods
weight: 1

Get the YAML for one of the pods

# Question 22 | Check how the deployment rollout is going
weight: 1

Check how the deployment rollout is going

# Question 23 | Update the nginx image to nginx:1.19.8
weight: 1

Update the nginx image to nginx:1.19.8

# Question 24 | Check the rollout history and confirm that the replicas...
weight: 1

Check the rollout history and confirm that the replicas are OK

# Question 25 | Undo the latest rollout and verify that new pods have...
weight: 1

Undo the latest rollout and verify that new pods have the old image (nginx:1.18.0)

# Question 26 | Do an on-purpose update of the deployment with a wrong...
weight: 1

Do an on-purpose update of the deployment with a wrong image nginx:1.91

# Question 27 | Verify that something's wrong with the rollout
weight: 1

Verify that something's wrong with the rollout

# Question 28 | Return the deployment to the second revision (number 2)...
weight: 1

Return the deployment to the second revision (number 2) and verify the image is nginx:1.19.8

# Question 29 | Check the details of the fourth revision (number 4)
weight: 1

Check the details of the fourth revision (number 4)

# Question 30 | Scale the deployment to 5 replicas
weight: 1

Scale the deployment to 5 replicas

# Question 31 | Autoscale the deployment, pods between 5 and 10,...
weight: 1

Autoscale the deployment, pods between 5 and 10, targeting CPU utilization at 80%

# Question 32 | Pause the rollout of the deployment
weight: 1

Pause the rollout of the deployment

# Question 33 | Update the image to nginx:1.19.9 and check that there's...
weight: 1

Update the image to nginx:1.19.9 and check that there's nothing going on, since we paused the rollout

# Question 34 | Resume the rollout and check that the nginx:1.19.9 image...
weight: 1

Resume the rollout and check that the nginx:1.19.9 image has been applied

# Question 35 | Delete the deployment and the horizontal pod autoscaler...
weight: 1

Delete the deployment and the horizontal pod autoscaler you created

# Question 36 | Implement canary deployment by running two instances of...
weight: 1

Implement canary deployment by running two instances of nginx marked as version=v1 and version=v2 so that the load is balanced at 75%-25% ratio

# Question 37 | Create a job named pi with image perl:5.34 that runs the...
weight: 1

Create a job named pi with image perl:5.34 that runs the command with arguments "perl -Mbignum=bpi -wle 'print bpi(2000)'"

# Question 38 | Wait till it's done, get the output
weight: 1

Wait till it's done, get the output

# Question 39 | Create a job with the image busybox that executes the...
weight: 1

Create a job with the image busybox that executes the command 'echo hello;sleep 30;echo world'

# Question 40 | Follow the logs for the pod (you'll wait for 30 seconds)
weight: 1

Follow the logs for the pod (you'll wait for 30 seconds)

# Question 41 | See the status of the job, describe it and see the logs
weight: 1

See the status of the job, describe it and see the logs

# Question 42 | Delete the job
weight: 1

Delete the job

# Question 43 | Create the same job, make it run 5 times, one after the...
weight: 1

Create the same job, make it run 5 times, one after the other. Verify its status and delete it

# Question 44 | Create the same job, but make it run 5 parallel times
weight: 1

Create the same job, but make it run 5 parallel times

# Question 45 | Create a job but ensure that it will be automatically...
weight: 1

Create a job but ensure that it will be automatically terminated by kubernetes if it takes more than 30 seconds to execute

# Question 46 | Create a cron job with image busybox that runs on a...
weight: 1

Create a cron job with image busybox that runs on a schedule of "*/1 * * * *" and writes 'date; echo Hello from the Kubernetes cluster' to standard output

# Question 47 | See its logs and delete it
weight: 1

See its logs and delete it

# Question 48 | Create the same cron job again, and watch the status....
weight: 1

Create the same cron job again, and watch the status. Once it ran, check which job ran by the created cron job. Check the log, and delete the cron job

# Question 49 | Create a cron job with image busybox that runs every...
weight: 1

Create a cron job with image busybox that runs every minute and writes 'date; echo Hello from the Kubernetes cluster' to standard output. The cron job should be terminated if it takes more than 17 seconds to start execution after its scheduled time (i.e. the job missed its scheduled time).

# Question 50 | Create a cron job with image busybox that runs every...
weight: 1

Create a cron job with image busybox that runs every minute and writes 'date; echo Hello from the Kubernetes cluster' to standard output. The cron job should be terminated if it successfully starts but takes more than 12 seconds to complete execution.

# Question 51 | Create a job from cronjob.
weight: 1

Create a job from cronjob.

