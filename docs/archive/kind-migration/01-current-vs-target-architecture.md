# 01 — Mevcut Mimari vs Hedef Mimari

> **Branch:** `kind-migration`  
> **Kapsam:** İki mimariyi yan yana karşılaştırma — veri akışı, bileşenler, güçlü/zayıf yönler.

---

## 1. Mevcut Mimari (Simülasyon Tabanlı)

```
┌─────────────────────────────────────────────────────┐
│                   Browser (Client)                   │
│  ┌──────────────────┐  ┌────────────────────────┐   │
│  │  Soru Paneli     │  │  xterm.js Terminal     │   │
│  │  (Markdown)      │  │  (WebSocket bağlantısı)│   │
│  └──────────────────┘  └────────────┬───────────┘   │
└───────────────────────────────────────┼─────────────┘
                                        │ WebSocket /ws
                                        │ REST /api/*
                                        ▼
┌─────────────────────────────────────────────────────┐
│               Node.js Server (server.js)             │
│  ┌────────────────────────────────────────────────┐ │
│  │  node-pty: Her soru için ayrı bash PTY         │ │
│  │  PTY env: HOME=sandbox/  PATH=sandbox/bin:$PATH│ │
│  │           KUBECONFIG=/dev/null                 │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
                    │ spawn bash
                    ▼
┌─────────────────────────────────────────────────────┐
│              Sandbox (Bash Process)                  │
│  ┌─────────────────────────────────────────────┐   │
│  │  sandbox/bin/kubectl  ← 1850 satır bash     │   │
│  │  sandbox/bin/k8s-lib.sh ← 2200 satır bash   │   │
│  │  sandbox/bin/helm     ← kısmi simülasyon     │   │
│  │  sandbox/bin/docker   ← kısmi simülasyon     │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  Filesystem State:                          │   │
│  │  sandbox/etc/kubernetes/mock/    ← fixtures │   │
│  │  sandbox/etc/kubernetes/session/ ← runtime  │   │
│  │  sandbox/etc/kubernetes/applied/ ← YAMLs    │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                    │
                    ▼
              ╔═══════════╗
              ║  SAHTE    ║  ← Gerçek Kubernetes yok
              ║ Kubernetes║
              ╚═══════════╝
```

### Mevcut Mimari: Güçlü Yönler

- Zero dependency kurulum — sadece `npm install && node server.js`
- Anlık başlama — sandbox sıfırlama ~100ms
- Internet bağlantısı gerektirmez
- Docker gerektirmez

### Mevcut Mimari: Zayıf Yönler

- ~4.000 satır bash "simülasyon kodu" bakım gerektiriyor
- Her yeni K8s özelliği için kodu güncellemek gerekiyor
- Davranış farklılıkları fark edilmeden öğreniliyor
- `kubectl edit`, HPA, PDB, `kubectl diff`, `kubectl auth can-i` desteklenmiyor veya kısmi
- Helm gerçek chart deploy etmiyor
- RBAC gerçekten çalışmıyor (sahte)
- NetworkPolicy gerçekten enforce edilmiyor (sahte)
- CRD'ler gerçekten işlev görmüyor

---

## 2. Hedef Mimari (kind Tabanlı)

```
┌─────────────────────────────────────────────────────┐
│                   Browser (Client)                   │
│  ┌──────────────────┐  ┌────────────────────────┐   │
│  │  Soru Paneli     │  │  xterm.js Terminal     │   │
│  │  (Markdown)      │  │  (WebSocket bağlantısı)│   │
│  └──────────────────┘  └────────────┬───────────┘   │
└───────────────────────────────────────┼─────────────┘
                                        │ WebSocket /ws
                                        │ REST /api/*
                                        ▼
┌─────────────────────────────────────────────────────┐
│          Node.js Backend (TypeScript)                │
│  ┌────────────────────────────────────────────────┐ │
│  │  node-pty: Her soru için ayrı bash PTY         │ │
│  │  PTY env: HOME=/home/user                      │ │
│  │           KUBECONFIG=/etc/kind/kubeconfig      │ │
│  │           PATH içinde: kubectl, helm, vim, jq  │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │  Scenario Loader:                              │ │
│  │  exam reset → kubectl delete ns exam-q{n}      │ │
│  │            → kubectl apply -f scenarios/q{n}/  │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
        │ KUBECONFIG=/etc/kind/kubeconfig
        │ gerçek kubectl binary
        ▼
┌─────────────────────────────────────────────────────┐
│           kind Cluster (Docker Container)            │
│  ┌─────────────────────────────────────────────┐   │
│  │  kube-apiserver  (upstream Kubernetes)       │   │
│  │  controller-manager                          │   │
│  │  scheduler                                   │   │
│  │  etcd                                        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Namespace Stratejisi:                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │exam-q1   │ │exam-q2   │ │exam-q3   │ ...         │
│  │(soru 1   │ │(soru 2   │ │(soru 3   │            │
│  │ namespace│ │ namespace│ │ namespace│            │
│  └──────────┘ └──────────┘ └──────────┘            │
└─────────────────────────────────────────────────────┘
```

