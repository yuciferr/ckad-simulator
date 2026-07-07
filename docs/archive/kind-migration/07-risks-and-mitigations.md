# 07 — Riskler ve Önlemler

> **Branch:** `kind-migration`  
> **Kapsam:** Migration sürecinde ve sonrasında karşılaşılabilecek teknik ve operasyonel sorunlar, her biri için önlemler.

---

## 1. Teknik Riskler

### R1 — Docker-in-Docker (DinD) Problemi

**Problem:**  
Backend container içinden `kubectl` çağrısı kind cluster'a gider. Ama kind cluster Docker container olarak çalışıyor. Backend container'ın Docker daemon'a erişmesi için `/var/run/docker.sock` mount edilmeli. Bu "Docker socket mounting" güvenlik riski oluşturur.

**Neden Risk:**
- Container içinden Docker daemon'a erişim = host'a tam erişim potansiyeli
- Production ortamında kabul edilemez
- Yanlış kullanımda host sistemi zarar görebilir

**Önlem:**
```yaml
# docker-compose.yml
services:
  backend:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    # Risk: sadece local dev için
    # Production için: ayrı K8s cluster veya managed K8s kullan
```

**Kısa vadeli çözüm (local dev):** `/var/run/docker.sock` mount kabul edilebilir — bu **kişisel dev ortamı**, production değil.

**Uzun vadeli çözüm:** kind cluster'ı Docker Compose dışında, host'ta çalıştır. Backend doğrudan host kubeconfig'ini kullanır.

---

### R2 — kind Cluster Başlatma Süresi

**Problem:**  
İlk `docker compose up` sırasında kind cluster oluşturma ~60-90 saniye sürer. Bu süre boyunca kullanıcı beklemeye alınır.

**Önlem A — Cluster'ı Docker Compose dışında önceden oluştur:**
```bash
# Geliştirici bir kere çalıştırır
kind create cluster --name ckad-simulator --config docker/kind-config.yaml

# Sonra her seferinde sadece backend başlar (~5s)
docker compose up backend
```

**Önlem B — Startup sırasında progress göster:**
```
$ docker compose up
[kind-init] Creating kind cluster (first time ~60s)...
[kind-init] Waiting for nodes...
[kind-init] ✓ Cluster ready
[backend]   Starting server on :3000
```

**Önlem C — kind cluster'ı silme (down sırasında)**
```yaml
# docker-compose.yml
services:
  kind-init:
    restart: "no"  # Cluster bir kere kurulur, silinmez
```

`docker compose down` kind cluster'ı silmez (sadece container'ı durdurur).  
`docker compose down --volumes` ile kubeconfig volume silinir ama cluster hayatta kalır.  
Cluster'ı silmek için: `kind delete cluster --name ckad-simulator`

---

### R3 — kubeconfig Erişim Sorunu

**Problem:**  
kind cluster oluşturulurken kubeconfig `127.0.0.1:PORT` referansı içeriyor. Backend container içinden bu adrese erişilemez (loopback ≠ host).

**Önlem:**  
`init-cluster.sh` içinde kubeconfig'i düzelt:

```bash
# init-cluster.sh
kind get kubeconfig --name "${CLUSTER_NAME}" > /tmp/kubeconfig-raw

# 127.0.0.1 → kind container IP ile değiştir
KIND_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
  "${CLUSTER_NAME}-control-plane")

sed "s/127.0.0.1:[0-9]*//${KIND_IP}:6443/g" /tmp/kubeconfig-raw > "${KUBECONFIG_OUTPUT}"

echo "Patched kubeconfig: 127.0.0.1 → ${KIND_IP}:6443"
```

**Alternatif:** kind'ın `--internal` flag'ini kullan:
```bash
kind get kubeconfig --name "${CLUSTER_NAME}" --internal > "${KUBECONFIG_OUTPUT}"
# --internal: Docker network IP'sini kullanır, loopback değil
```

> **Önemli:** Bu `--internal` flag en kritik detaylardan biri. Atlanırsa backend container kubectl bağlantısı kuramaz.

---

### R4 — Apple Silicon (ARM64) Image Uyumsuzluğu

**Problem:**  
Bazı Docker image'lar ARM64 desteklemiyor. Özellikle:
- `kindest/node` → ARM64 destekliyor ✅ (`v1.32.3` ARM64 var)
- `nginx`, `postgres` → Multi-arch ✅
- Eski veya niche image'lar → Sorun olabilir

