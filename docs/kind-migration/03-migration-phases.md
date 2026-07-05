# 03 — Migration Fazları: Adım Adım Plan

> **Branch:** `kind-migration`  
> **Kapsam:** Migration sürecini paralel çalışmayı minimize eden, test edilebilir adımlara bölme.

---

## Genel Yaklaşım

Migration'ı sıfırdan yazmak yerine **kademeli ve test edilebilir adımlarla** ilerleyeceğiz. Her faz sonunda çalışan bir sistem olmalı — hiçbir zaman "yarım kalmış, çalışmayan" durumda bırakmayacağız.

```
Faz 0: Hazırlık ve temel altyapı   (1-2 gün)
Faz 1: kind cluster + Docker setup  (1-2 gün)
Faz 2: Backend PTY entegrasyonu     (1-2 gün)
Faz 3: Senaryo dönüşümü            (2-3 gün)
Faz 4: Simülasyon kodunu kaldırma  (1 gün)
Faz 5: Scoring güncelleme          (1-2 gün)
Faz 6: Polish ve test              (1-2 gün)
```

**Toplam tahmini süre:** 8-14 gün (solo geliştirme)

---

## Faz 0: Hazırlık

### Hedef
Migration öncesinde temiz bir başlangıç noktası oluşturmak.

### Adımlar

#### F0.1 — Branch Kontrolü
```bash
git checkout kind-migration
git status  # temiz olmalı
```

#### F0.2 — Mevcut Sistemi Dondur
Mevcut `sandbox/bin/kubectl` ve `k8s-lib.sh` dosyalarını **silme**, sadece `sandbox-legacy/` dizinine taşı. Migration sırasında referans olarak kullanabiliriz.

```bash
mkdir -p sandbox-legacy
cp -r sandbox/bin sandbox-legacy/
cp -r sandbox/etc sandbox-legacy/
# .gitignore'a ekle: sandbox-legacy/
```

#### F0.3 — Yerel Ön Koşulları Kontrol Et
```bash
docker version        # Docker Engine 24+ gerekli
kind version          # kind 0.20+ gerekli (0.30 kurulu ✅)
kubectl version --client  # v1.32+ önerilir (v1.34 kurulu ✅)
helm version          # v3.x gerekli
```

#### F0.4 — docs/kind-migration/ Dökümanları Oluştur
Bu serideki tüm planlama dökümanları (bu dosya dahil).

#### F0.5 — `exams/scenarios/` Dizin Yapısını Oluştur
```bash
mkdir -p exams/mock/1/scenarios/{q1,q2,q3,q4,q5,q6,q7,q8,q9,q10,q11,q12,q13,q14,q15,q16,q17}
```

**Çıktı:** Temiz başlangıç noktası, eski kod kaybolmamış, yeni dizin yapısı hazır.

---

## Faz 1: kind Cluster + Docker Altyapısı

### Hedef
`docker compose up` ile kind cluster ayağa kalksın. Terminal açıldığında `kubectl get nodes` gerçek çıktı döndürsün.

### Adımlar

#### F1.1 — `docker/` Dizini ve Dockerfile'ları Oluştur

```
docker/
├── backend.Dockerfile     ← Node.js + kubectl + helm + vim + jq
└── kind-init.Dockerfile   ← kind binary + init script
```

Detaylar için: [04-docker-compose-kind-setup.md](./04-docker-compose-kind-setup.md)

#### F1.2 — kind Cluster Konfigürasyonu

```yaml
# docker/kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: ckad-simulator
nodes:
- role: control-plane
  image: kindest/node:v1.32.3
  kubeadmConfigPatches:
  - |
    kind: InitConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        node-labels: "ingress-ready=true"
  extraPortMappings:
  - containerPort: 80
    hostPort: 8080
    protocol: TCP
```

#### F1.3 — `scripts/init-cluster.sh` Oluştur

