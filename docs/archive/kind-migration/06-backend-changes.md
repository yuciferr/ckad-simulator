# 06 — Backend Değişiklikleri

> **Branch:** `kind-migration`  
> **Kapsam:** Node.js/TypeScript backend'de yapılacak spesifik değişiklikler — dosya listesi, kod örnekleri ve API değişiklikleri.

---

## 1. Etkilenen Dosyalar

```
src/
├── config.ts                ← GÜNCELLEME: yeni env var'lar
├── startup-checks.ts        ← GÜNCELLEME: kubectl + cluster kontrolü
├── sandbox/
│   ├── reset.ts             ← BÜYÜK GÜNCELLEME: dosya silme → kubectl delete+apply
│   ├── cluster.ts           ← YENİ: kind cluster lifecycle
│   ├── scenario.ts          ← YENİ: senaryo yükleme ve reset
│   └── kubectl.ts           ← YENİ: kubectl exec utility
├── ws/
│   └── pty.ts               ← GÜNCELLEME: PTY env değişkenleri
├── routes/
│   ├── sandbox.ts           ← GÜNCELLEME: reset endpoint
│   └── session.ts           ← GÜNCELLEME: evidence toplama
└── types/
    └── exam.ts              ← KÜÇÜK GÜNCELLEME: yeni tipler
```

---

## 2. `src/config.ts` — Yeni Env Değişkenleri

```typescript
// Mevcut değişkenlere ek
export const config = {
  // ... mevcut config ...
  
  // kind / cluster
  kubeconfig: process.env.KUBECONFIG || '/etc/kind/kubeconfig',
  kindClusterName: process.env.KIND_CLUSTER_NAME || 'ckad-simulator',
  
  // Sandbox
  sandboxMode: (process.env.SANDBOX_MODE || 'kind') as 'kind' | 'simulation',
  // 'kind' = gerçek cluster (yeni davranış)
  // 'simulation' = eski davranış (geçiş süreci için fallback)
  
  // Senaryo
  scenariosBasePath: process.env.SCENARIOS_PATH || path.join(process.cwd(), 'exams'),
};
```

---

## 3. `src/sandbox/kubectl.ts` — YENİ DOSYA

kubectl komutlarını backend process'inden çalıştırmak için utility:

```typescript
import { execa } from 'execa';
import { config } from '../config.js';
import { logger } from '../logger.js';

export interface KubectlResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * kubectl komutunu çalıştırır.
 * PTY içinde değil, backend process'inden doğrudan çalıştırır.
 * Senaryo kurulumu ve doğrulama için kullanılır.
 */
export async function kubectl(
  args: string,
  options?: { namespace?: string; timeout?: number }
): Promise<KubectlResult> {
  const argsArray = args.split(' ').filter(Boolean);
  
  if (options?.namespace && !args.includes('-n') && !args.includes('--namespace')) {
    argsArray.push('-n', options.namespace);
  }

  logger.debug(`kubectl ${argsArray.join(' ')}`);

  try {
    const result = await execa('kubectl', argsArray, {
      env: {
        ...process.env,
        KUBECONFIG: config.kubeconfig,
      },
      timeout: options?.timeout ?? 30_000,
      reject: false,  // exit code != 0 olsa da error fırlatma
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? 0,
    };
  } catch (error) {
    const err = error as Error;
    logger.error(`kubectl failed: ${err.message}`);
    return { stdout: '', stderr: err.message, exitCode: 1 };
  }
}

/**
 * kubectl komutunu çalıştırır ve başarısız olursa hata fırlatır.
 */
export async function kubectlOrThrow(
  args: string,
  options?: { namespace?: string; timeout?: number }
): Promise<string> {
  const result = await kubectl(args, options);
  if (result.exitCode !== 0) {
    throw new Error(`kubectl ${args} failed: ${result.stderr}`);
  }
  return result.stdout;
}

/**
 * Cluster'ın hazır olup olmadığını kontrol eder.
 */
export async function isClusterReady(): Promise<boolean> {
  const result = await kubectl('cluster-info', { timeout: 5_000 });
  return result.exitCode === 0;
}
```

