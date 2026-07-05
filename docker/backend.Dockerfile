FROM node:22-bookworm-slim

ARG KUBECTL_VERSION=v1.32.3
ARG HELM_VERSION=v3.17.0
ARG TARGETARCH=amd64

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget bash vim git \
    bash-completion \
    jq \
    python3 make g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN wget -qO /usr/local/bin/yq \
    "https://github.com/mikefarah/yq/releases/latest/download/yq_linux_${TARGETARCH}" \
    && chmod +x /usr/local/bin/yq

RUN curl -Lo /usr/local/bin/kubectl \
    "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl" \
    && chmod +x /usr/local/bin/kubectl

RUN curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | \
    DESIRED_VERSION="${HELM_VERSION}" bash

RUN git clone --depth 1 https://github.com/ahmetb/kubectx /opt/kubectx \
    && ln -s /opt/kubectx/kubectx /usr/local/bin/kubectx \
    && ln -s /opt/kubectx/kubens /usr/local/bin/kubens

RUN kubectl completion bash > /etc/bash_completion.d/kubectl \
    && echo '. /etc/bash_completion' >> /etc/bash.bashrc

RUN echo 'alias k=kubectl' >> /etc/bash.bashrc \
    && echo 'complete -o default -F __start_kubectl k' >> /etc/bash.bashrc

COPY docker/vimrc /etc/vim/vimrc.local
COPY docker/bashrc /etc/ckad/bashrc

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

ENV HOST=0.0.0.0
ENV PORT=3000
ENV SANDBOX_MODE=kind

EXPOSE 3000
CMD ["node", "server.js"]
