---
title: CKAD Practice - Custom Resource Definitions
duration: 30
pass_percentage: 66
source: https://github.com/dgkanatsios/CKAD-exercises
---

# Question 1 | Create a CustomResourceDefinition manifest file for an...
weight: 25

Create a CustomResourceDefinition manifest file for an Operator with the following specifications :
* *Name* : `operators.stable.example.com`
* *Group* : `stable.example.com`
* *Schema*: `<email: string><name: string><age: integer>`
* *Scope*: `Namespaced`
* *Names*: `<plural: operators><singular: operator><shortNames: op>`
* *Kind*: `Operator`

# Question 2 | Create the CRD resource in the K8S API
weight: 25

Create the CRD resource in the K8S API

# Question 3 | Create custom object from the CRD

* *Name* :...
weight: 25

Create custom object from the CRD

* *Name* : `operator-sample`
* *Kind*: `Operator`
* Spec:
  * email: `operator-sample@stable.example.com`
  * name: `operator sample`
  * age: `30`

# Question 4 | Listing operator
weight: 25

Listing operator