---

## 4. `src/sandbox/scenario.ts` — YENİ DOSYA

```typescript
import path from 'path';
import fs from 'fs/promises';
import { kubectl, kubectlOrThrow } from './kubectl.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Bir soru için senaryo dizininin yolunu döndürür.
 * exams/mock/1/scenarios/q3/
 */
export function getScenarioPath(examId: string, questionIndex: number): string {
  return path.join(
    config.scenariosBasePath,
    'mock',        // TODO: practice desteği için parametre ekle
    examId,
    'scenarios',
    `q${questionIndex + 1}`  // 0-indexed → 1-indexed
  );
}

/**
 * Senaryo dizini mevcut mu kontrol eder.
 */
export async function scenarioExists(scenarioPath: string): Promise<boolean> {
  try {
    await fs.access(scenarioPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bir soru için namespace'i temizler ve senaryoyu uygular.
 */
export async function resetQuestionScenario(
  examId: string,
  questionIndex: number
): Promise<{ namespace: string; scenarioApplied: boolean }> {
  const questionNumber = questionIndex + 1;
  const ns = `exam-q${questionNumber}`;
  const scenarioPath = getScenarioPath(examId, questionIndex);

  logger.info(`Resetting Q${questionNumber} (namespace: ${ns})`);

  // 1. Namespace'i sil (tüm kaynaklar ile)
  await kubectl(`delete namespace ${ns} --ignore-not-found --wait=true`);
  logger.debug(`Namespace ${ns} deleted`);

  // 2. Senaryo varsa uygula
  const hasScenario = await scenarioExists(scenarioPath);

  if (hasScenario) {
    // Namespace + kaynakları apply et
    await kubectlOrThrow(`apply -f ${scenarioPath}/`);
    logger.info(`Scenario applied from ${scenarioPath}`);

    // Pod'ların hazır olmasını bekle (timeout: 30s, hata olsa da devam et)
    const waitResult = await kubectl(
      `wait --for=condition=Ready pods --all -n ${ns} --timeout=30s`
    );
    if (waitResult.exitCode !== 0) {
      logger.warn(`Some pods in ${ns} are not ready yet (this may be normal for some scenarios)`);
    }
  } else {
    // Senaryo yok — sadece namespace oluştur
    await kubectlOrThrow(`create namespace ${ns}`);
    logger.debug(`Empty namespace ${ns} created (no scenario)`);
  }

  return { namespace: ns, scenarioApplied: hasScenario };
}

/**
 * Tüm exam soruları için namespace'leri temizler.
 * Exam bitişinde çağrılır.
 */
export async function cleanupExamNamespaces(
  examId: string,
  questionCount: number
): Promise<void> {
  const cleanupPromises = Array.from({ length: questionCount }, (_, i) => {
    const ns = `exam-q${i + 1}`;
    return kubectl(`delete namespace ${ns} --ignore-not-found`);
  });

  await Promise.allSettled(cleanupPromises);
  logger.info(`Cleanup: ${questionCount} namespaces deleted for exam ${examId}`);
}
```

---

## 5. `src/sandbox/cluster.ts` — YENİ DOSYA

