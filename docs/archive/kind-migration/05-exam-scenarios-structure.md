# 05 — Exam Senaryo Yapısı

> **Branch:** `kind-migration`  
> **Kapsam:** Yeni senaryo formatı, dizin yapısı, örnek senaryolar ve naming convention.

---

## 1. Neden Senaryo Yapısı Değişiyor?

### Eski Yaklaşım (Fixture Dosyaları)
```
sandbox/etc/kubernetes/mock/pluto/
├── pods.txt            ← kubectl get pods çıktısı (metin)
├── deploy.txt          ← kubectl get deployments çıktısı (metin)
├── svc.txt             ← kubectl get services çıktısı (metin)
└── pods.d/
    └── pod-name/
        ├── status      ← pod status
        ├── labels      ← pod labels
        └── yaml        ← pod YAML
```

**Problem:** Bu dosyalar _görüntüleme_ için — gerçek Kubernetes nesneleri değil.

### Yeni Yaklaşım (YAML Manifestler)
```
exams/mock/1/scenarios/q1/
├── setup.yaml          ← Gerçek K8s manifest
├── setup-rbac.yaml     ← (isteğe bağlı) RBAC kaynakları
└── verify.sh           ← (isteğe bağlı) Otomatik doğrulama scripti
```

**Fayda:** Bu YAML dosyaları doğrudan `kubectl apply` edilir — gerçek nesneler oluşur.

---

## 2. Dizin Yapısı

```
exams/
├── manifest.json         ← Var olan exam registry (değişmiyor)
├── schema.json           ← Var olan schema (değişmiyor)
│
├── mock/
│   └── 1/
│       ├── exam.md       ← Sorular (format değişmiyor)
│       ├── answer.md     ← Cevaplar (format değişmiyor)
│       └── scenarios/    ← YENİ: Senaryo klasörü
│           ├── q1/
│           │   ├── setup.yaml
│           │   └── verify.sh
│           ├── q2/
│           │   └── setup.yaml
│           ├── q3/
│           │   ├── setup.yaml
│           │   └── setup-svc.yaml
│           └── ...q17/
│
└── practice/
    ├── core_concepts/
    │   ├── exam.md
    │   ├── answer.md
    │   └── scenarios/    ← Practice için isteğe bağlı
    │       └── q1/
    │           └── setup.yaml
    └── ...
```

---

## 3. Naming Convention

### Namespace Adları
```
Mock Exam 1, Soru 3  →  namespace: exam-1-q3
Practice core_concepts, Soru 5  →  namespace: practice-core-q5
```

**Format:** `{exam-type}-{exam-id}-q{question-number}`

Alternatif basit format (mock exam için): `exam-q{n}` (sadece aktif soruyu sayıyoruz)

> **Karar:** Mock exam için `exam-q{n}` kullanacağız. Her soru kendi namespace'inde çalışıyor, aynı anda birden fazla soru açık olabilir.

### setup.yaml İçinde Namespace

İki yaklaşım var:

**Yaklaşım A: Namespace setup.yaml'a yazılı**
```yaml
# exams/mock/1/scenarios/q1/setup.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: exam-q1
---
apiVersion: v1
kind: Pod
metadata:
  name: nginx-pod
  namespace: exam-q1
```

**Yaklaşım B: Backend namespace inject eder**
```yaml
# exams/mock/1/scenarios/q1/setup.yaml
# namespace eksik — backend --namespace flag ile apply eder
apiVersion: v1
kind: Pod
metadata:
  name: nginx-pod
  # namespace: backend tarafından eklenir
```

> **Karar:** **Yaklaşım A** kullanacağız. YAML'lar self-contained ve test edilebilir olmalı. Namespace adı tutarlı (exam-q{n}) ve öngörülebilir olduğu için sabit yazabiliriz.

---

## 4. Örnek Senaryolar

### Q1 — Liveness Probe Sorunu

