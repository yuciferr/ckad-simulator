# 04 — Docker Compose + kind Kurulum Detayları

> **Branch:** `kind-migration`  
> **Kapsam:** Docker Compose yapısı, Dockerfile'lar, kind konfigürasyonu ve başlatma akışı.

---

## 1. Genel Yapı

```
ckad-simulator/
├── docker-compose.yml          ← Compose orkestrasyonu
├── docker/
│   ├── backend.Dockerfile      ← Node.js + kubectl + helm + vim + jq
│   ├── kind-init.Dockerfile    ← kind binary + init script
│   ├── kind-config.yaml        ← kind cluster konfigürasyonu
│   └── bashrc                  ← PTY bash ortam ayarları
└── scripts/
    ├── init-cluster.sh         ← kind cluster oluştur + kubeconfig yaz
    ├── reset-question.sh       ← Soru namespace sıfırla
    └── wait-for-cluster.sh     ← Cluster hazır olana kadar bekle
```

---

## 2. `docker-compose.yml`

```yaml
version: "3.9"

services:

  # ─── Faz 1: kind Cluster Başlatma ───────────────────────────────
  kind-init:
    build:
      context: .
      dockerfile: docker/kind-init.Dockerfile
    container_name: ckad-kind-init
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # kind Docker daemon'a erişsin
      - kind-kubeconfig:/etc/kind                   # kubeconfig paylaş
    environment:
      KIND_CLUSTER_NAME: ckad-simulator
      KUBECONFIG_OUTPUT: /etc/kind/kubeconfig
    restart: "no"  # Bir kere çalışır

  # ─── Faz 2: Backend (Node.js + PTY) ────────────────────────────
  backend:
    build:
      context: .
      dockerfile: docker/backend.Dockerfile
    container_name: ckad-backend
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # kind cluster yönetimi
      - kind-kubeconfig:/etc/kind:ro                # kubeconfig (readonly)
      - ./exams:/app/exams:ro                        # canlı soru güncellemesi
    environment:
      HOST: 0.0.0.0
      PORT: 3000
      KUBECONFIG: /etc/kind/kubeconfig
      KIND_CLUSTER_NAME: ckad-simulator
      NODE_ENV: production
    depends_on:
      kind-init:
        condition: service_completed_successfully
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s

volumes:
  kind-kubeconfig:
    # kind-init ve backend arasında kubeconfig paylaşımı için

networks:
  default:
    name: ckad-network
```

---

## 3. `docker/kind-init.Dockerfile`

```dockerfile
FROM alpine:3.20

ARG KIND_VERSION=v0.24.0
ARG KUBECTL_VERSION=v1.32.3

# kind ve kubectl kur
RUN apk add --no-cache curl bash

RUN curl -Lo /usr/local/bin/kind \
    "https://kind.sigs.k8s.io/dl/${KIND_VERSION}/kind-linux-amd64" \
    && chmod +x /usr/local/bin/kind

RUN curl -Lo /usr/local/bin/kubectl \
    "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
    && chmod +x /usr/local/bin/kubectl

# kind cluster konfigürasyonu
COPY docker/kind-config.yaml /kind-config.yaml

# Init scripti
COPY scripts/init-cluster.sh /init-cluster.sh
RUN chmod +x /init-cluster.sh

ENTRYPOINT ["/init-cluster.sh"]
```

> **Apple Silicon (ARM64) notu:** `linux-amd64` yerine `linux-arm64` kullanılmalı.  
> Multi-platform için `TARGETARCH` build arg kullanılacak — detay §7'de.

---

## 4. `docker/backend.Dockerfile`