```bash
#!/usr/bin/env bash
# scripts/init-cluster.sh
# kind cluster yoksa oluşturur, kubeconfig'i volume'a yazar

CLUSTER_NAME="${KIND_CLUSTER_NAME:-ckad-simulator}"
KUBECONFIG_PATH="${KUBECONFIG_OUTPUT:-/etc/kind/kubeconfig}"

# Cluster zaten var mı kontrol et
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  echo "kind cluster '${CLUSTER_NAME}' already exists, skipping creation."
else
  echo "Creating kind cluster '${CLUSTER_NAME}'..."
  kind create cluster \
    --name "${CLUSTER_NAME}" \
    --config /kind-config.yaml \
    --wait 120s
fi

# kubeconfig'i paylaşılan volume'a yaz
kind get kubeconfig --name "${CLUSTER_NAME}" > "${KUBECONFIG_PATH}"
chmod 644 "${KUBECONFIG_PATH}"

echo "Cluster ready. kubeconfig written to ${KUBECONFIG_PATH}"
kubectl --kubeconfig="${KUBECONFIG_PATH}" get nodes
```

#### F1.4 — `docker-compose.yml` Güncelle

Detaylar için: [04-docker-compose-kind-setup.md](./04-docker-compose-kind-setup.md)

#### F1.5 — Manuel Test

```bash
docker compose up -d
docker compose logs kind-init   # "Cluster ready" görmeli
docker compose exec backend kubectl get nodes  # gerçek node görmeli
```

**Checkpoint:** `kubectl get nodes` gerçek output döndürüyor ✅

---

## Faz 2: Backend PTY Entegrasyonu

### Hedef
Terminalde yazılan `kubectl` komutları gerçek kind cluster'a gitsin.

### Adımlar

#### F2.1 — `src/ws/pty.ts` Ortam Değişkenlerini Güncelle

```typescript
// ÖNCE
const ptyEnv = {
  HOME: path.resolve('sandbox'),
  PATH: `${path.resolve('sandbox/bin')}:${process.env.PATH}`,
  KUBECONFIG: '/dev/null',
};

// SONRA
const ptyEnv = {
  HOME: process.env.HOME || '/root',
  PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
  KUBECONFIG: process.env.KUBECONFIG || '/etc/kind/kubeconfig',
  TERM: 'xterm-256color',
  PS1: '$ ',
};
```

#### F2.2 — `.bashrc` Güncelleme (Container İçi)

```bash
# docker/bashrc
export KUBECONFIG=/etc/kind/kubeconfig
alias k=kubectl
source <(kubectl completion bash)
complete -o default -F __start_kubectl k
export PS1='\[\033[01;32m\]\u@ckad\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '
```

#### F2.3 — Namespace Context Yönetimi

Her soru için kullanıcı doğru namespace'de başlamalı. PTY açılırken:

```typescript
// src/ws/pty.ts içinde, PTY oluştururken
async function createPtyForQuestion(questionId: number) {
  const ns = `exam-q${questionId}`;
  const pty = spawn('/bin/bash', ['--rcfile', '/etc/ckad/bashrc'], {
    env: {
      ...ptyEnv,
      // Başlangıç namespace'ini set et
      INITIAL_NAMESPACE: ns,
    }
  });
  
  // Bash başladığında otomatik namespace set et
  // bashrc içinde: kubectl config set-context --current --namespace=$INITIAL_NAMESPACE
}
```

#### F2.4 — Manuel Test (Browser)

```
1. docker compose up
2. Browser → localhost:3000
3. Herhangi bir soru aç
4. Terminale yaz: kubectl get nodes
5. → Gerçek node çıktısı görmeli
6. kubectl get pods -A  → kind sistem pod'ları görmeli
```

**Checkpoint:** Browser terminali gerçek cluster'a bağlı ✅

---

## Faz 3: Senaryo Dönüşümü

### Hedef
Eski fixture dosyalarını YAML manifest'lere çevir. Her soru için cluster başlangıç durumu otomatik kurulsun.

### Adımlar

#### F3.1 — Mock Exam 1 Senaryolarını Yaz

17 sorunun başlangıç durumunu YAML olarak oluştur. Öncelik sırası:

| Soru | Konu | Fixture Durumu | Senaryo Zorluğu |
|------|------|----------------|----------------|
| Q1 | Liveness Probe | Partial | Kolay |
| Q3 | Service Debug | Good | Kolay |
| Q2 | Deploy + Service | Missing | Orta |
| Q5 | NetworkPolicy | Partial | Orta |
| Q10 | RBAC | Partial | Orta |
| Q7 | Canary Deploy | Partial | Zor |
| Q4 | CronJob | Missing | Kolay |
| Q8 | Multi-container | Missing | Orta |
| Q9 | PVC | Missing | Orta |
| Q11 | Ingress | Partial | Orta |
| Q12 | Rolling Update | Partial | Kolay |
| Q15 | Job from CronJob | Partial | Kolay |
| Q6 | ConfigMap + Secret | Missing | Kolay |
| Q13 | Security Context | Missing | Kolay |
| Q16 | Resource Limits | Missing | Kolay |
| Q14 | Helm | Missing | Orta |
| Q17 | Image Debug | Partial | Zor |

Senaryo formatı detayları için: [05-exam-scenarios-structure.md](./05-exam-scenarios-structure.md)

#### F3.2 — `src/sandbox/scenario.ts` Yaz

```typescript
// Senaryo yükleme mantığı
// - Senaryo var mı kontrol et
// - Namespace temizle
// - YAML'ları apply et
// - Pod'ların Ready olmasını bekle
```

Detaylar için: [06-backend-changes.md](./06-backend-changes.md)

#### F3.3 — `POST /api/sandbox/reset` Endpoint Güncelle

```typescript
// Mevcut: dosya silme
// Hedef: kubectl delete ns + apply + wait
```

#### F3.4 — Her Soru İçin Test

```bash
# Soru 1 senaryosunu test et
kubectl apply -f exams/mock/1/scenarios/q1/setup.yaml -n exam-q1
kubectl get pods -n exam-q1  # pod-with-issue görünmeli
kubectl describe pod pod-with-issue -n exam-q1  # liveness probe hatası görünmeli
```

**Checkpoint:** Tüm 17 soru için cluster başlangıç durumu çalışıyor ✅

---

## Faz 4: Simülasyon Kodunu Kaldır

### Hedef
Artık gerekmeyen eski bash simülasyon kodunu temizle.

### Adımlar

#### F4.1 — `sandbox/bin/kubectl` Kaldır

```bash
git rm sandbox/bin/kubectl
git rm sandbox/bin/k8s-lib.sh
git rm sandbox/bin/helm
git rm sandbox/bin/docker
git rm sandbox/bin/podman
git rm sandbox/bin/crictl
```

#### F4.2 — `sandbox/etc/kubernetes/mock/` Kaldır

```bash
git rm -r sandbox/etc/kubernetes/mock/
```

#### F4.3 — `sandbox/` Geri Kalanları Değerlendir

