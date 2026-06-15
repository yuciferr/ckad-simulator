---
title: CKAD Practice - Configuration (18% of exam)
duration: 150
pass_percentage: 66
source: https://github.com/dgkanatsios/CKAD-exercises
---

# Documentation References

- kubernetes.io > Documentation > Tasks > Configure Pods and Containers > [Configure a Pod to Use a ConfigMap](https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/)
- kubernetes.io > Documentation > Tasks > Configure Pods and Containers > [Configure a Security Context for a Pod or Container](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/)
- kubernetes.io > Documentation > Tasks > Configure Pods and Containers > [Assign CPU Resources to Containers and Pods](https://kubernetes.io/docs/tasks/configure-pod-container/assign-cpu-resource/)
- kubernetes.io > Documentation > Concepts > Policies > Limit Ranges (https://kubernetes.io/docs/concepts/policy/limit-range/)
- kubernetes.io > Documentation > Concepts > Policies > Resource Quotas (https://kubernetes.io/docs/concepts/policy/resource-quotas/)
- kubernetes.io > Documentation > Concepts > Configuration > [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- kubernetes.io > Documentation > Tasks > Inject Data Into Applications > [Distribute Credentials Securely Using Secrets](https://kubernetes.io/docs/tasks/inject-data-application/distribute-credentials-secure/)
- kubernetes.io > Documentation > Tasks > Configure Pods and Containers > [Configure Service Accounts for Pods](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/)

# Question 1 | Create a configmap named config with values...
weight: 3

Create a configmap named config with values foo=lala,foo2=lolo

# Question 2 | Display its values
weight: 3

Display its values

# Question 3 | Create and display a configmap from a file

Create the...
weight: 3

Create and display a configmap from a file

Create the file with

```bash
echo -e "foo3=lili\nfoo4=lele" > config.txt
```

# Question 4 | Create and display a configmap from a .env file

Create...
weight: 3

Create and display a configmap from a .env file

Create the file with the command

```bash
echo -e "var1=val1\n# this is a comment\n\nvar2=val2\n#anothercomment" > config.env
```

# Question 5 | Create and display a configmap from a file, giving the...
weight: 3

Create and display a configmap from a file, giving the key 'special'

Create the file with

```bash
echo -e "var3=val3\nvar4=val4" > config4.txt
```

# Question 6 | Create a configMap called 'options' with the value...
weight: 3

Create a configMap called 'options' with the value var5=val5. Create a new nginx pod that loads the value from variable 'var5' in an env variable called 'option'

# Question 7 | Create a configMap 'anotherone' with values 'var6=val6',...
weight: 3

Create a configMap 'anotherone' with values 'var6=val6', 'var7=val7'. Load this configMap as env variables into a new nginx pod

# Question 8 | Create a configMap 'cmvolume' with values 'var8=val8',...
weight: 3

Create a configMap 'cmvolume' with values 'var8=val8', 'var9=val9'. Load this as a volume inside an nginx pod on path '/etc/lala'. Create the pod and 'ls' into the '/etc/lala' directory.

# Question 9 | Create the YAML for an nginx pod that runs with the user...
weight: 3

Create the YAML for an nginx pod that runs with the user ID 101. No need to create the pod

# Question 10 | Create the YAML for an nginx pod that has the...
weight: 3

Create the YAML for an nginx pod that has the capabilities "NET_ADMIN", "SYS_TIME" added to its single container

# Question 11 | Create an nginx pod with requests cpu=100m,memory=256Mi...
weight: 3

Create an nginx pod with requests cpu=100m,memory=256Mi and limits cpu=200m,memory=512Mi

# Question 12 | Create a namespace named limitrange with a LimitRange...
weight: 3

Create a namespace named limitrange with a LimitRange that limits pod memory to a max of 500Mi and min of 100Mi

# Question 13 | Describe the namespace limitrange
weight: 3

Describe the namespace limitrange

# Question 14 | Create an nginx pod that requests 250Mi of memory in the...
weight: 3

Create an nginx pod that requests 250Mi of memory in the limitrange namespace

# Question 15 | Create ResourceQuota in namespace `one` with hard...
weight: 3

Create ResourceQuota in namespace `one` with hard requests `cpu=1`, `memory=1Gi` and hard limits `cpu=2`, `memory=2Gi`.

# Question 16 | Attempt to create a pod with resource requests `cpu=2`,...
weight: 3

Attempt to create a pod with resource requests `cpu=2`, `memory=3Gi` and limits `cpu=3`, `memory=4Gi` in namespace `one`

# Question 17 | Create a pod with resource requests `cpu=0.5`,...
weight: 3

Create a pod with resource requests `cpu=0.5`, `memory=1Gi` and limits `cpu=1`, `memory=2Gi` in namespace `one`

# Question 18 | Create a secret called mysecret with the values...
weight: 3

Create a secret called mysecret with the values password=mypass

# Question 19 | Create a secret called mysecret2 that gets key/value...
weight: 3

Create a secret called mysecret2 that gets key/value from a file

Create a file called username with the value admin:

```bash
echo -n admin > username
```

# Question 20 | Get the value of mysecret2
weight: 3

Get the value of mysecret2

# Question 21 | Create an nginx pod that mounts the secret mysecret2 in...
weight: 3

Create an nginx pod that mounts the secret mysecret2 in a volume on path /etc/foo

# Question 22 | Delete the pod you just created and mount the variable...
weight: 3

Delete the pod you just created and mount the variable 'username' from secret mysecret2 onto a new nginx pod in env variable called 'USERNAME'

# Question 23 | Create a Secret named 'ext-service-secret' in the...
weight: 3

Create a Secret named 'ext-service-secret' in the namespace 'secret-ops'. Then, provide the key-value pair API_KEY=LmLHbYhsgWZwNifiqaRorH8T as literal.

# Question 24 | Consuming the Secret. Create a Pod named 'consumer' with...
weight: 3

Consuming the Secret. Create a Pod named 'consumer' with the image 'nginx' in the namespace 'secret-ops' and consume the Secret as an environment variable. Then, open an interactive shell to the Pod, and print all environment variables.

# Question 25 | Create a Secret named 'my-secret' of type...
weight: 3

Create a Secret named 'my-secret' of type 'kubernetes.io/ssh-auth' in the namespace 'secret-ops'. Define a single key named 'ssh-privatekey', and point it to the file 'id_rsa' in this directory.

# Question 26 | Create a Pod named 'consumer' with the image 'nginx' in...
weight: 3

Create a Pod named 'consumer' with the image 'nginx' in the namespace 'secret-ops', and consume the Secret as Volume. Mount the Secret as Volume to the path /var/app with read-only access. Open an interactive shell to the Pod, and render the contents of the file.

# Question 27 | See all the service accounts of the cluster in all...
weight: 3

See all the service accounts of the cluster in all namespaces

# Question 28 | Create a new serviceaccount called 'myuser'
weight: 3

Create a new serviceaccount called 'myuser'

# Question 29 | Create an nginx pod that uses 'myuser' as a service account
weight: 3

Create an nginx pod that uses 'myuser' as a service account

# Question 30 | Generate an API token for the service account 'myuser'
weight: 3

Generate an API token for the service account 'myuser'

