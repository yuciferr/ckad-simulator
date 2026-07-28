# syntax=docker/dockerfile:1
#
# One-shot job container: creates the kind cluster, writes the shared
# kubeconfig, seeds the cluster, then exits. The backend waits on it.

FROM alpine:3.20

ARG KIND_VERSION=v0.24.0
ARG KUBECTL_VERSION=v1.32.3
ARG TARGETARCH=amd64

LABEL org.opencontainers.image.title="CKAD Simulator kind-init" \
      org.opencontainers.image.description="Creates and seeds the kind cluster used by the CKAD Simulator" \
      org.opencontainers.image.source="https://github.com/yuciferr/ckad-simulator" \
      org.opencontainers.image.licenses="MIT"

# Single layer: the download tooling and the scratch files never reach the
# final image, only the two binaries.
RUN apk add --no-cache bash ca-certificates curl docker-cli \
    && curl -fsSLo /usr/local/bin/kind \
        "https://kind.sigs.k8s.io/dl/${KIND_VERSION}/kind-linux-${TARGETARCH}" \
    && curl -fsSLo /usr/local/bin/kubectl \
        "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl" \
    && curl -fsSLo /tmp/kubectl.sha256 \
        "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl.sha256" \
    && echo "$(cat /tmp/kubectl.sha256)  /usr/local/bin/kubectl" | sha256sum -c - \
    && rm /tmp/kubectl.sha256 \
    && chmod +x /usr/local/bin/kind /usr/local/bin/kubectl

COPY docker/kind-config.yaml /kind-config.yaml
COPY scripts/init-cluster.sh scripts/pre-pull-images.sh /
RUN chmod +x /init-cluster.sh /pre-pull-images.sh

ENTRYPOINT ["/init-cluster.sh"]
