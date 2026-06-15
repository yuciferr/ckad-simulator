---
title: CKAD Practice - Helm (Answers)
source: https://github.com/dgkanatsios/CKAD-exercises
---

# Answer 1

**Question:** Creating a basic Helm chart

**Solution:**

```bash
helm create chart-test ## this would create a helm 
```

---

# Answer 2

**Question:** Running a Helm chart

**Solution:**

```bash
helm install -f myvalues.yaml myredis ./redis
```

---

# Answer 3

**Question:** Find pending Helm deployments on all namespaces

**Solution:**

```bash
helm list --pending -A
```

---

# Answer 4

**Question:** Uninstall a Helm release

**Solution:**

```bash
helm uninstall -n namespace release_name
```

---

# Answer 5

**Question:** Upgrading a Helm chart

**Solution:**

```bash
helm upgrade -f myvalues.yaml -f override.yaml redis ./redis
```

---

# Answer 6

**Question:** Using Helm repo

**Solution:**

Add, list, remove, update and index chart repos

```bash
helm repo add [NAME] [URL]  [flags]

helm repo list / helm repo ls

helm repo remove [REPO1] [flags]

helm repo update / helm repo up

helm repo update [REPO1] [flags]

helm repo index [DIR] [flags]
```

---

# Answer 7

**Question:** Download a Helm chart from a repository

**Solution:**

```bash
helm pull [chart URL | repo/chartname] [...] [flags] ## this would download a helm, not install 
helm pull --untar [rep/chartname] # untar the chart after downloading it 
```

---

# Answer 8

**Question:** Add the Bitnami repo at https://charts.bitnami.com/bitnami to Helm

**Solution:**

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
```

---

# Answer 9

**Question:** Write the contents of the values.yaml file of the `bitnami/node` chart to standard output

**Solution:**

```bash
helm show values bitnami/node
```

---

# Answer 10

**Question:** Install the `bitnami/node` chart setting the number of replicas to 5

**Solution:**

To achieve this, we need two key pieces of information:
- The name of the attribute in values.yaml which controls replica count
- A simple way to set the value of this attribute during installation

To identify the name of the attribute in the values.yaml file, we could get all the values, as in the previous task, and then grep to find attributes matching the pattern `replica`
```bash
helm show values bitnami/node | grep -i replica
```
which returns
```bash
## @param replicaCount Specify the number of replicas for the application
replicaCount: 1
```
 
We can use the `--set` argument during installation to override attribute values. Hence, to set the replica count to 5, we need to run
```bash
helm install mynode bitnami/node --set replicaCount=5
```

---