**Önlem:**
```yaml
# kind-config.yaml
nodes:
- role: control-plane
  image: kindest/node:v1.32.3  # Multi-arch tag kullan
```

```bash
# Senaryo YAML'larında
image: nginx:1.25  # Multi-arch ✅
image: postgres:16 # Multi-arch ✅
# image: some-old-amd64-only-image → ❌ ARM'de çalışmaz
```

Öneri: Tüm senaryo YAML'larında multi-arch destekleyen official image'lar kullan.

---

### R5 — Namespace Kirliliği (State Leak)

**Problem:**  
Kullanıcı bir soruyu yanıtlarken namespace'de kaynaklar oluşturur. Bir sonraki reset'e kadar bu kaynaklar kalır. Eğer reset düzgün çalışmazsa eski state yeni soruya karışır.

**Önlem:**
```bash
# reset-question.sh — her zaman namespace'i SILER ve YENİDEN OLUŞTURUR
kubectl delete namespace "exam-q${N}" --ignore-not-found --wait=true
kubectl apply -f "scenarios/q${N}/"
```

`--wait=true` kritik: namespace tam silinmeden yeniden oluşturmaya çalışılırsa "namespace already exists" hatası alınır.

**Ek önlem — namespace finalizer takılması:**
```bash
# Namespace takılıp kalırsa (finalizer sorunu)
kubectl patch namespace "exam-q${N}" -p '{"metadata":{"finalizers":[]}}' --type=merge
```

---

### R6 — Pod Image Pull Gecikmesi (İlk Reset)

**Problem:**  
İlk reset sırasında senaryo YAML'larındaki image'lar Docker Hub'dan çekilir. Bağlantı hızına göre 30 saniye - 2 dakika sürebilir.

**Önlem A — Image'ları önceden pull et (init-cluster.sh içinde):**
```bash
# init-cluster.sh
echo "Pre-pulling exam images..."
docker exec "${CLUSTER_NAME}-control-plane" \
  ctr images pull docker.io/library/nginx:1.25
docker exec "${CLUSTER_NAME}-control-plane" \
  ctr images pull docker.io/library/postgres:16
# ... diğer yaygın image'lar
```

**Önlem B — kind node image'ına dahil et:**
Özel kind node image build ederek yaygın image'ları içine göm. Gelişmiş bir teknik ama en hızlı sonucu verir.

**Önlem C — Timeout yerine wait + bilgi mesajı:**
```typescript
// scenario.ts
const waitResult = await kubectl(
  `wait --for=condition=Ready pods --all -n ${ns} --timeout=60s`
);
if (waitResult.exitCode !== 0) {
  // Hata değil — UI'ya "Pod'lar hazırlanıyor..." mesajı gönder
  logger.warn(`Pods not ready yet in ${ns} — image may be pulling`);
}
```

---

### R7 — Port Çakışması

**Problem:**  
kind cluster `localhost:XXXXX` portunu kullanır. Başka bir uygulama aynı portu kullanıyorsa bağlantı kurulamaz.

**Önlem:**
```yaml
# kind-config.yaml
networking:
  apiServerPort: 6443  # Sabit port (random yerine)
  apiServerAddress: "0.0.0.0"
```

Eğer 6443 meşgulse:
```bash
kind create cluster --name ckad-simulator \
  --config docker/kind-config.yaml
# kind otomatik uygun port bulur
```

---

### R8 — Birden Fazla Browser Sekmesi / Kullanıcı

**Problem:**  
Birden fazla kullanıcı aynı namespace'i kullanırsa birbirlerinin state'ini bozabilir.

**Mevcut durum:** Proje single-user (kişisel kullanım). Bu risk şimdilik kabul edilebilir.

**Uzun vadeli çözüm:**
```
Her kullanıcı için: namespace = exam-{userId}-q{n}
veya
Her kullanıcı için: ayrı kind cluster (daha izole ama daha ağır)
```

---

### R9 — `kubectl edit` Vim İçin TTY Gereksinimi

**Problem:**  
`kubectl edit` vim açar. Gerçek bir PTY bağlantısı olmadan vim çalışmaz. Eğer PTY bağlantısında bir sorun varsa `kubectl edit` bozulabilir.

**Önlem:**  
node-pty zaten gerçek PTY açıyor, bu normalde sorun değil. Ama:
- TERM env var doğru set edilmeli: `TERM=xterm-256color`
- vim için: `EDITOR=vim` ve `.vimrc` olmalı