```yaml
# exams/mock/1/scenarios/q1/setup.yaml
# Öğrenci görevi: Pod'daki yanlış liveness probe'u düzeltmeli
apiVersion: v1
kind: Namespace
metadata:
  name: exam-q1
---
apiVersion: v1
kind: Pod
metadata:
  name: pod1
  namespace: exam-q1
  labels:
    app: pod1
spec:
  containers:
  - name: nginx
    image: nginx:1.25
    ports:
    - containerPort: 80
    livenessProbe:
      httpGet:
        path: /this-does-not-exist    # ← Kasıtlı hata
        port: 80
      initialDelaySeconds: 5
      periodSeconds: 5
      failureThreshold: 3
```

**verify.sh:**
```bash
#!/bin/bash
# exams/mock/1/scenarios/q1/verify.sh
NS="exam-q1"

PROBE_PATH=$(kubectl get pod pod1 -n "$NS" \
  -o jsonpath='{.spec.containers[0].livenessProbe.httpGet.path}' 2>/dev/null)

if [ "$PROBE_PATH" = "/" ] || [ "$PROBE_PATH" = "/healthz" ] || [ "$PROBE_PATH" = "/health" ]; then
  echo "PASS: liveness probe path = $PROBE_PATH"
  exit 0
else
  echo "FAIL: liveness probe path is '$PROBE_PATH' (expected '/' or '/healthz')"
  exit 1
fi
```

---

### Q2 — Deployment + Service Oluşturma

```yaml
# exams/mock/1/scenarios/q2/setup.yaml
# Öğrenci görevi: sun namespace'inde deployment ve service oluşturmalı
# Bu senaryo sadece namespace oluşturur — öğrenci her şeyi sıfırdan kurar
apiVersion: v1
kind: Namespace
metadata:
  name: exam-q2
```

---

### Q3 — Service Debug

```yaml
# exams/mock/1/scenarios/q3/setup.yaml
# Öğrenci görevi: earth namespace'indeki servis bağlantısını debug etmeli
apiVersion: v1
kind: Namespace
metadata:
  name: exam-q3
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deploy
  namespace: exam-q3
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx        # ← Service selector ile eşleşmiyor (kasıtlı bug)
    spec:
      containers:
      - name: nginx
        image: nginx:1.25
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: nginx-svc
  namespace: exam-q3
spec:
  selector:
    app: web-nginx        # ← Deployment label'ı ile eşleşmiyor (kasıtlı bug)
  ports:
  - port: 80
    targetPort: 80
```

---

### Q5 — NetworkPolicy

```yaml
# exams/mock/1/scenarios/q5/setup.yaml
# Öğrenci görevi: neptune namespace'inde NetworkPolicy oluşturmalı
apiVersion: v1
kind: Namespace
metadata:
  name: exam-q5
  labels:
    name: exam-q5
---
apiVersion: v1
kind: Pod
metadata:
  name: frontend
  namespace: exam-q5
  labels:
    app: frontend
    role: frontend
spec:
  containers:
  - name: nginx
    image: nginx:1.25
---
apiVersion: v1
kind: Pod
metadata:
  name: backend
  namespace: exam-q5
  labels:
    app: backend
    role: backend
spec:
  containers:
  - name: nginx
    image: nginx:1.25
---
apiVersion: v1
kind: Pod
metadata:
  name: database
  namespace: exam-q5
  labels:
    app: database
    role: database
spec:
  containers:
  - name: postgres
    image: postgres:16
    env:
    - name: POSTGRES_PASSWORD
      value: "testpass"
```

---

### Q10 — RBAC

```yaml
# exams/mock/1/scenarios/q10/setup.yaml
# Öğrenci görevi: saturn namespace'inde ServiceAccount ve RBAC kuralları oluşturmalı
apiVersion: v1
kind: Namespace
metadata:
  name: exam-q10
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pipeline-sa
  namespace: exam-q10
```

---

### Q12 — Rolling Update / Rollback

```yaml
# exams/mock/1/scenarios/q12/setup.yaml
# Öğrenci görevi: titan namespace'indeki deployment'ı güncelle ve rollback yap
apiVersion: v1
kind: Namespace
metadata:
  name: exam-q12
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-deploy
  namespace: exam-q12
  annotations:
    kubernetes.io/change-cause: "Initial deployment v1.0"
spec:
  replicas: 3
  revisionHistoryLimit: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: web
        image: nginx:1.24    # Öğrenci 1.25'e güncelleyecek
        ports:
        - containerPort: 80
```

