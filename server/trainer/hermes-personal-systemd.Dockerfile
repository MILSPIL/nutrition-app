# Disposable systemd VM container. No host mounts, provider network or keys.
FROM ubuntu:24.04@sha256:a2d43bffc46670d7108bb3c0468c67c5557c4c92e83e1e34cbff1322ad1b94dc
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends systemd systemd-sysv dbus python3 bubblewrap gcc libc6-dev libseccomp-dev ca-certificates curl xz-utils && rm -rf /var/lib/apt/lists/*
RUN curl -fL https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-x64.tar.xz -o /tmp/node.tar.xz && echo '6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6  /tmp/node.tar.xz' | sha256sum -c - && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 && rm /tmp/node.tar.xz
RUN groupadd --gid 10001 scisense && groupadd --gid 10005 scisense-broker && useradd --uid 10001 --gid scisense --groups scisense-broker --no-create-home --shell /usr/sbin/nologin scisense && useradd --uid 10002 --user-group --groups scisense --no-create-home --shell /usr/sbin/nologin scisense-y && useradd --uid 10003 --user-group --groups scisense --no-create-home --shell /usr/sbin/nologin scisense-w && useradd --uid 10004 --user-group --groups scisense --no-create-home --shell /usr/sbin/nologin scisense-payer
WORKDIR /app
COPY server/trainer /app/server/trainer
COPY scripts/hermes-personal-systemd-client.mjs scripts/hermes-personal-systemd-ci.py /app/scripts/
COPY deploy/personal /etc/systemd/system/
RUN mkdir -p /opt/scisense/personal/adapters /opt/scisense/native-dummy/.venv/bin /etc/scisense/personal /var/lib/scisense /etc/systemd/system/scisense-api.service.d && cp /app/server/trainer/hermes*.py /opt/scisense/personal/adapters/ && cp /app/server/trainer/hermes-personal-systemd-canary.py /opt/scisense/personal/adapters/hermes_personal_worker.py && cp /app/server/trainer/hermes-personal-systemd-canary.py /opt/scisense/personal/adapters/hermes_personal_payer_worker.py && ln -s /usr/bin/python3 /opt/scisense/native-dummy/.venv/bin/python && ln -s /app /opt/scisense/current && ln -s /usr/local /opt/scisense/node
RUN gcc -O2 -Wall -Werror /app/server/trainer/worker-seccomp.c -lseccomp -o /tmp/policy && /tmp/policy > /opt/scisense/personal/adapters/worker-seccomp.bpf && gcc -O2 -Wall -Werror -shared -fPIC /app/server/trainer/worker-lock.c -lseccomp -lrt -o /opt/scisense/personal/adapters/worker-lock.so && rm /tmp/policy
RUN chown scisense:scisense /var/lib/scisense && chmod 700 /var/lib/scisense && printf '[Service]\nExecStart=\nExecStart=/opt/scisense/node/bin/node /app/scripts/hermes-personal-systemd-client.mjs\n' > /etc/systemd/system/scisense-api.service.d/90-synthetic.conf && systemctl set-default multi-user.target
ENV container=docker
STOPSIGNAL SIGRTMIN+3
ENTRYPOINT ["/sbin/init"]