```dockerfile
FROM node:22-bookworm-slim

ARG KUBECTL_VERSION=v1.32.3
ARG HELM_VERSION=v3.17.0
ARG TARGETARCH=amd64

# Sistem araçları
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget bash vim git \
    bash-completion \
    jq \
    python3 make g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# yq (YAML processor)
RUN wget -qO /usr/local/bin/yq \
    "https://github.com/mikefarah/yq/releases/latest/download/yq_linux_${TARGETARCH}" \
    && chmod +x /usr/local/bin/yq

# kubectl
RUN curl -Lo /usr/local/bin/kubectl \
    "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl" \
    && chmod +x /usr/local/bin/kubectl

# helm
RUN curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | \
    DESIRED_VERSION="${HELM_VERSION}" bash

# kubectx + kubens
RUN git clone --depth 1 https://github.com/ahmetb/kubectx /opt/kubectx \
    && ln -s /opt/kubectx/kubectx /usr/local/bin/kubectx \
    && ln -s /opt/kubectx/kubens /usr/local/bin/kubens

# kubectl bash completion
RUN kubectl completion bash > /etc/bash_completion.d/kubectl \
    && echo '. /etc/bash_completion' >> /etc/bash.bashrc

# Global alias
RUN echo 'alias k=kubectl' >> /etc/bash.bashrc \
    && echo 'complete -o default -F __start_kubectl k' >> /etc/bash.bashrc

# vim YAML config
COPY docker/vimrc /etc/vim/vimrc.local

# PTY için özel bashrc
COPY docker/bashrc /etc/ckad/bashrc

# Node.js uygulaması
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000
CMD ["node", "server.js"]
```

---

## 5. `docker/kind-config.yaml`

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: ckad-simulator
nodes:
- role: control-plane
  image: kindest/node:v1.32.3
  # CKAD sınavında Ingress kullanılabilir diye port mapping
  extraPortMappings:
  - containerPort: 30080
    hostPort: 30080
    protocol: TCP
  - containerPort: 30443
    hostPort: 30443
    protocol: TCP
  kubeadmConfigPatches:
  - |
    kind: InitConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        node-labels: "ingress-ready=true"
  - |
    kind: ClusterConfiguration
    apiServer:
      extraArgs:
        # Audit log (CKAD'de sorulabilir)
        audit-log-path: /var/log/kubernetes/audit.log
        audit-policy-file: /etc/kubernetes/audit-policy.yaml
```

---

## 6. `scripts/init-cluster.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${KIND_CLUSTER_NAME:-ckad-simulator}"
KUBECONFIG_OUTPUT="${KUBECONFIG_OUTPUT:-/etc/kind/kubeconfig}"
MAX_WAIT=120  # saniye

echo "=== CKAD Simulator — kind Cluster Init ==="
echo "Cluster name : $CLUSTER_NAME"
echo "kubeconfig   : $KUBECONFIG_OUTPUT"

# ─── Var mı kontrol et ───────────────────────────────────────────
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  echo "✓ Cluster '${CLUSTER_NAME}' already exists."
else
  echo "→ Creating cluster (this takes ~60s)..."
  kind create cluster \
    --name "${CLUSTER_NAME}" \
    --config /kind-config.yaml \
    --wait "${MAX_WAIT}s"
  echo "✓ Cluster created."
fi

# ─── kubeconfig yaz ──────────────────────────────────────────────
mkdir -p "$(dirname "$KUBECONFIG_OUTPUT")"
kind get kubeconfig --name "${CLUSTER_NAME}" > "${KUBECONFIG_OUTPUT}"
chmod 644 "${KUBECONFIG_OUTPUT}"
echo "✓ kubeconfig written to ${KUBECONFIG_OUTPUT}"

# ─── Cluster hazır mı kontrol et ─────────────────────────────────
echo "→ Waiting for cluster to be ready..."
KUBECONFIG="${KUBECONFIG_OUTPUT}" kubectl wait \
  --for=condition=Ready \
  nodes --all \
  --timeout="${MAX_WAIT}s"

echo "✓ All nodes are Ready."
echo ""
KUBECONFIG="${KUBECONFIG_OUTPUT}" kubectl get nodes
echo ""
echo "=== Cluster init complete ==="
```

---

## 7. `docker/bashrc` (PTY Ortamı)

```bash
# /etc/ckad/bashrc — Her PTY session bu dosyayla başlar

# ─── Temel ortam ──────────────────────────────────────────────────
export KUBECONFIG=/etc/kind/kubeconfig
export TERM=xterm-256color
export EDITOR=vim

# ─── kubectl alias ───────────────────────────────────────────────
alias k=kubectl
alias kgp='kubectl get pods'
alias kgd='kubectl get deployments'
alias kgs='kubectl get services'
alias kgn='kubectl get nodes'
alias kga='kubectl get all'
alias kd='kubectl describe'
alias kdel='kubectl delete'
alias ka='kubectl apply'