---

### Q14 — Helm

```yaml
# exams/mock/1/scenarios/q14/setup.yaml
# Öğrenci görevi: Helm ile bir chart deploy etmeli
# Bu senaryo namespace + (isteğe bağlı) Helm repo hazırlığı
apiVersion: v1
kind: Namespace
metadata:
  name: exam-q14
```

> **Not:** Helm senaryoları için `verify.sh` daha önemli — gerçek chart deploy kontrolü:
```bash
# verify.sh
helm list -n exam-q14 | grep -q "my-release" && echo "PASS" || echo "FAIL"
```

---

## 5. `opt/course/` Dosyaları

Bazı sorular `opt/course/` referansı veriyor. Bu dosyalar artık senaryo içinde oluşturulacak:

```yaml
# exams/mock/1/scenarios/q2/setup.yaml içinde
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: course-files
  namespace: exam-q2
binaryData: {}
# Alternatif: initContainer ile dosya oluştur
```

**Daha iyi yaklaşım:** Backend container'da `/opt/course/` dizinine dosyaları kopyala:

```bash
# scripts/setup-course-files.sh
# Her exam başlangıcında çalışır
mkdir -p /opt/course/p2
echo "#!/bin/bash\nkubectl get pods -n sun" > /opt/course/p2/sunny_status_command.sh
chmod +x /opt/course/p2/sunny_status_command.sh
```

---

## 6. Senaryo Validasyon CLI

Yeni bir senaryo yazıldığında doğrulamak için:

```bash
npm run validate:scenarios

# Kontroller:
# ✅ YAML valid (parse edilebilir)
# ✅ Namespace adı exam-q{n} formatında
# ✅ apiVersion geçerli
# ✅ Image tag 'latest' değil (pinned)
# ✅ setup.yaml her soru için var (uyarı: zorunlu değil)
# ✅ verify.sh varsa executable
```

---

## 7. Senaryo Oluşturma Rehberi

Yeni bir soru için senaryo yazarken:

1. **Namespace oluştur** — her senaryo kendi namespace'ini tanımlar
2. **Başlangıç durumunu minimal tut** — sadece soruyu çözmek için gereken kaynaklar
3. **Kasıtlı hataları yorum satırıyla belirt** — `# ← Intentional bug: label mismatch`
4. **Image'ları pin et** — `nginx:1.25` (latest değil)
5. **verify.sh yaz** — otomatik değerlendirme için
6. **Gerçek cluster'da test et** — `kubectl apply -f setup.yaml` çalışmalı
7. **Cleanup test et** — `kubectl delete -f setup.yaml` temiz silmeli

---

## 8. Reset Davranışı

Kullanıcı "Reset Question" dediğinde:

```bash
# scripts/reset-question.sh Q_NUM
Q_NUM=$1
NS="exam-q${Q_NUM}"
SCENARIO_DIR="exams/mock/1/scenarios/q${Q_NUM}"

echo "Resetting question ${Q_NUM}..."

# 1. Mevcut namespace'i sil (tüm kaynaklar ile birlikte)
kubectl delete namespace "${NS}" --ignore-not-found --wait=true

# 2. Senaryo varsa uygula
if [ -d "${SCENARIO_DIR}" ]; then
  kubectl apply -f "${SCENARIO_DIR}/"
  
  # Pod'ların hazır olmasını bekle (max 30s)
  kubectl wait --for=condition=Ready pods --all \
    -n "${NS}" --timeout=30s 2>/dev/null || true
fi

echo "Question ${Q_NUM} reset complete."
```

**Süreler:**
- Namespace silme: ~1-3 saniye
- Namespace oluşturma + apply: ~1-2 saniye
- Pod hazır bekleme: 0-30 saniye (image cache'e bağlı)
- **Toplam tipik reset süresi: 3-8 saniye**

İlk reset'te image pull gerekiyorsa bu 30-60 saniyeye çıkabilir. Sonraki reset'lerde Docker cache'den geliyor.
