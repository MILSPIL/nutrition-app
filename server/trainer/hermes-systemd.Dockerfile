# Inherits the exact public Linux runtime just exercised by the resource probe.
FROM scisense-hermes-ci
USER root
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends systemd systemd-sysv dbus && rm -rf /var/lib/apt/lists/* && groupadd --gid 10001 scisense && useradd --uid 10001 --gid scisense --no-create-home --shell /usr/sbin/nologin scisense
ENV container=docker
RUN ln -s /app /opt/scisense/current && ln -s /usr/local /opt/scisense/node && mkdir -p /var/lib/scisense/hermes-lab /etc/systemd/system/scisense-api.service.d && chown -R scisense:scisense /var/lib/scisense && chmod 700 /var/lib/scisense /var/lib/scisense/hermes-lab
COPY deploy/hermes/scisense-api.service /etc/systemd/system/scisense-api.service
COPY server/trainer/hermes-systemd-test.mjs server/trainer/hermes-systemd-test.mjs
# Replaces only the entry point, for a synthetic native turn under actual protections.
RUN printf '[Service]\nType=oneshot\nExecStart=\nExecStart=/opt/scisense/node/bin/node /opt/scisense/current/scripts/hermes-gateway-test.mjs --resource-probe\nEnvironment=HERMES_SYNTHETIC_LAB=/var/lib/scisense/hermes-lab\nTimeoutStartSec=45s\n' > /etc/systemd/system/scisense-api.service.d/90-synthetic.conf && systemctl set-default multi-user.target
STOPSIGNAL SIGRTMIN+3
ENTRYPOINT ["/sbin/init"]
