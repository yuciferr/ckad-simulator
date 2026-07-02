# 02 — Ne Değişiyor: Bileşen Düzeyinde Analiz

> **Branch:** `kind-migration`  
> **Kapsam:** Her dosya ve bileşen için "mevcut durum → hedef durum" dönüşümü.

---

## 1. KALDIRILANLAR (Silinecek Dosyalar)

Bu dosyalar migration sonrasında artık gerekli değil:

| Dosya / Dizin | Boyut | Neden Kaldırılıyor |
|---------------|-------|-------------------|
| `sandbox/bin/kubectl` | ~1850 satır | Gerçek kubectl kullanılacak |
| `sandbox/bin/k8s-lib.sh` | ~2200 satır | Gerçek cluster state yönetimi yapıyor |
| `sandbox/bin/helm` | ~200 satır | Gerçek helm kullanılacak |
| `sandbox/bin/docker` | ~100 satır | Gerçek docker veya kaldırılacak |
| `sandbox/bin/podman` | ~100 satır | Kaldırılacak (CKAD'de yok) |
| `sandbox/bin/crictl` | ~50 satır | Gerçek crictl (isteğe bağlı) |
| `sandbox/bin/kubectx` | ~30 satır | Gerçek kubectx veya alias |
| `sandbox/bin/kubens` | ~30 satır | Gerçek kubens veya alias |
| `sandbox/etc/kubernetes/mock/` | Fixture dizini | YAML manifest'lere dönüşüyor |
| `sandbox/etc/kubernetes/session/` | Runtime state | Artık gerçek etcd'de |
| `sandbox/etc/kubernetes/applied/` | Applied YAML'lar | Artık gerçek cluster'da |
| `sandbox/dev-null-kubeconfig` | Placeholder | Gerçek kubeconfig kullanılacak |

**Toplam tahmini silinecek kod:** ~4.500+ satır bash simülasyon kodu

---

## 2. KORUNANLAR (Değişmeyecekler)

| Bileşen | Neden Korunuyor |
|---------|----------------|
| `public/` — tüm UI | xterm.js + React bağlantı şekli aynı |
| `src/client/` — frontend TS | Değişmiyor |
| WebSocket protokolü | PTY katmanı değişmiyor |
| `src/routes/` — REST API | Endpoint sözleşmesi aynı |
| `exams/` — MD formatı | Soru/cevap formatı korunuyor |
| `src/exam/` — parser | Markdown parsing değişmiyor |
| `src/types/` | Type tanımları büyük ölçüde aynı |
| `src/middleware/` | Security middleware aynı |
| Scoring sistemi temel mantığı | Sadece evidence toplama değişiyor |

---

## 3. DEĞİŞECEKLER

### 3.1 `Dockerfile` → `docker/backend.Dockerfile`

**Mevcut:**
```dockerfile
FROM node:22-bookworm-slim
RUN apt-get install -y bash python3 make g++
# kubectl, helm yok — sandbox/bin/ kullanılıyor
```

**Hedef:**
```dockerfile
FROM node:22-bookworm-slim

# Temel araçlar
RUN apt-get update && apt-get install -y \
    curl wget bash vim jq yq \
    bash-completion \
    python3 make g++

# kubectl — CKAD sınav versiyonuyla eşleşen
ARG KUBECTL_VERSION=v1.32.3
RUN curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
    && chmod +x kubectl && mv kubectl /usr/local/bin/

# helm
ARG HELM_VERSION=v3.17.0
RUN curl https://get.helm.sh/helm-${HELM_VERSION}-linux-amd64.tar.gz | tar xz \
    && mv linux-amd64/helm /usr/local/bin/

# bash completion
RUN kubectl completion bash > /etc/bash_completion.d/kubectl
RUN echo 'alias k=kubectl' >> /etc/bash.bashrc
RUN echo 'complete -o default -F __start_kubectl k' >> /etc/bash.bashrc

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
```

---

### 3.2 `docker-compose.yml`

**Mevcut:**
```yaml
services:
  simulator:
    build: .
    ports: ["3000:3000"]
    volumes:
      - ./exams:/app/exams
      - ./sandbox:/app/sandbox
```

**Hedef:**
```yaml
services:
  kind-init:
    build:
      context: .
      dockerfile: docker/kind-init.Dockerfile
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - kind-kubeconfig:/etc/kind
    restart: "no"  # Bir kere çalışır, cluster hazır olunca çıkar

  backend:
    build:
      context: .
      dockerfile: docker/backend.Dockerfile
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - kind-kubeconfig:/etc/kind:ro
      - ./exams:/app/exams
    environment:
      - KUBECONFIG=/etc/kind/kubeconfig
      - KIND_CLUSTER_NAME=ckad-simulator
    depends_on:
      kind-init:
        condition: service_completed_successfully
    restart: unless-stopped

volumes:
  kind-kubeconfig:
```

---

### 3.3 `src/sandbox/reset.ts` (Backend Reset Mantığı)

**Mevcut:**
```typescript
// sandbox sıfırlama = dosya silme + kopyalama
async function resetSandbox(examId: string) {
  await fs.rm(sessionDir, { recursive: true });
  await fs.mkdir(sessionDir, { recursive: true });
  // mock fixture'larını kopyala
  await copyMockFixtures(examId);
  await writeFile(namespaceFile, 'default');
  await writeFile(contextFile, 'kubernetes-admin@kubernetes');
}
```

**Hedef:**
```typescript
// sandbox sıfırlama = namespace temizle + senaryo uygula
async function resetSandbox(questionId: string) {
  const ns = `exam-q${questionId}`;
  
  // Mevcut namespace'i temizle
  await kubectl(`delete namespace ${ns} --ignore-not-found --wait=true`);
  
  // Namespace oluştur
  await kubectl(`create namespace ${ns}`);
  
  // Soru senaryosunu cluster'a uygula
  const scenarioPath = getScenarioPath(questionId);
  if (await scenarioExists(scenarioPath)) {
    await kubectl(`apply -f ${scenarioPath} -n ${ns}`);
    await kubectl(`wait --for=condition=Ready pods --all -n ${ns} --timeout=30s`);
  }
  
  return { namespace: ns };
}
```

---

### 3.4 `src/ws/pty.ts` (PTY Ortam Ayarları)

**Mevcut:**
```typescript
const ptyEnv = {
  HOME: path.resolve('sandbox'),
  PATH: `${path.resolve('sandbox/bin')}:${process.env.PATH}`,
  KUBECONFIG: '/dev/null',
  TERM: 'xterm-256color',
};
```

**Hedef:**
```typescript
const ptyEnv = {
  HOME: '/home/user',
  PATH: `/usr/local/bin:/usr/bin:/bin`,  // gerçek binary'ler
  KUBECONFIG: process.env.KUBECONFIG || '/etc/kind/kubeconfig',
  TERM: 'xterm-256color',
  // Aktif namespace ayarla (her soru için)
  // kubectl config set-context --current --namespace=exam-q{n} ile ayarlanacak
};
```

---

### 3.5 `exams/` — Senaryo Yapısı

**Mevcut:**
```
exams/mock/1/
├── exam.md      ← sorular
└── answer.md    ← cevaplar + scoring kriterleri

sandbox/etc/kubernetes/mock/
├── pluto/       ← namespace fixture dosyaları
│   ├── pods.txt
│   ├── deploy.txt
│   └── pods.d/pod-name/  ← pod detayları
├── earth/
└── ...
```

**Hedef:**
```
exams/mock/1/
├── exam.md          ← sorular (format aynı)
├── answer.md        ← cevaplar (format aynı)
└── scenarios/
    ├── q1/
    │   └── setup.yaml    ← soru 1 için cluster başlangıç durumu
    ├── q2/
    │   └── setup.yaml
    └── q3/
        ├── setup.yaml
        └── setup-2.yaml  ← birden fazla manifest desteklenir
```

**setup.yaml örneği (soru 1 — liveness probe sorunu olan pod):**
```yaml
# exams/mock/1/scenarios/q1/setup.yaml
apiVersion: v1
kind: Pod
metadata:
  name: pod-with-issue
  namespace: exam-q1  # namespace backend tarafından injekte edilebilir
spec:
  containers:
  - name: app
    image: nginx:1.25
    livenessProbe:
      httpGet:
        path: /wrong-path  # ← kasıtlı hata, öğrenci düzeltecek
        port: 80
      initialDelaySeconds: 5
      periodSeconds: 5
```

---

### 3.6 `src/sandbox/` — Yeni Dosyalar Ekleniyor

| Yeni Dosya | Amaç |
|-----------|------|
| `src/sandbox/cluster.ts` | kind cluster lifecycle (create, delete, status) |
| `src/sandbox/scenario.ts` | Senaryo yükleme ve reset mantığı |
| `src/sandbox/kubectl.ts` | kubectl çağırma utility (exec wrapper) |
| `docker/backend.Dockerfile` | kubectl+helm+vim+jq kurulu backend image |
| `docker/kind-init.Dockerfile` | kind binary + cluster init scripti |
| `scripts/init-cluster.sh` | kind cluster oluştur + temel kurulum |
| `scripts/reset-question.sh` | Soru sıfırlama scripti |

---

### 3.7 Scoring Sistemi Güncellenmesi

**Mevcut evidence toplama:**
```typescript
// src/routes/session.ts
const evidence = {
  history: readBashHistoryFiles(),    // dosyadan oku
  applied: readAppliedYamlFiles(),    // dosyadan oku
  courseFiles: readCourseFiles(),     // dosyadan oku
};
```

**Hedef evidence toplama:**
```typescript
// src/routes/session.ts
const evidence = {
  history: readBashHistoryFiles(),    // hala dosyadan (PTY capture)
  clusterState: await getClusterState(questionId),  // YENİ: gerçek cluster sorgusu
};

async function getClusterState(questionId: string) {
  const ns = `exam-q${questionId}`;
  return {
    pods: await kubectl(`get pods -n ${ns} -o json`),
    deployments: await kubectl(`get deployments -n ${ns} -o json`),
    services: await kubectl(`get services -n ${ns} -o json`),
    configmaps: await kubectl(`get configmaps -n ${ns} -o json`),
    // ...
  };
}
```

**Scoring kriterleri:**
```markdown
# answer.md'de yeni format (isteğe bağlı)
- [ ] nginx deployment 3 replica olmalı
  verify: kubectl get deployment nginx -n {{ns}} -o jsonpath='{.spec.replicas}' == "3"
- [ ] liveness probe düzeltilmiş olmalı
  verify: kubectl get pod pod-with-issue -n {{ns}} -o jsonpath='{.spec.containers[0].livenessProbe.httpGet.path}' != "/wrong-path"
```

---

## 4. Değişen Bağımlılıklar

### package.json Değişiklikleri

**Kaldırılacak (artık gerekli değil):**
- `node-pty` ile ilgili bash script bağımlılığı yoktu zaten, korunuyor

**Eklenecek:**
```json
{
  "dependencies": {
    "execa": "^9.x"  // kubectl komutlarını çalıştırmak için (exec wrapper)
  }
}
```

### Sistem Gereksinimleri Değişimi

**Mevcut:**
```
- Node.js 18+
- npm
- bash 4+
```

**Hedef:**
```
- Docker Engine 24+ (veya Docker Desktop)
- Docker Compose v2
- 4GB+ RAM önerilir (kind için ~1GB ek)
- macOS / Linux (Windows: WSL2 gerekli)
```

---

## 5. Özet Tablo

| Bileşen | Durum | Öncelik |
|---------|-------|---------|
| `sandbox/bin/kubectl` | 🔴 Kaldırılıyor | Phase 1 |
| `sandbox/bin/k8s-lib.sh` | 🔴 Kaldırılıyor | Phase 1 |
| `sandbox/bin/helm` | 🔴 Kaldırılıyor | Phase 1 |
| `sandbox/etc/kubernetes/mock/` | 🔴 Kaldırılıyor → YAML'a dönüşüyor | Phase 2 |
| `docker-compose.yml` | 🟡 Güncelleniyor | Phase 1 |
| `Dockerfile` → `docker/backend.Dockerfile` | 🟡 Güncelleniyor | Phase 1 |
| `docker/kind-init.Dockerfile` | 🟢 Yeni ekleniyor | Phase 1 |
| `scripts/init-cluster.sh` | 🟢 Yeni ekleniyor | Phase 1 |
| `src/sandbox/reset.ts` | 🟡 Güncelleniyor | Phase 2 |
| `src/ws/pty.ts` | 🟡 Güncelleniyor | Phase 2 |
| `exams/*/scenarios/` | 🟢 Yeni ekleniyor | Phase 3 |
| Scoring sistemi | 🟡 Güncelleniyor | Phase 3 |
| UI | ✅ Değişmiyor | — |
| Soru/cevap MD formatı | ✅ Değişmiyor | — |