# ─── bash completion ─────────────────────────────────────────────
source /etc/bash_completion 2>/dev/null || true
source <(kubectl completion bash) 2>/dev/null || true
complete -o default -F __start_kubectl k

# ─── Prompt ──────────────────────────────────────────────────────
# Mevcut namespace'i prompt'ta göster (CKAD sınavında önemli)
function kube_ps1() {
  local ns
  ns=$(kubectl config view --minify -o jsonpath='{..namespace}' 2>/dev/null)
  echo "${ns:-default}"
}
export PS1='\[\033[01;32m\]ckad\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\] \[\033[01;33m\][$(kube_ps1)]\[\033[00m\]\$ '

# ─── İlk namespace set ───────────────────────────────────────────
# Backend tarafından INITIAL_NAMESPACE env var geçilir
if [ -n "${INITIAL_NAMESPACE}" ]; then
  kubectl config set-context --current --namespace="${INITIAL_NAMESPACE}" &>/dev/null
fi
```

---

## 8. Apple Silicon (ARM64) Desteği

Docker Compose `build.args` ile platform ayarlanabilir:

```yaml
# docker-compose.yml — ARM64 uyumlu
services:
  backend:
    build:
      context: .
      dockerfile: docker/backend.Dockerfile
      args:
        TARGETARCH: ${TARGETARCH:-amd64}
    platform: linux/arm64  # Apple Silicon için
```

Otomatik platform tespiti için `Makefile`:

```makefile
# Makefile
ARCH := $(shell uname -m)
ifeq ($(ARCH),arm64)
  TARGETARCH=arm64
else
  TARGETARCH=amd64
endif

up:
	TARGETARCH=$(TARGETARCH) docker compose up --build -d

down:
	docker compose down

reset:
	docker compose exec backend /scripts/reset-question.sh $(Q)
```

Kullanım:
```bash
make up      # Platform otomatik algılanır
make down
make reset Q=3  # Soru 3'ü sıfırla
```

---

## 9. Başlatma Akışı (Sıralı)

```
docker compose up
  │
  ├─[1]─ kind-init container başlar
  │       └── init-cluster.sh çalışır
  │           ├── kind cluster var mı? → yoksa create (~60s)
  │           ├── kubeconfig → /etc/kind/kubeconfig (volume)
  │           └── kubectl wait nodes Ready
  │           EXIT 0  ← service_completed_successfully
  │
  └─[2]─ backend container başlar (kind-init tamamlandıktan sonra)
          ├── Node.js server.js başlar
          ├── /health → cluster ready kontrolü
          └── PTY session'ları için hazır
              │
              ▼
          Browser → localhost:3000
          Terminal → kubectl get nodes → gerçek çıktı
```

---

## 10. Geliştirme vs Production Modu

### Geliştirme
```bash
# Hot-reload ile backend geliştirme
docker compose up kind-init  # Bir kere cluster başlat
npm run dev  # Yerel backend başlat (kind cluster'a bağlanır)
```

### Production
```bash
docker compose up --build -d  # Her şeyi container'da çalıştır
```

### `docker-compose.dev.yml` (Override)
```yaml
# docker-compose.dev.yml
services:
  backend:
    build: ~  # Build yok, yerel çalışıyor
    image: ~
    command: npm run dev
    volumes:
      - ./src:/app/src
      - ./public:/app/public
    environment:
      NODE_ENV: development
      KUBECONFIG: ~/.kube/config  # Yerel kubeconfig (kind cluster)
```

Kullanım:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

---

## 11. Sorun Giderme

### "Cannot connect to Docker daemon"
```bash
# /var/run/docker.sock erişimi kontrol et
ls -la /var/run/docker.sock
# macOS Docker Desktop: Settings → Advanced → "Allow the default Docker socket to be used"
```

### "kind cluster already exists" hatası
```bash
kind delete cluster --name ckad-simulator
docker compose restart kind-init
```

### "kubeconfig not found"
```bash
docker compose logs kind-init  # Error var mı?
docker volume ls | grep kind-kubeconfig  # Volume oluşmuş mu?
docker compose exec backend ls /etc/kind/  # kubeconfig var mı?
```

### Backend container kubectl erişemiyor
```bash
docker compose exec backend kubectl cluster-info
# Error: → KUBECONFIG env var kontrol et
docker compose exec backend env | grep KUBECONFIG
```