```typescript
import { execa } from 'execa';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { isClusterReady } from './kubectl.js';

/**
 * Cluster'ın hazır olmasını bekler (startup sırasında kullanılır).
 */
export async function waitForCluster(timeoutMs = 120_000): Promise<void> {
  const startTime = Date.now();
  
  logger.info('Waiting for kind cluster to be ready...');
  
  while (Date.now() - startTime < timeoutMs) {
    const ready = await isClusterReady();
    if (ready) {
      logger.info('Kind cluster is ready.');
      return;
    }
    await sleep(2000);
  }
  
  throw new Error(`Kind cluster not ready after ${timeoutMs / 1000}s`);
}

/**
 * Cluster durumunu döndürür.
 */
export async function getClusterStatus(): Promise<{
  ready: boolean;
  nodes?: string[];
  version?: string;
}> {
  const ready = await isClusterReady();
  if (!ready) return { ready: false };

  try {
    const { execa: exec } = await import('execa');
    const nodesResult = await exec('kubectl', ['get', 'nodes', '-o', 'name'], {
      env: { ...process.env, KUBECONFIG: config.kubeconfig },
      reject: false,
    });
    
    const versionResult = await exec('kubectl', ['version', '--short', '--client'], {
      env: { ...process.env, KUBECONFIG: config.kubeconfig },
      reject: false,
    });

    const nodes = nodesResult.stdout
      .split('\n')
      .filter(Boolean)
      .map(n => n.replace('node/', ''));

    return {
      ready: true,
      nodes,
      version: versionResult.stdout.trim(),
    };
  } catch {
    return { ready: true };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## 6. `src/sandbox/reset.ts` — GÜNCELLEME

```typescript
// ÖNCE
export async function resetSandbox(examId: string): Promise<void> {
  // dosya silme mantığı
  await fs.rm(sessionDir, { recursive: true });
  await copyMockFixtures(examId);
  await writeFile(namespaceFile, 'default');
  // ...
}

// SONRA
import { resetQuestionScenario } from './scenario.js';
import { config } from '../config.js';

export async function resetSandbox(
  examId: string,
  questionIndex?: number
): Promise<{ namespace?: string }> {
  
  if (config.sandboxMode === 'simulation') {
    // Eski davranış (geçiş süreci fallback)
    return legacyResetSandbox(examId);
  }
  
  // Yeni davranış: kind cluster
  if (questionIndex !== undefined) {
    // Tek soru reset
    const result = await resetQuestionScenario(examId, questionIndex);
    return { namespace: result.namespace };
  } else {
    // Tüm exam reset (ilk soru için)
    const result = await resetQuestionScenario(examId, 0);
    return { namespace: result.namespace };
  }
}
```

---

## 7. `src/ws/pty.ts` — GÜNCELLEME

```typescript
// ÖNCE
function buildPtyEnv(questionId: number): Record<string, string> {
  return {
    HOME: path.resolve('sandbox'),
    PATH: `${path.resolve('sandbox/bin')}:${process.env.PATH ?? ''}`,
    KUBECONFIG: '/dev/null',
    TERM: 'xterm-256color',
  };
}

// SONRA
function buildPtyEnv(questionId: number): Record<string, string> {
  const questionNumber = questionId + 1;
  const ns = `exam-q${questionNumber}`;
  
  return {
    HOME: process.env.HOME || '/root',
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    KUBECONFIG: config.kubeconfig,
    TERM: 'xterm-256color',
    INITIAL_NAMESPACE: ns,  // bashrc'de namespace set için
  };
}

// PTY spawn konfigürasyonu güncelleme
function spawnPty(questionId: number): IPty {
  const env = buildPtyEnv(questionId);
  
  return pty.spawn('/bin/bash', ['--rcfile', '/etc/ckad/bashrc'], {
    name: 'xterm-256color',
    cols: 220,
    rows: 50,
    cwd: process.env.HOME || '/root',
    env,
  });
}
```

---

## 8. `src/routes/sandbox.ts` — GÜNCELLEME

```typescript
// POST /api/sandbox/reset
router.post('/reset', async (req, res) => {
  const { examId, questionIndex } = req.body;
  
  // Input validation (mevcut)
  if (!isValidExamId(examId)) {
    return res.status(400).json({ error: 'Invalid exam ID' });
  }

  try {
    const result = await resetSandbox(examId, questionIndex ?? 0);
    
    res.json({
      ok: true,
      namespace: result.namespace,
      mode: config.sandboxMode,
    });
  } catch (error) {
    logger.error('Sandbox reset failed:', error);
    res.status(500).json({ error: 'Reset failed', details: String(error) });
  }
});
```

---

## 9. `src/routes/session.ts` — GÜNCELLEME

```typescript
// GET /api/session/evidence — cluster state ekleniyor
router.get('/evidence', async (req, res) => {
  const { examId, questionIndex } = req.query;

  // Mevcut: history ve applied dosyalarını oku
  const history = await collectHistory();
  const applied = await collectApplied();

  // YENİ: Cluster state'ini de al (kind mode'da)
  let clusterState = null;
  if (config.sandboxMode === 'kind') {
    const ns = `exam-q${Number(questionIndex) + 1}`;
    clusterState = await collectClusterState(ns);
  }

  res.json({
    history,
    applied,
    clusterState,  // YENİ field — scoring için kullanılacak
  });
});

