# Reuses the exact pinned public runtime built by the existing CI job.
FROM scisense-hermes-ci
USER root
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends systemd systemd-sysv dbus && rm -rf /var/lib/apt/lists/* && groupadd --gid 10001 scisense && groupadd --gid 10005 scisense-broker && useradd --uid 10001 --gid scisense --groups scisense-broker --no-create-home --shell /usr/sbin/nologin scisense && useradd --uid 10002 --user-group --groups scisense --no-create-home --shell /usr/sbin/nologin scisense-y && useradd --uid 10003 --user-group --groups scisense --no-create-home --shell /usr/sbin/nologin scisense-w && useradd --uid 10004 --user-group --groups scisense --no-create-home --shell /usr/sbin/nologin scisense-payer
COPY server /app/server
COPY scripts/hermes-personal-runtime-fixture.mjs scripts/hermes-personal-native-systemd-ci.py /app/scripts/
COPY deploy/personal /etc/systemd/system/
RUN mkdir -p /opt/scisense/personal/adapters /etc/scisense/personal /var/lib/scisense /etc/systemd/system/scisense-api.service.d && cp /app/server/trainer/hermes*.py /opt/scisense/personal/adapters/ && cp /app/server/trainer/codex-model-metadata.json /opt/scisense/personal/adapters/ && cp /opt/scisense/personal/adapters/hermes_personal_payer_worker.py /opt/scisense/personal/adapters/hermes_personal_payer_entry.py && ln -s /app /opt/scisense/current && ln -s /usr/local /opt/scisense/node
# Only HTTPX is mocked. The production Linux tmpfs/UID/empty-HOME guard remains.
COPY scripts/hermes-personal-payer-linux-fixture.py /opt/scisense/personal/adapters/hermes_personal_payer_worker.py
RUN gcc -O2 -Wall -Werror -shared -fPIC /app/server/trainer/worker-lock.c -lseccomp -lrt -o /opt/scisense/personal/adapters/worker-lock.so && cp /app/server/trainer/worker-seccomp.bpf /opt/scisense/personal/adapters/worker-seccomp.bpf && chown scisense:scisense /var/lib/scisense && chmod 700 /var/lib/scisense
RUN printf '[Service]\nExecStart=\nExecStart=/opt/scisense/node/bin/node /app/scripts/hermes-personal-runtime-fixture.mjs /etc/scisense/personal/native-fixture.json\nStandardOutput=journal\n' > /etc/systemd/system/scisense-api.service.d/90-synthetic.conf && sed -i 's/stderr=subprocess.DEVNULL/stderr=None/' /opt/scisense/personal/adapters/hermes_service_guardian.py && sed -i '/raise SystemExit(1)/i\        import traceback; traceback.print_exc()' /opt/scisense/personal/adapters/hermes_service_guardian.py && for role in y w payer; do mkdir -p /etc/systemd/system/scisense-$role@.service.d; printf '[Service]\nStandardError=journal\n' > /etc/systemd/system/scisense-$role@.service.d/90-synthetic.conf; done
ENV container=docker
RUN printf 'synthetic-native-systemd-v1\n' > /etc/scisense/personal/ci-only && chmod 644 /etc/scisense/personal/ci-only && systemctl set-default multi-user.target
STOPSIGNAL SIGRTMIN+3
ENTRYPOINT ["/sbin/init"]
