# Disposable synthetic systemd lab. Never mount host paths or real credentials.
ARG UBUNTU_IMAGE=ubuntu:24.04@sha256:a2d43bffc46670d7108bb3c0468c67c5557c4c92e83e1e34cbff1322ad1b94dc
FROM ${UBUNTU_IMAGE}
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends systemd systemd-sysv dbus ca-certificates curl xz-utils && rm -rf /var/lib/apt/lists/*
ARG TARGETARCH
RUN case "$TARGETARCH" in amd64) node_arch=x64; node_sha=60e3b0a8500819514aca603487c254298cd776de0698d3cd08f11dba5b8289a8 ;; arm64) node_arch=arm64; node_sha=6b0863fb9f627bf4a6c5948dce1de4398174a2e05dbe717503d828e211ca01f0 ;; *) exit 1 ;; esac && mkdir -p /opt/scisense/node && curl -fL "https://nodejs.org/dist/v24.11.1/node-v24.11.1-linux-${node_arch}.tar.xz" -o /tmp/node.tar.xz && echo "$node_sha  /tmp/node.tar.xz" | sha256sum -c - && tar -xJf /tmp/node.tar.xz -C /opt/scisense/node --strip-components=1 && rm /tmp/node.tar.xz
ENV PATH=/opt/scisense/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ENV container=docker
WORKDIR /opt/scisense/current
COPY workers/meal-parser/package.json workers/meal-parser/package-lock.json workers/meal-parser/
RUN npm ci --prefix workers/meal-parser --omit=dev --ignore-scripts --no-audit --no-fund
COPY workers/meal-parser/src workers/meal-parser/src
COPY workers/meal-parser/pilot-proposal.json workers/meal-parser/
COPY scripts/phone-lab scripts/phone-lab
COPY server server
COPY deploy deploy
RUN groupadd --gid 10001 scisense && useradd --uid 10001 --gid scisense --no-create-home --shell /usr/sbin/nologin scisense && cp deploy/scisense-api.service /etc/systemd/system/ && systemctl set-default multi-user.target
STOPSIGNAL SIGRTMIN+3
ENTRYPOINT ["/bin/sh", "/opt/scisense/current/server/linux/systemd-boot.sh"]
