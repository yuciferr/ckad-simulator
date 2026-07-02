# 09 — Kubernetes Versiyon Stratejisi

> **Branch:** `kind-migration`  
> **Kapsam:** 2026 CKAD sınavı için doğru Kubernetes versiyonu seçimi, kubectl uyumu ve güncelleme stratejisi.

---

## 1. 2026 CKAD Sınavında Hangi Kubernetes Versiyonu Kullanılıyor?

### Resmi Bilgi (Linux Foundation / CNCF)

CKAD sınavı genellikle **Kubernetes'in en son kararlı sürümüne yakın** bir versiyon kullanır, tam olarak latest değil. Tipik gecikme: 1-2 minor versiyon.

| Yıl | Sınavdaki K8s Versiyonu |
|-----|------------------------|
| 2023 | v1.26-1.27 |
| 2024 | v1.28-1.29 |
| 2025 | v1.30-1.31 |
| 2026 (tahmini) | **v1.32-1.33** |

> **Güncel bilgi için:** https://training.linuxfoundation.org/certification/certified-kubernetes-application-developer-ckad/  
> "Exam Environment" bölümünde K8s versiyonu belirtilir.

### 2026 İçin Önerimiz: **Kubernetes v1.32.x**

Gerekçe:
- v1.32 Aralık 2024'te stable oldu
- CKAD sınavında genellikle stable+1 kullanılır
- v1.33 Nisan 2025'te stable oldu (2026 başı itibariyle olgun)
- Her iki versiyon da CKAD için geçerli

**Karar:** `kindest/node:v1.32.3` ile başla, v1.33'e geçiş kolay.

---

## 2. CKAD 2026 Güncel Müfredat

Linux Foundation CKAD müfredatı (2024 güncellemesinden itibaren):

| Alan | Ağırlık | Temel Konular |
|------|---------|--------------|
| Application Design and Build | 20% | Containers, Multi-container pods, Init containers, Volumes |
| Application Deployment | 20% | Deployments, Rolling updates, Helm, Kustomize |
| Application Observability and Maintenance | 15% | Probes, Logs, Debugging, API deprecations |
| Application Environment, Configuration and Security | 25% | ConfigMaps, Secrets, ServiceAccounts, RBAC, SecurityContext, NetworkPolicy |
| Services and Networking | 20% | Services, Ingress, NetworkPolicy |

**2025-2026 yeni eklemeler:**
- `kubectl debug` komutu artık sınavda ✅
- Ephemeral containers ✅
- `kubectl diff` ✅
- Gateway API (bilgi düzeyi) ⚠️ (Ingress hala birincil)
- Server-side apply (`kubectl apply --server-side`) ⚠️

---

## 3. kind Versiyon Matrisi

kind versiyonu ve desteklenen Kubernetes versiyonları:

| kind Versiyon | Desteklenen K8s | Notlar |
|---------------|----------------|--------|
| v0.24.0 | v1.31, v1.32 | Önerilen (2025 sonu) |
| v0.23.0 | v1.30, v1.31 | |
| v0.30.0 | v1.32, v1.33 | Yerel kurulum: `kind v0.30.0` ✅ |

> Mevcut yerel kurulumunuz: `kind v0.30.0` — v1.32 ve v1.33 için uygun.

---

## 4. kubectl Versiyon Skew Politikası

Kubernetes'in resmi versiyonu politikası:

```
kubectl versiyonu ±1 minor versiyon API server'dan farklı olabilir
```

Örnek:
- API server: v1.32.x
- kubectl client: v1.31.x, v1.32.x, veya v1.33.x → hepsi geçerli

**Mevcut durumunuz:**
- Yerel kubectl: `v1.34.1` ✅
- kind cluster (planlanan): `v1.32.3` ✅
- Skew: 2 minor versiyon — dikkat!

Resmi politika ±1 minor versiyon ama pratikte 2 versiyon fark da genellikle çalışır. Yine de production senaryolarında 1 minor versiyon farkta kalmak önerilir.

**Öneri:** Backend container'daki kubectl versiyonunu `v1.32.x` veya `v1.33.x` yap.

---

## 5. `kindest/node` Image'ları

```bash
# Mevcut kindest/node image'larını listele
docker search kindest/node

# Önerilen 2026 tag'leri:
kindest/node:v1.32.3   # ← Birincil seçim
kindest/node:v1.33.1   # ← Alternatif (daha yeni)
kindest/node:v1.31.6   # ← Eski sürüm desteği
```

kind-config.yaml:
```yaml
nodes:
- role: control-plane
  image: kindest/node:v1.32.3  # 2026 CKAD için optimize
```

