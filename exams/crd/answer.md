---
title: CKAD Practice - Custom Resource Definitions (Answers)
source: https://github.com/dgkanatsios/CKAD-exercises
---

# Answer 1

**Question:** Create a CustomResourceDefinition manifest file for an Operator with the following specifications :
* *Name* : `operators.stable.example.com`
* *Group* : `stable.example.com`
* *Schema*: `<email: string><name: string><age: integer>`
* *Scope*: `Namespaced`
* *Names*: `<plural: operators><singular: operator><shortNames: op>`
* *Kind*: `Operator`

**Solution:**

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  # name must match the spec fields below, and be in the form: <plural>.<group>
  name: operators.stable.example.com
spec:
  group: stable.example.com
  versions:
    - name: v1
      served: true
      # One and only one version must be marked as the storage version.
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                email:
                  type: string
                name:
                  type: string
                age:
                  type: integer
  scope: Namespaced
  names:
    plural: operators
    singular: operator
    # kind is normally the CamelCased singular type. Your resource manifests use this.
    kind: Operator
    shortNames:
    - op
```

---

# Answer 2

**Question:** Create the CRD resource in the K8S API

**Solution:**

```bash
kubectl apply -f operator-crd.yml
```

---

# Answer 3

**Question:** Create custom object from the CRD

* *Name* : `operator-sample`
* *Kind*: `Operator`
* Spec:
  * email: `operator-sample@stable.example.com`
  * name: `operator sample`
  * age: `30`

**Solution:**

```yaml
apiVersion: stable.example.com/v1
kind: Operator
metadata:
  name: operator-sample
spec:
  email: operator-sample@stable.example.com
  name: "operator sample"
  age: 30
```

```bash
kubectl apply -f operator.yml
```

---

# Answer 4

**Question:** Listing operator

**Solution:**

Use singular, plural and short forms

```bash
kubectl get operators
or
kubectl get operator
or
kubectl get op
```

---