```bash
# docker/bashrc
export EDITOR=vim
export TERM=xterm-256color
export VISUAL=vim
```

---

## 2. Operasyonel Riskler

### R10 — Migration Sırasında Eski Sistemin Bozulması

**Problem:**  
kind setup hazır olmadan simülasyon kodu kaldırılırsa sistem tamamen çöker.

**Önlem — Faz sıralaması:**
1. Önce kind infrastructure hazırla ✅
2. Sonra backend entegrasyonu yap ✅
3. Son olarak eski kodu kaldır ✅

`SANDBOX_MODE=simulation` fallback her zaman hazır.

---

### R11 — macOS Docker Desktop Gizli İzinler

**Problem:**  
macOS Docker Desktop varsayılan olarak bazı volume mount'ları kısıtlar. `/var/run/docker.sock` mount edilebilir ama bazı ayarlarda çalışmaz.

**Önlem:**
```
Docker Desktop → Settings → Advanced →
☑️ Allow the default Docker socket to be used (requires password)
☑️ Allow privileged port mapping
```

`README.md` ve `08-quick-start.md` içinde bu adımı açıkça belirt.

---

### R12 — Disk Alanı

**Problem:**  
kind cluster image'ları + exam senaryo image'ları toplam 3-5 GB disk kaplar.

**Önlem:**
```bash
# Gereksiz image'ları temizle
docker system prune -f

# kind cluster sil (tüm associated image'lar gider)
kind delete cluster --name ckad-simulator
```

Minimum disk gereksinimi dokümante edilmeli: **10 GB serbest alan önerilir**.

---

## 3. Risk Özeti Tablosu

| Risk | Önem | Olasılık | Önlem | Durum |
|------|------|----------|-------|-------|
| R1 — DinD güvenlik | Düşük (local dev) | Kesin | Docker socket mount kabul | ✅ Kabul |
| R2 — Başlatma süresi | Orta | Kesin | Progress UI + cluster prestart | 🟡 Hafifletildi |
| R3 — kubeconfig IP | Yüksek | Kesin | `--internal` flag | ✅ Çözüm var |
| R4 — ARM64 uyumu | Orta | Olası | Multi-arch image'lar | ✅ Çözüm var |
| R5 — Namespace leak | Yüksek | Olası | `--wait=true` delete | ✅ Çözüm var |
| R6 — Image pull gecikme | Orta | Kesin (ilk) | Pre-pull + timeout mesajı | 🟡 Hafifletildi |
| R7 — Port çakışma | Düşük | Nadiren | Sabit port 6443 | 🟡 Hafifletildi |
| R8 — Multi-user | Düşük (single-user) | Yok şimdilik | Namespace izolasyonu (ileride) | 📋 Kabul |
| R9 — vim/PTY | Düşük | Nadir | TERM env var | ✅ Çözüm var |
| R10 — Migration bozulma | Yüksek | Mümkün | Faz sıralaması + fallback | ✅ Çözüm var |
| R11 — macOS izinler | Orta | Olası | Dokümantasyon | ✅ Dokümante |
| R12 — Disk alanı | Düşük | Olası | Minimum gereksinimleri belirt | ✅ Dokümante |

---

## 4. Test Edilmesi Gereken Durumlar

Migration tamamlandığında bu senaryolar test edilmeli:

```bash
# 1. Temiz kurulum testi
git clone ... && docker compose up
# → Beklenti: 90 saniye içinde çalışır

# 2. Restart testi (cluster zaten var)
docker compose down && docker compose up
# → Beklenti: 10 saniye içinde çalışır (cluster yeniden oluşturulmuyor)

# 3. Reset testi
# Browser'dan Q1 açtıktan sonra "Reset" tıkla
# → Beklenti: 5-10 saniyede tamamlanır

# 4. Concurrent soru testi
# Q1, Q2, Q3'ü sırayla açıp terminalde kubectl get pods yap
# → Her birinde farklı namespace görünmeli

# 5. Gerçek kubectl testi
kubectl apply -f test.yaml  # gerçek deployment
kubectl get pods -n exam-q1  # görünmeli
kubectl delete deployment test -n exam-q1  # silinmeli

# 6. ARM64 testi (Apple Silicon varsa)
docker compose --profile=arm64 up
# → Tüm container'lar ARM64 image kullanmalı
```
