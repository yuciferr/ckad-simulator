# 08 — Kolay Kurulum Rehberi

> **Branch:** `kind-migration`  
> **Kapsam:** Migration tamamlandıktan sonra sıfırdan kurulum yapan birinin takip edeceği adım adım rehber.  
> **Hedef:** `git clone` → çalışan sınav ortamı < 5 dakika (ilk cluster kurulumu hariç).

---

## 1. Gereksinimler

### Zorunlu

| Araç | Minimum Versiyon | Kontrol |
|------|-----------------|--------|
| Docker Engine | 24+ | `docker version` |
| Docker Compose | v2 (plugin) | `docker compose version` |
| RAM | 8 GB (4 GB minimum) | |
| Disk | 10 GB serbest | |

### macOS Docker Desktop Ayarı (Bir Kerelik)

```
Docker Desktop → Settings → Advanced:
☑️ "Allow the default Docker socket to be used (requires password)"
```

Bu ayar olmadan `/var/run/docker.sock` mount edilemiyor, kind cluster oluşturulamıyor.

---

## 2. Kurulum

### Adım 1: Repoyu Clone Et

```bash
git clone https://github.com/your-org/ckad-simulator.git
cd ckad-simulator
```

### Adım 2: Başlat

```bash
docker compose up
```

İlk çalıştırmada:
```
[kind-init] Creating kind cluster 'ckad-simulator'...
[kind-init] This takes ~60 seconds on first run...
[kind-init] ✓ Node ready: ckad-simulator-control-plane
[kind-init] ✓ kubeconfig written
[backend]   Building...
[backend]   Server running on http://localhost:3000
```

### Adım 3: Tarayıcıda Aç

```
http://localhost:3000
```

---

## 3. Geliştirme Modu

kind cluster'ı Docker Compose ile başlatıp backend'i yerel çalıştırmak daha hızlı iterasyon sağlar:

```bash
# Terminal 1: Sadece kind cluster başlat (bir kere yeterli)
docker compose up kind-init

# Terminal 2: Backend yerel olarak başlat (hot-reload)
export KUBECONFIG="$(kind get kubeconfig-path --name ckad-simulator)"
npm install
npm run dev
```

Değişiklikler anında yansır, container rebuild gerekmez.

---

## 4. Günlük Kullanım

### Başlatma

```bash
# Tüm stack'i başlat
docker compose up -d

# Logları takip et
docker compose logs -f backend
```

### Durdurma

```bash
# Backend durdur (kind cluster hayatta kalır)
docker compose down

# Kind cluster'ı da sil (tüm cluster state gider)
kind delete cluster --name ckad-simulator
```

### kind Cluster Sıfırlama

```bash
# Sadece cluster state temizle (tüm namespace'leri sil)
docker compose exec backend kubectl delete namespaces \
  -l managed-by=ckad-simulator

# Tam cluster yeniden oluştur (~60s)
kind delete cluster --name ckad-simulator
docker compose restart kind-init
```

---

## 5. Yararlı Komutlar

```bash
# Cluster durumunu kontrol et
docker compose exec backend kubectl get nodes
docker compose exec backend kubectl get pods -A

# Belirli bir soru namespace'ini incele
docker compose exec backend kubectl get all -n exam-q1

# Senaryo manuel uygula (debug için)
docker compose exec backend kubectl apply -f exams/mock/1/scenarios/q1/

# Senaryo sıfırla
docker compose exec backend bash /scripts/reset-question.sh 1

# Backend loglarını izle
docker compose logs -f backend

# kind-init loglarını gör
docker compose logs kind-init
```

---

## 6. Sorun Giderme

### "Cannot connect to Docker daemon"

```bash
# Docker çalışıyor mu?
docker info

# macOS: Docker Desktop açık mı?
open -a "Docker Desktop"

# Docker socket izni var mı?
ls -la /var/run/docker.sock
```

### "cluster not ready" — Backend Bağlanamıyor

```bash
# kind-init tamamlandı mı?
docker compose logs kind-init | tail -5
# "Cluster init complete" görünmeli

# kubeconfig volume oluştu mu?
docker volume ls | grep kind-kubeconfig

# Backend container kubectl kullanabiliyor mu?
docker compose exec backend kubectl cluster-info
```

### "ImagePullBackOff" — Pod Başlamıyor

```bash
# Image pull hatası
docker compose exec backend kubectl describe pod <pod-name> -n <ns>

# Manuel image pull (kind node içine)
docker exec ckad-simulator-control-plane \
  ctr images pull docker.io/library/nginx:1.25
```

### Soru Reset Çok Yavaş

İlk reset'te Docker Hub'dan image pull gerekiyor (~30-60s). Sonraki reset'ler hızlı olur (~3-5s). Image'lar kind node cache'de kalır.

```bash
# Tüm yaygın image'ları önceden pull et
docker compose exec backend bash /scripts/pre-pull-images.sh
```

### "Port already in use"

```bash
# 3000 portunu kim kullanıyor?
lsof -ti:3000

# Farklı port kullan
PORT=3001 docker compose up
```

---

## 7. Yeni Senaryo Eklemek

```bash
# 1. Senaryo dosyasını oluştur
mkdir -p exams/mock/1/scenarios/q18
cat > exams/mock/1/scenarios/q18/setup.yaml << 'EOF'
apiVersion: v1
kind: Namespace
metadata:
  name: exam-q18
---
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
  namespace: exam-q18
spec:
  containers:
  - name: nginx
    image: nginx:1.25
EOF

# 2. Cluster'a uygulayarak test et
kubectl apply -f exams/mock/1/scenarios/q18/setup.yaml
kubectl get pods -n exam-q18

# 3. Validate et
npm run validate:scenarios

# 4. Temizle
kubectl delete -f exams/mock/1/scenarios/q18/setup.yaml
```

---

## 8. İlk Başlatma Süresi Optimizasyonu

kind cluster **bir kere** oluşturulur. Sonraki `docker compose up` hızlıdır:

| Senaryo | Süre |
|---------|------|
| İlk `docker compose up` (cluster yok) | ~90 saniye |
| Sonraki `docker compose up` (cluster var) | ~10 saniye |
| Soru reset (cache'li image'lar) | ~3-8 saniye |
| Soru reset (yeni image, ilk kez) | ~30-90 saniye |

```bash
# Sürekli geliştirme için: cluster'ı silme
docker compose down   # Sadece container durdurur
docker compose up -d  # Sadece container başlatır (cluster zaten hazır)
```

---

## 9. Ortam Değişkenleri

```bash
# .env dosyası oluşturulabilir (isteğe bağlı)
PORT=3000
HOST=127.0.0.1
NODE_ENV=development
KIND_CLUSTER_NAME=ckad-simulator
SANDBOX_MODE=kind  # 'kind' veya 'simulation'
```

```bash
# Farklı K8s versiyonu test etmek için
KIND_K8S_VERSION=v1.31.0 docker compose up kind-init
```