| Dosya | Aksiyon |
|-------|---------|
| `sandbox/.bashrc` | Güncelle: sandbox-specific path override kaldır |
| `sandbox/.vimrc` | Koru: YAML-friendly vim ayarları hala gerekli |
| `sandbox/bin/k` (symlink) | Kaldır |
| `sandbox/bin/kubectx` | Kaldır (container'a gerçek kurulacak) |
| `sandbox/bin/kubens` | Kaldır (container'a gerçek kurulacak) |
| `sandbox/bin/ssh` | Kaldır (artık gerekli değil) |
| `sandbox/opt/course/` | Gözden geçir: soru taskları için hala gerekli mi? |

#### F4.4 — `.gitignore` Güncelle

Artık gerekmeyen sandbox runtime path'lerini kaldır, yenilerini ekle.

#### F4.5 — Çalışma Testi

```bash
docker compose up
# Tüm soru terminal'leri çalışmalı
# kubectl get nodes → gerçek output
# kubectl apply -f myfile.yaml → gerçek cluster'a gidiyor
```

**Checkpoint:** Eski simülasyon kodu tamamen kaldırıldı, sistem çalışıyor ✅

---

## Faz 5: Scoring Güncelleme

### Hedef
Scoring sistemi gerçek cluster state'ini kullanarak doğrulama yapsın.

### Adımlar

#### F5.1 — Evidence Toplama Güncelleme

```typescript
// Cluster state'ini evidence'a ekle
const clusterState = await getClusterState(questionId);
evidence.clusterState = clusterState;
```

#### F5.2 — Scoring Kriterleri Formatını Genişlet (İsteğe Bağlı)

`answer.md`'ye `verify:` satırları ekle:

```markdown
- [ ] nginx deployment 3 replica olmalı
  verify: kubectl get deploy nginx -n {{ns}} -o jsonpath='{.spec.replicas}' == "3"
```

Bu format isteğe bağlı — eski format hala çalışacak.

#### F5.3 — Otomatik Doğrulama Scripti

Her senaryo için `verify.sh` yazılabilir:

```bash
# exams/mock/1/scenarios/q1/verify.sh
#!/bin/bash
NS=$1
# Liveness probe düzeltilmiş mi?
PROBE_PATH=$(kubectl get pod pod-with-issue -n $NS \
  -o jsonpath='{.spec.containers[0].livenessProbe.httpGet.path}')

if [ "$PROBE_PATH" = "/" ] || [ "$PROBE_PATH" = "/healthz" ]; then
  echo "PASS: Liveness probe path corrected to $PROBE_PATH"
  exit 0
else
  echo "FAIL: Liveness probe path is still $PROBE_PATH"
  exit 1
fi
```

**Checkpoint:** Scoring gerçek cluster state'i kullanıyor ✅

---

## Faz 6: Polish ve Test

### Hedef
Production-ready durum: hızlı başlatma, güzel UX, temiz döküman.

### Adımlar

#### F6.1 — Başlatma Süresi Optimizasyonu

```bash
# kind cluster başlatma süresi: ~60 saniye
# Bunu UI'da progress göster

# Backend startup sırasında cluster hazır değilse beklet
while ! kubectl cluster-info &>/dev/null; do
  echo "Waiting for cluster..."
  sleep 2
done
```

#### F6.2 — UI: Cluster Hazır Değilse Mesaj

Frontend'de cluster hazır olana kadar "Cluster başlatılıyor..." mesajı göster:

```typescript
// /api/health endpoint'i güncelle
app.get('/health', async (req, res) => {
  const clusterReady = await checkClusterReady();
  res.json({
    status: clusterReady ? 'ok' : 'initializing',
    cluster: clusterReady ? 'ready' : 'starting',
  });
});
```

#### F6.3 — README Güncelleme

```markdown
## Kurulum

### Gereksinimler
- Docker Engine 24+ veya Docker Desktop
- Docker Compose v2

### Başlatma
```bash
git clone ...
cd ckad-simulator
docker compose up
# İlk seferinde ~60 saniye bekleyin (kind cluster oluşturuluyor)
# Sonraki başlatmalarda ~5 saniye
open http://localhost:3000
```

#### F6.4 — Temel E2E Test

```bash
# scripts/test-e2e.sh
docker compose up -d
sleep 60  # cluster hazır olmasını bekle
curl http://localhost:3000/health | jq .status  # "ok" olmalı
curl http://localhost:3000/api/exams | jq length  # exam listesi
# Terminal WebSocket testi...
docker compose down
```

**Checkpoint:** Sistem clean install'dan çalışıyor, README'yi takip eden biri başlatabilir ✅

---

## Faz Özet Tablosu

| Faz | Ad | Süre | Bağımlılık | Çıktı |
|-----|----|------|-----------|-------|
| 0 | Hazırlık | 1 gün | — | Temiz başlangıç |
| 1 | kind + Docker | 1-2 gün | F0 | `kubectl get nodes` çalışıyor |
| 2 | PTY Entegrasyonu | 1-2 gün | F1 | Browser → gerçek K8s |
| 3 | Senaryo Dönüşümü | 2-3 gün | F2 | 17 soru kurulumu çalışıyor |
| 4 | Simülasyon Kaldır | 1 gün | F3 | ~4500 satır kod silindi |
| 5 | Scoring Güncelle | 1-2 gün | F3 | Gerçek state doğrulama |
| 6 | Polish + Test | 1-2 gün | F4, F5 | Production-ready |

---

## Risk Durumlarında Geri Dönüş

Migration sırasında bir şeyler ters giderse:

```bash
# Faz 1-2 arası problem: mevcut simülasyon hala çalışıyor
git stash  # değişiklikleri gizle
node server.js  # eski sistem çalışır

# Faz 3+ problem: sandbox-legacy/ referansı
ls sandbox-legacy/  # eski kodu görmek için

# Acil durum: main branch'e geri dön
git checkout main
```

Hiçbir zaman "çalışmayan" bir durumda bırakmayacağız — her faz sonunda ya eski sistem ya da yeni sistem çalışıyor olacak.
