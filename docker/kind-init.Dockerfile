FROM alpine:3.20

ARG KIND_VERSION=v0.24.0
ARG KUBECTL_VERSION=v1.32.3
ARG TARGETARCH=amd64

RUN apk add --no-cache curl bash

RUN curl -Lo /usr/local/bin/kind \
    "https://kind.sigs.k8s.io/dl/${KIND_VERSION}/kind-linux-${TARGETARCH}" \
    && chmod +x /usr/local/bin/kind

RUN curl -Lo /usr/local/bin/kubectl \
    "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl" \
    && chmod +x /usr/local/bin/kubectl

COPY docker/kind-config.yaml /kind-config.yaml
COPY scripts/init-cluster.sh /init-cluster.sh
RUN chmod +x /init-cluster.sh

ENTRYPOINT ["/init-cluster.sh"]