/**
 * Cluster'dan gerçek resource state'ini toplar.
 */
async function collectClusterState(namespace: string) {
  const resources = ['pods', 'deployments', 'services', 'configmaps',
                     'secrets', 'cronjobs', 'jobs', 'ingresses',
                     'persistentvolumeclaims', 'serviceaccounts',
                     'roles', 'rolebindings'];
  
  const state: Record<string, unknown> = {};
  
  await Promise.allSettled(
    resources.map(async (resource) => {
      const result = await kubectl(`get ${resource} -n ${namespace} -o json`);
      if (result.exitCode === 0) {
        try {
          state[resource] = JSON.parse(result.stdout);
        } catch {
          state[resource] = null;
        }
      }
    })
  );
  
  return state;
}
```

---

## 10. `src/startup-checks.ts` — GÜNCELLEME

```typescript
// Mevcut: bash, node version kontrolü
// YENİ: kubectl + cluster erişim kontrolü ekleniyor

export async function runStartupChecks(): Promise<void> {
  // Mevcut kontroller...
  checkBashVersion();
  checkNodeVersion();
  
  // YENİ: kind mode kontrolleri
  if (config.sandboxMode === 'kind') {
    await checkKubectlAvailable();
    await checkClusterConnectivity();
  }
}

async function checkKubectlAvailable(): Promise<void> {
  try {
    const { execa } = await import('execa');
    const result = await execa('kubectl', ['version', '--client', '--short'], {
      reject: false,
      timeout: 5000,
    });
    if (result.exitCode === 0) {
      logger.info(`kubectl: ${result.stdout.trim()}`);
    } else {
      logger.warn('kubectl not available or returned error — kind mode may not work');
    }
  } catch {
    logger.error('kubectl binary not found — install kubectl or use simulation mode');
  }
}

async function checkClusterConnectivity(): Promise<void> {
  const ready = await isClusterReady();
  if (ready) {
    logger.info('Cluster connectivity: OK');
  } else {
    logger.warn(
      'Cannot connect to cluster — waiting for kind-init to complete. ' +
      'This is normal on first startup.'
    );
  }
}
```

---

## 11. `/health` Endpoint — GÜNCELLEME

```typescript
// GET /health
app.get('/health', async (req, res) => {
  const clusterReady = config.sandboxMode === 'kind'
    ? await isClusterReady()
    : true;  // simulation mode'da her zaman true

  res.status(clusterReady ? 200 : 503).json({
    status: clusterReady ? 'ok' : 'initializing',
    mode: config.sandboxMode,
    cluster: clusterReady ? 'ready' : 'starting',
    timestamp: new Date().toISOString(),
  });
});
```

Frontend bu endpoint'i polling yaparak cluster hazır olana kadar "Cluster başlatılıyor..." mesajı gösterir.

---

## 12. Yeni Paket Bağımlılıkları

```json
// package.json — eklenecek
{
  "dependencies": {
    "execa": "^9.5.0"  // kubectl exec wrapper
  }
}
```

```bash
npm install execa
```

> **Not:** `execa` modern ESM-first, async process execution library. Node'un `child_process` modülünden daha ergonomik ve güvenli.

---

## 13. Migration Sırasında Backward Compatibility

`SANDBOX_MODE=simulation` env var ile eski davranış korunuyor. Bu geçiş süreci boyunca faydalı:

```bash
# Eski mod (simülasyon)
SANDBOX_MODE=simulation node server.js

# Yeni mod (kind cluster)
SANDBOX_MODE=kind KUBECONFIG=/etc/kind/kubeconfig node server.js

# Docker Compose (otomatik yeni mod)
docker compose up  # SANDBOX_MODE=kind varsayılan
```

Bu sayede kind setup hazır olmadan önce de uygulama test edilebilir.