---

## 6. Hangi K8s Özellikleri 2026 Sınavında Çıkar?

### Kesinlikle Çıkacaklar (v1.32'de Stable)

```bash
# Pod lifecycle
kubectl run, kubectl apply, kubectl delete
kubectl exec, kubectl logs, kubectl cp
kubectl port-forward

# Probes
livenessProbe, readinessProbe, startupProbe

# Deployments
kubectl rollout status/undo/history
kubectl scale, kubectl set image

# Config
ConfigMap, Secret (Opaque, TLS, docker-registry)
kubectl create configmap --from-file --from-literal
kubectl create secret generic --from-file --from-literal

# RBAC
ServiceAccount, Role, ClusterRole, RoleBinding, ClusterRoleBinding
kubectl auth can-i

# Security
securityContext (runAsUser, runAsNonRoot, fsGroup, capabilities)
NetworkPolicy

# Storage
PersistentVolume, PersistentVolumeClaim, StorageClass
emptyDir, hostPath, configMap, secret volumes

# Services
ClusterIP, NodePort, LoadBalancer
kubectl expose

# Ingress
ingress.networking.k8s.io/v1

# Jobs
Job, CronJob
kubectl create job --from=cronjob

# Debugging
kubectl describe, kubectl get -o yaml/json/jsonpath/custom-columns
kubectl debug (ephemeral containers)
kubectl diff
```

### Yeni (2025-2026 Eklenen)

```bash
# kubectl debug — gerçek sınavda var
kubectl debug pod/mypod -it --image=busybox

# Server-side apply
kubectl apply --server-side -f manifest.yaml

# kubectl events
kubectl events --for=pod/mypod

# Sidecar containers (initContainers'da restartPolicy: Always)
# K8s v1.29+ GA
```

### Sınavda OLMAYAN Şeyler

- Cluster kurulumu (CKA'da var, CKAD'de yok)
- etcd yedekleme/geri yükleme
- Node maintenance (drain, cordon)
- kube-apiserver konfigürasyonu

---

## 7. Versiyon Güncelleme Rehberi

### Yeni CKAD K8s Versiyonu Çıktığında

Sadece iki yerde değişiklik:

```yaml
# docker/kind-config.yaml
nodes:
- role: control-plane
  image: kindest/node:v1.33.1  # ← Burası
```

```dockerfile
# docker/backend.Dockerfile
ARG KUBECTL_VERSION=v1.33.1    # ← Burası
```

```bash
# Rebuild ve test
docker compose build
docker compose up
kubectl version  # Yeni versiyon görmeli
```

**Bu kadar.** Simülasyon kodu yoksa güncelleme 10 dakika sürer.

---

## 8. Çoklu K8s Versiyonu Desteği

İleride farklı sınav versiyonları için:

```bash
# K8s 1.32 için
K8S_VERSION=v1.32.3 docker compose up

# K8s 1.33 için  
K8S_VERSION=v1.33.1 docker compose up
```

`docker-compose.yml` değişikliği:
```yaml
services:
  kind-init:
    build:
      args:
        K8S_VERSION: ${K8S_VERSION:-v1.32.3}
    environment:
      K8S_VERSION: ${K8S_VERSION:-v1.32.3}
```

`kind-config.yaml`'ı dinamik oluştur:
```bash
# init-cluster.sh
sed "s/KIND_K8S_VERSION/${K8S_VERSION}/g" /kind-config.yaml.tmpl > /kind-config.yaml
kind create cluster --config /kind-config.yaml
```

---

## 9. Özet Karar Tablosu

| Parametre | Değer | Gerekçe |
|-----------|-------|---------|
| K8s versiyon (cluster) | **v1.32.3** | 2026 CKAD için optimize |
| kubectl (backend container) | **v1.32.3** | Cluster ile uyumlu |
| kubectl (yerel) | v1.34.1 (mevcut) | Skew policy'e bakılmalı |
| kind versiyon | v0.24.0 (image) | v1.32 desteği var |
| Helm versiyon | v3.17.0 | En güncel stable |
| Node image | `kindest/node:v1.32.3` | |
| API group | `apps/v1`, `networking.k8s.io/v1` | v1.32'de stable |

---

## 10. Referanslar

- [CKAD Exam Curriculum](https://github.com/cncf/curriculum)
- [kind Release Notes](https://github.com/kubernetes-sigs/kind/releases)
- [Kubernetes Release Schedule](https://kubernetes.io/releases/)
- [kindest/node Docker Hub](https://hub.docker.com/r/kindest/node/tags)
- [kubectl version skew policy](https://kubernetes.io/releases/version-skew-policy/)
