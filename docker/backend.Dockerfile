# syntax=docker/dockerfile:1
#
# CKAD Simulator backend — the web server plus the real shell the candidate
# types into. Built in three stages so the toolchain needed to *produce* the
# app (python3/make/g++ for node-pty, TypeScript, devDependencies) never ships
# in the image that *runs* it.

ARG NODE_IMAGE=node:22-bookworm-slim

# ─── stage 1: exam CLI tools ────────────────────────────────────────────────
# Downloaded into a staging root so the runtime stage can take the binaries
# without inheriting curl/git layers or the download scratch files.
FROM ${NODE_IMAGE} AS tools

ARG KUBECTL_VERSION=v1.32.3
ARG HELM_VERSION=v3.17.0
ARG YQ_VERSION=v4.45.1
ARG TARGETARCH=amd64

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /out/usr/local/bin

# kubectl — verified against the checksum published alongside the release.
RUN curl -fsSLo kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl" \
    && curl -fsSLo kubectl.sha256 "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl.sha256" \
    && echo "$(cat kubectl.sha256)  kubectl" | sha256sum -c - \
    && rm kubectl.sha256 \
    && chmod +x kubectl

RUN curl -fsSLo yq "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_${TARGETARCH}" \
    && chmod +x yq

# PATH is extended because the installer verifies its own work by running
# `helm version` afterwards.
RUN curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 \
    | PATH="/out/usr/local/bin:${PATH}" HELM_INSTALL_DIR=/out/usr/local/bin \
      USE_SUDO=false DESIRED_VERSION="${HELM_VERSION}" bash

# kubectx/kubens are plain shell scripts — install them, drop the git checkout.
RUN git clone --depth 1 https://github.com/ahmetb/kubectx /tmp/kubectx \
    && install -m 0755 /tmp/kubectx/kubectx /tmp/kubectx/kubens /out/usr/local/bin/ \
    && rm -rf /tmp/kubectx

# ─── stage 2: build the app ─────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS builder

# node-pty is a native addon and has to be compiled; this toolchain is the
# single biggest reason the old single-stage image was ~900 MB.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop devDependencies from the tree the runtime stage copies. The compiled
# node-pty binding survives this because it lives in a prod dependency.
#
# node-pty also ships prebuilt bindings for every platform it supports — the
# two win32 ones alone are 24 MB of a 27 MB package — plus a Windows-only
# ConPTY vendor dir. None of it is reachable from a Linux container.
RUN npm prune --omit=dev \
    && find node_modules/node-pty/prebuilds -mindepth 1 -maxdepth 1 -type d \
        ! -name 'linux-*' -exec rm -rf {} + \
    && rm -rf node_modules/node-pty/third_party

# ─── stage 3: runtime ───────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime

LABEL org.opencontainers.image.title="CKAD Simulator" \
      org.opencontainers.image.description="Browser-based CKAD exam simulator backed by a real kind cluster" \
      org.opencontainers.image.source="https://github.com/yuciferr/ckad-simulator" \
      org.opencontainers.image.licenses="MIT"

# Only what the candidate's shell actually needs at runtime — no compilers.
RUN apt-get update && apt-get install -y --no-install-recommends \
        bash \
        bash-completion \
        ca-certificates \
        curl \
        git \
        jq \
        vim \
        wget \
    && rm -rf /var/lib/apt/lists/*

COPY --from=tools /out/usr/local/bin/ /usr/local/bin/

RUN kubectl completion bash > /etc/bash_completion.d/kubectl \
    && { \
        echo '. /etc/bash_completion'; \
        echo 'alias k=kubectl'; \
        echo 'complete -o default -F __start_kubectl k'; \
    } >> /etc/bash.bashrc

# Mock exam Q14 tells the candidate the bitnami repo "is already added", so it
# has to exist in the image the exam shell runs in. Baking it here (rather than
# in the throwaway kind-init container, where it used to be attempted) is what
# makes that true.
#
# The downloaded index cache is dropped again: it is 26 MB, it goes stale the
# moment the image is built, and step 1 of Q14 is "update the Helm repo", which
# is exactly the command that rebuilds it.
RUN helm repo add bitnami https://charts.bitnami.com/bitnami \
    && rm -rf /root/.cache/helm

COPY docker/vimrc /etc/vim/vimrc.local
COPY docker/bashrc /etc/ckad/bashrc

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

COPY package.json server.js ./
COPY public ./public
# Compiled client last — it must win over anything stale under public/.
COPY --from=builder /app/public/js ./public/js
COPY exams ./exams
COPY scripts ./scripts

# The PTY's cwd. It is normally created when an exam starts, but a terminal
# opened before that would fail to chdir into it — cheaper to just guarantee it.
RUN mkdir -p /app/sandbox

ENV HOST=0.0.0.0 \
    PORT=3000 \
    NODE_ENV=production \
    SANDBOX_MODE=kind

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -fsS http://localhost:3000/health || exit 1

# Runs as root on purpose: the exam shell is expected to be a privileged
# sandbox (it symlinks /opt/course and edits system paths), matching what the
# real exam environment hands the candidate.
CMD ["node", "server.js"]
