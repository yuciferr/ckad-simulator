# 00 — kind Migration: Genel Bakış

> **Branch:** `kind-migration`  
> **Oluşturulma:** Temmuz 2026  
> **Kapsam:** Simüle edilmiş kubectl'den gerçek kind cluster'a geçiş — motivasyon, hedefler ve üst düzey plan.

---

## 1. Problem: Simülasyonun Sınırları

Mevcut projede `sandbox/bin/kubectl` tam bir simülasyon motoru. Bash dosyaları, fixture text dosyaları ve session state yönetimiyle gerçek Kubernetes davranışını taklit ediyor. Bu yaklaşımın temel sorunları:

| Sorun | Etki |
|-------|------|
| Her komutu kapsamak çok zor | Yeni CKAD senaryoları eklemek saatler alıyor |
| Gerçekten farklı davranış | `kubectl apply`, `rollout`, `exec`, `logs` ince detaylarda farklı |
| Fark etmesi güç | Kullanıcı yanlış bir şey öğreniyor ama bunu bilmiyor |
| Kubernetes sürüm güncellemesi | Her yeni K8s sürümünde simülasyonu da güncellemek gerekiyor |
| `helm`, `vim`, `jq` gibi araçlar | Ya kısmi simülasyon ya da hiç yok |
| `kubectl edit` | Şu an desteklenmiyor — gerçek sınavda kritik |
| CronJob, HPA, PDB gibi kaynaklar | Kısmi veya hiç simülasyon yok |

**Özet:** ~2.000 satır bash kodu yazıyoruz ama yine de gerçek sınav deneyiminin ancak %60-70'ini verebiliyoruz.

---

## 2. Çözüm: Gerçek Kubernetes

Simüle etmek yerine gerçek Kubernetes kullanmak. Araç: **kind** (Kubernetes in Docker).

```
Mevcut:
  Browser → xterm.js → WebSocket → PTY → /bin/bash → FAKE kubectl (bash script)

Hedef:
  Browser → xterm.js → WebSocket → PTY → /bin/bash → REAL kubectl → kind cluster
```

### Neden kind?

| Özellik | kind | k3s | minikube |
|---------|------|-----|---------|
| Upstream Kubernetes (tam uyumlu) | ✅ | Kısmi | ✅ |
| Docker container içinde çalışır | ✅ | ❌ | ❌ |
| Kaynak kullanımı | ~500MB-1GB RAM | ~300MB | ~2GB+ |
| CKAD sınav ortamına yakınlık | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Programatik kontrol | ✅ | Orta | Orta |
| macOS ARM64 desteği | ✅ | ✅ | ✅ |
| CI/CD uyumu | ✅ | ❌ | Kısmi |

kind, gerçek `kube-apiserver`, `etcd`, `controller-manager` ve `scheduler` çalıştırır. CKAD sınavındaki upstream Kubernetes ile pratik olarak birebir aynıdır.

---

## 3. Hedef Mimari

```
┌─────────────────────────────────────┐
│         Browser (Client)             │
│   xterm.js + React UI                │
└──────────────┬──────────────────────┘
               │ WebSocket + REST
               ▼
┌─────────────────────────────────────┐
│      Backend (Node.js + TypeScript)  │
│   Express + ws + node-pty            │
│   PTY her soru için /bin/bash açar   │
│   Exam scenario yükleyici            │
└──────────────┬──────────────────────┘
               │ kubectl (gerçek binary)
               ▼
┌─────────────────────────────────────┐
│      kind Cluster (Docker container) │
│   Tek node, upstream Kubernetes      │
│   Her exam oturumu için namespace    │
│   Sıfırlama: ns delete + apply       │
└─────────────────────────────────────┘
```

Docker Compose servisleri:
```yaml
services:
  backend:   # Node.js uygulaması (PTY + API + WebSocket)
  kind:      # kind cluster manager (init + reset script)
```

---

## 4. Neler Kazanıyoruz?

### Teknik Kazanımlar

- **Sıfır simülasyon kodu bakımı** — kubectl, helm, vim, jq hepsi gerçek
- **Kubernetes versiyonu güncellemek** = sadece kind image tag'i değiştirmek
- **`kubectl explain`** — gerçek cluster'dan geliyor, her zaman güncel
- **`kubectl edit`** — tam çalışıyor (vi/vim, gerçek YAML patch)
- **`kubectl rollout`, `kubectl exec`, `kubectl logs`** — bire bir gerçek
- **Helm** — gerçek chart'lar, gerçek release state
- **NetworkPolicy, HPA, PDB** — artık simülasyon gerektirmiyor
- **`kubectl auth can-i`** — RBAC gerçekten çalışıyor
- **CRD senaryoları** — gerçek CRD kurabilir, test edebilirsiniz

### Kullanıcı Deneyimi Kazanımları

- Sınavda karşılaştığı her komutu burada da aynı şekilde çalıştırabilir
- "Bu simülatörde çalışıyor ama sınavda neden çalışmadı?" sorusu tamamen ortadan kalkar
- `vim`, `jq`, `yq` gibi araçlar backend container'da kurulu olabilir