### Hedef Mimari: Güçlü Yönler

- Gerçek Kubernetes — her komut birebir sınav ortamı
- K8s versiyonu yükseltme = sadece kind image tag değiştirme
- Sıfır simülasyon bakımı
- `kubectl edit`, `helm`, `jq`, `vim`, NetworkPolicy, HPA, RBAC hepsi gerçek
- Yeni senaryo eklemek = sadece YAML manifest yazmak
- Otomatik doğrulama scripti yazılabilir (gerçek state kontrol edilebilir)

### Hedef Mimari: Zayıf Yönler

- Docker Desktop gerekli (kurulum ağırlığı artıyor)
- İlk başlatmada kind cluster oluşturma ~30-60 saniye
- RAM kullanımı artıyor (~500MB-1GB ek)
- `docker compose up` gerekiyor (npm ile başlatılamıyor artık)

---

## 3. Docker Compose Yapısı

```yaml
# Hedef docker-compose.yml
services:

  backend:
    build:
      context: .
      dockerfile: docker/backend.Dockerfile
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # kind yönetimi için
      - kind-kubeconfig:/etc/kind                   # kubeconfig paylaşımı
      - ./exams:/app/exams                           # canlı soru güncellemesi
    environment:
      - KUBECONFIG=/etc/kind/kubeconfig
    depends_on:
      kind-init:
        condition: service_completed_successfully

  kind-init:
    build:
      context: .
      dockerfile: docker/kind-init.Dockerfile
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - kind-kubeconfig:/etc/kind
    command: /scripts/init-cluster.sh  # cluster oluşturur, kubeconfig yazar

volumes:
  kind-kubeconfig:
```

---

## 4. PTY Ortamı Karşılaştırması

| Özellik | Mevcut | Hedef |
|---------|--------|-------|
| HOME | `sandbox/` | `/home/user` (container içi) |
| PATH | `sandbox/bin:$PATH` | `/usr/local/bin:$PATH` (gerçek binary'ler) |
| KUBECONFIG | `/dev/null` | `/etc/kind/kubeconfig` |
| kubectl | Bash script (fake) | Gerçek binary v1.32+ |
| helm | Bash script (kısmi) | Gerçek binary v3.x |
| vim | Sistem vim | vim + YAML syntax highlight |
| jq | Sistem jq | Gerçek binary |
| bash completion | Kısmi | Tam kubectl bash completion |

---

## 5. Exam Reset Karşılaştırması

### Mevcut Reset
```bash
# ~100ms
rm -rf sandbox/etc/kubernetes/session/
rm -rf sandbox/etc/kubernetes/applied/
cp -r sandbox/etc/kubernetes/mock/<ns>/ sandbox/etc/kubernetes/namespace/<ns>/
echo "default" > sandbox/etc/kubernetes/namespace
echo "kubernetes-admin@kubernetes" > sandbox/etc/kubernetes/context
```

### Hedef Reset
```bash
# ~2-5 saniye
kubectl delete namespace exam-q3 --ignore-not-found
kubectl create namespace exam-q3
kubectl apply -f exams/scenarios/q3/setup/ --namespace exam-q3
kubectl wait --for=condition=Ready pods --all -n exam-q3 --timeout=30s
```

Trade-off: Reset biraz daha yavaş ama **gerçek cluster state** ile başlıyoruz.

---

## 6. Scoring Değişikliği

### Mevcut Scoring
```
evidence = bash history dosyaları + applied YAML dosyaları
scoring  = history pattern matching + YAML content matching
```

### Hedef Scoring
```
evidence = kubectl get (gerçek cluster state sorgusu) + bash history
scoring  = cluster state doğrulama (kubectl get + jsonpath)
         + bash history (yardımcı olarak)
```

Örnek yeni doğrulama:
```bash
# Eski: history'de "kubectl apply" var mı?
# Yeni: cluster'da deployment gerçekten mevcut mu?
kubectl get deployment nginx -n exam-q1 -o jsonpath='{.spec.replicas}' 2>/dev/null
# → "3" dönüyorsa doğru cevap
```

Bu yaklaşım çok daha güvenilir ve hile-proof.

---

## 7. Geçiş Süreci Özeti

```
Mevcut              Migration Adımları              Hedef
─────────           ──────────────────             ───────
bash simülasyon  →  1. kind cluster setup      →   kind cluster
fixture dosyalar →  2. scenario manifests      →   K8s YAMLs
server.js reset  →  3. backend reset logic     →   kubectl delete+apply
sandbox/bin/*    →  4. container tooling       →   gerçek binary'ler
heuristic score  →  5. cluster state scoring   →   kubectl verify
```
