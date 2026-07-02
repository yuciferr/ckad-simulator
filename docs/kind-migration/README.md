# kind Migration — Planlama Dökümanları

> **Branch:** `kind-migration`  
> **Hedef:** Simülasyon tabanlı sandbox'tan gerçek kind Kubernetes cluster'a geçiş planı.

---

## Döküman İndeksi

| Dosya | İçerik | Durum |
|-------|--------|-------|
| [00-overview.md](./00-overview.md) | Motivasyon, hedefler, neler değişiyor özeti | ✅ Hazır |
| [01-current-vs-target-architecture.md](./01-current-vs-target-architecture.md) | Mevcut vs hedef mimari, veri akışı karşılaştırması | ✅ Hazır |
| [02-what-changes.md](./02-what-changes.md) | Her bileşen için "önce → sonra" değişiklikleri | ✅ Hazır |
| [03-migration-phases.md](./03-migration-phases.md) | 6 fazlı adım adım implementasyon planı | ✅ Hazır |
| [04-docker-compose-kind-setup.md](./04-docker-compose-kind-setup.md) | Docker Compose yapısı, Dockerfile'lar, kind config | ✅ Hazır |
| [05-exam-scenarios-structure.md](./05-exam-scenarios-structure.md) | Yeni YAML senaryo formatı, örnekler, naming | ✅ Hazır |
| [06-backend-changes.md](./06-backend-changes.md) | TypeScript backend değişiklikleri, kod örnekleri | ✅ Hazır |
| [07-risks-and-mitigations.md](./07-risks-and-mitigations.md) | Teknik ve operasyonel riskler, çözümler | ✅ Hazır |
| [08-quick-start.md](./08-quick-start.md) | Kurulum rehberi, günlük kullanım, sorun giderme | ✅ Hazır |
| [09-kubernetes-version-strategy.md](./09-kubernetes-version-strategy.md) | 2026 CKAD için K8s versiyon seçimi | ✅ Hazır |
| [10-implementation-progress.md](./10-implementation-progress.md) | Implementation session log — done vs pending | ✅ |
| [11-scenarios-cluster-evidence-and-polish.md](./11-scenarios-cluster-evidence-and-polish.md) | Q1–Q17 scenarios, cluster evidence, UI polish | ✅ |

---

## TL;DR — 3 Dakikada Özet

**Problem:** ~4.500 satır bash simülasyon kodu, gerçek K8s'den %30-40 farklı davranış, sürekli bakım yükü.

**Çözüm:** Docker Compose + kind cluster. Terminaldeki her komut gerçek Kubernetes'e gidiyor.

**Hedef Mimari:**
```
Browser → xterm.js → WebSocket → PTY → /bin/bash → REAL kubectl → kind cluster
```

**Kazanımlar:** Sıfır simülasyon bakımı, gerçek kubectl/helm/vim/jq, K8s güncelleme = 1 satır değişiklik.

**Faz planı (8-14 gün):**
1. Faz 1: kind + Docker kurulumu (2 gün)
2. Faz 2: Backend PTY entegrasyonu (2 gün)
3. Faz 3: Senaryo YAML'ları yazma (3 gün)
4. Faz 4: Simülasyon kodu kaldır (1 gün)
5. Faz 5: Scoring güncelle (2 gün)
6. Faz 6: Test ve polish (2 gün)

**K8s versiyonu:** `kindest/node:v1.32.3` (2026 CKAD sınavına uygun)

---

## İmplementasyona Geçiş

Planlama tamamlandı. Implementasyon `kind-migration` branch'inde devam ediyor.

Başlangıç noktası: [03-migration-phases.md → Faz 1](./03-migration-phases.md#faz-1-kind-cluster--docker-altyapısı)