### Geliştirici Deneyimi Kazanımları

- Yeni soru eklemek = sadece `setup.yaml` manifest'i yazmak
- Senaryo doğrulama = gerçek cluster'a apply et ve test et
- Simülasyon bug'ı fix etmek zorunda kalmak yok

---

## 5. Neler Kaybediyoruz / Trade-off'lar

| Trade-off | Etki | Çözüm |
|-----------|------|-------|
| Docker Desktop gerekli | Setup daha ağır | `docker version` kontrolü + açık hata mesajı |
| İlk başlatma süresi | kind cluster oluşturma ~30-60 saniye | Startup script'te bekletme + progress gösterimi |
| RAM kullanımı artışı | +500MB-1GB (kind için) | Minimum sistem gereksinimleri dokümante edilmeli |
| Namespace izolasyonu | Multi-user zor | Şimdilik single-user, gelecekte per-session NS |
| Exam reset süresi | Namespace temizleme 2-5 saniye | Kabul edilebilir (simülasyona göre iyi) |
| İnternet bağlantısı gereksinimi (ilk kurulum) | kind image pull | Offline mode için image pre-pull |

---

## 6. Kapsam: Bu Migration'da Neler Değişiyor?

### Değişecekler

| Bileşen | Mevcut | Hedef |
|---------|--------|-------|
| `sandbox/bin/kubectl` | 1850 satır bash simülasyon | Kaldırılıyor |
| `sandbox/bin/k8s-lib.sh` | 2200 satır state yönetimi | Kaldırılıyor |
| `sandbox/bin/helm` | Kısmi simülasyon | Kaldırılıyor (gerçek helm kullanılacak) |
| `sandbox/etc/kubernetes/mock/` | Fixture text dosyaları | Kaldırılıyor |
| `sandbox/etc/kubernetes/session/` | Runtime state | Kaldırılıyor |
| `docker-compose.yml` | Sadece backend | Frontend + Backend + kind init |
| `Dockerfile` | Node.js only | kubectl + helm + vim + jq eklenecek |
| `exams/` içeriği | MD dosyası + fixture | MD + `setup/` YAML manifests |
| `src/sandbox/` (backend) | PTY + bash env setup | PTY + kubeconfig yönetimi |
| `server.js` / `src/` | Sandbox reset = dosya silme | Sandbox reset = kubectl delete ns + apply |

### Değişmeyecekler

| Bileşen | Sebep |
|---------|-------|
| `public/` — UI (xterm.js, React/TS) | Terminale bağlanma şekli aynı |
| WebSocket protokolü | PTY katmanı aynı |
| REST API yapısı | `/api/exams`, `/api/sandbox/reset` aynı |
| `exams/` MD format | Soru ve cevap formatı korunuyor |
| Scoring sistemi | Değerlendirme mantığı büyük ölçüde aynı |
| TypeScript altyapısı | Zaten production-grade |

---

## 7. Bu Döküman Serisinin İçeriği

| Dosya | İçerik |
|-------|--------|
| `00-overview.md` | Bu dosya — motivasyon ve üst düzey plan |
| `01-current-vs-target-architecture.md` | Detaylı mimari karşılaştırma |
| `02-what-changes.md` | Her bileşen için değişiklik detayı |
| `03-migration-phases.md` | Adım adım uygulama planı |
| `04-docker-compose-kind-setup.md` | Docker Compose + kind teknik kurulum |
| `05-exam-scenarios-structure.md` | Yeni exam senaryo format ve örnekleri |
| `06-backend-changes.md` | Node.js/TypeScript değişiklik detayları |
| `07-risks-and-mitigations.md` | Olası sorunlar ve önlemler |
| `08-quick-start.md` | Yeni yapıda geliştirmeye başlama rehberi |
| `09-kubernetes-version-strategy.md` | 2026 CKAD için doğru K8s versiyonu |

---

## 8. Başarı Kriterleri

Migration tamamlandığında şunlar mümkün olmalı:

- [ ] `docker compose up` komutu ile tüm sistem ayağa kalkıyor
- [ ] kind cluster otomatik oluşturuluyor (30-60 saniye içinde)
- [ ] `kubectl get nodes` terminalde gerçek node döndürüyor
- [ ] `kubectl apply -f my.yaml` gerçekten cluster'a uygulama yapıyor
- [ ] `kubectl edit deployment/foo` gerçekten açılıp YAML düzenleniyor
- [ ] `kubectl logs`, `kubectl exec` gerçek Pod'dan geliyor
- [ ] Soru reset'i 5 saniyede tamamlanıyor
- [ ] Helm install gerçek chart deploy ediyor
- [ ] Yeni soru eklemek sadece `setup.yaml` yazmakla mümkün
- [ ] macOS ARM64 (Apple Silicon) + macOS Intel + Linux üzerinde çalışıyor
