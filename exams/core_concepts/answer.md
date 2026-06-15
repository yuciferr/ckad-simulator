---
title: CKAD Practice - Core Concepts (Answers)
source: https://github.com/dgkanatsios/CKAD-exercises
---

# Answer 1

**Question:** Create a namespace called 'mynamespace' and a pod with image nginx called nginx on this namespace

**Solution:**

```bash
kubectl create namespace mynamespace
kubectl run nginx --image=nginx --restart=Never -n mynamespace
```

---

# Answer 2

**Question:** Create the pod that was just described using YAML

**Solution:**

Easily generate YAML with:

```bash
kubectl run nginx --image=nginx --restart=Never --dry-run=client -n mynamespace -o yaml > pod.yaml
```

```bash
cat pod.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: null
  labels:
    run: nginx
  name: nginx
  namespace: mynamespace
spec:
  containers:
  - image: nginx
    imagePullPolicy: IfNotPresent
    name: nginx
    resources: {}
  dnsPolicy: ClusterFirst
  restartPolicy: Never
status: {}
```

```bash
kubectl create -f pod.yaml
```

Alternatively, you can run in one line

```bash
kubectl run nginx --image=nginx --restart=Never --dry-run=client -o yaml | kubectl create -n mynamespace -f -
```

---

# Answer 3

**Question:** Create a busybox pod (using kubectl command) that runs the command "env". Run it and see the output

**Solution:**

```bash
kubectl run busybox --image=busybox --command --restart=Never -it --rm -- env # -it will help in seeing the output, --rm will immediately delete the pod after it exits
# or, just run it without -it
kubectl run busybox --image=busybox --command --restart=Never -- env
# and then, check its logs
kubectl logs busybox
```

---

# Answer 4

**Question:** Create a busybox pod (using YAML) that runs the command "env". Run it and see the output

**Solution:**

```bash
# create a  YAML template with this command
kubectl run busybox --image=busybox --restart=Never --dry-run=client -o yaml --command -- env > envpod.yaml
# see it
cat envpod.yaml
```

```YAML
apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: null
  labels:
    run: busybox
  name: busybox
spec:
  containers:
  - command:
    - env
    image: busybox
    name: busybox
    resources: {}
  dnsPolicy: ClusterFirst
  restartPolicy: Never
status: {}
```

```bash
# apply it and then see the logs
kubectl apply -f envpod.yaml
kubectl logs busybox
```

---

# Answer 5

**Question:** Get the YAML for a new namespace called 'myns' without creating it

**Solution:**

```bash
kubectl create namespace myns -o yaml --dry-run=client
```

---

# Answer 6

**Question:** Create the YAML for a new ResourceQuota called 'myrq' with hard limits of 1 CPU, 1G memory and 2 pods without creating it

**Solution:**

```bash
kubectl create quota myrq --hard=cpu=1,memory=1G,pods=2 --dry-run=client -o yaml
```

---

# Answer 7

**Question:** Get pods on all namespaces

**Solution:**

```bash
kubectl get po --all-namespaces
```
Alternatively 

```bash
kubectl get po -A
```

---

# Answer 8

**Question:** Create a pod with image nginx called nginx and expose traffic on port 80

**Solution:**

```bash
kubectl run nginx --image=nginx --restart=Never --port=80
```

---

# Answer 9

**Question:** Change pod's image to nginx:1.24.0. Observe that the container will be restarted as soon as the image gets pulled

**Solution:**

*Note*: The `RESTARTS` column should contain 0 initially (ideally - it could be any number)

```bash
# kubectl set image POD/POD_NAME CONTAINER_NAME=IMAGE_NAME:TAG
kubectl set image pod/nginx nginx=nginx:1.24.0
kubectl describe po nginx # you will see an event 'Container will be killed and recreated'
kubectl get po nginx -w # watch it
```

*Note*: some time after changing the image, you should see that the value in the `RESTARTS` column has been increased by 1, because the container has been restarted, as stated in the events shown at the bottom of the `kubectl describe pod` command:

```
Events:
  Type    Reason     Age                  From               Message
  ----    ------     ----                 ----               -------
[...]
  Normal  Killing    100s                 kubelet, node3     Container pod1 definition changed, will be restarted
  Normal  Pulling    100s                 kubelet, node3     Pulling image "nginx:1.24.0"
  Normal  Pulled     41s                  kubelet, node3     Successfully pulled image "nginx:1.24.0"
  Normal  Created    36s (x2 over 9m43s)  kubelet, node3     Created container pod1
  Normal  Started    36s (x2 over 9m43s)  kubelet, node3     Started container pod1
```

*Note*: you can check pod's image by running

```bash
kubectl get po nginx -o jsonpath='{.spec.containers[].image}{"\n"}'
```

---

# Answer 10

**Question:** Get nginx pod's ip created in previous step, use a temp busybox image to wget its '/'

**Solution:**

```bash
kubectl get po -o wide # get the IP, will be something like '10.1.1.131'
# create a temp busybox pod
kubectl run busybox --image=busybox --rm -it --restart=Never -- wget -O- 10.1.1.131:80
```

Alternatively you can also try a more advanced option:

```bash
# Get IP of the nginx pod
NGINX_IP=$(kubectl get pod nginx -o jsonpath='{.status.podIP}')
# create a temp busybox pod
kubectl run busybox --image=busybox --env="NGINX_IP=$NGINX_IP" --rm -it --restart=Never -- sh -c 'wget -O- $NGINX_IP:80'
``` 

Or just in one line:

```bash
kubectl run busybox --image=busybox --rm -it --restart=Never -- wget -O- $(kubectl get pod nginx -o jsonpath='{.status.podIP}:{.spec.containers[0].ports[0].containerPort}')
```

---

# Answer 11

**Question:** Get pod's YAML

**Solution:**

```bash
kubectl get po nginx -o yaml
# or
kubectl get po nginx -oyaml
# or
kubectl get po nginx --output yaml
# or
kubectl get po nginx --output=yaml
```

---

# Answer 12

**Question:** Get information about the pod, including details about potential issues (e.g. pod hasn't started)

**Solution:**

```bash
kubectl describe po nginx
```

---

# Answer 13

**Question:** Get pod logs

**Solution:**

```bash
kubectl logs nginx
```

---

# Answer 14

**Question:** If pod crashed and restarted, get logs about the previous instance

**Solution:**

```bash
kubectl logs nginx -p
# or
kubectl logs nginx --previous
```

---

# Answer 15

**Question:** Execute a simple shell on the nginx pod

**Solution:**

```bash
kubectl exec -it nginx -- /bin/sh
```

---

# Answer 16

**Question:** Create a busybox pod that echoes 'hello world' and then exits

**Solution:**

```bash
kubectl run busybox --image=busybox -it --restart=Never -- echo 'hello world'
# or
kubectl run busybox --image=busybox -it --restart=Never -- /bin/sh -c 'echo hello world'
```

---

# Answer 17

**Question:** Do the same, but have the pod deleted automatically when it's completed

**Solution:**

```bash
kubectl run busybox --image=busybox -it --rm --restart=Never -- /bin/sh -c 'echo hello world'
kubectl get po # nowhere to be found :)
```

---

# Answer 18

**Question:** Create an nginx pod and set an env value as 'var1=val1'. Check the env value existence within the pod

**Solution:**

```bash
kubectl run nginx --image=nginx --restart=Never --env=var1=val1
# then
kubectl exec -it nginx -- env
# or
kubectl exec -it nginx -- sh -c 'echo $var1'
# or
kubectl describe po nginx | grep val1
# or
kubectl run nginx --restart=Never --image=nginx --env=var1=val1 -it --rm -- env
# or
kubectl run nginx --image nginx --restart=Never --env=var1=val1 -it --rm -- sh -c 'echo $var1'
```

---

