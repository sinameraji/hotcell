# Benchmark image for the OpenCode provider workload.
# The upstream benchmark still runs its prepare phase, but the package install
# and Node download are already satisfied by this image.
FROM ubuntu:24.04

ARG NODE_VERSION=24.14.1

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_VERSION=${NODE_VERSION} \
    CI=true \
    TURBO_TELEMETRY_DISABLED=1

RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
      bash build-essential ca-certificates curl git python3 python3-setuptools \
      unzip xz-utils procps \
    && prefix="/opt/node-v${NODE_VERSION}-linux-x64" \
    && curl -fsSL "https://nodejs.org/download/release/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
      -o /tmp/node.tar.xz \
    && mkdir -p "$prefix" \
    && tar -xJf /tmp/node.tar.xz --strip-components=1 -C "$prefix" \
    && for executable in node npm npx corepack; do ln -s "$prefix/bin/$executable" "/usr/local/bin/$executable"; done \
    && node --version \
    && rm -rf /var/lib/apt/lists/* /tmp/node.tar.xz

WORKDIR /workspace
