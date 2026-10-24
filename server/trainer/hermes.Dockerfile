# Synthetic Linux acceptance. Public pinned dependencies at build time only.
FROM ubuntu:24.04@sha256:a2d43bffc46670d7108bb3c0468c67c5557c4c92e83e1e34cbff1322ad1b94dc
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl git xz-utils python3 bubblewrap gcc libc6-dev libseccomp-dev && rm -rf /var/lib/apt/lists/*
RUN curl -fL https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-x64.tar.xz -o /tmp/node.tar.xz && echo '6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6  /tmp/node.tar.xz' | sha256sum -c - && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 && rm /tmp/node.tar.xz
RUN curl -fL https://github.com/astral-sh/uv/releases/download/0.10.12/uv-x86_64-unknown-linux-gnu.tar.gz -o /tmp/uv.tar.gz && echo 'ec72570c9d1f33021aa80b176d7baba390de2cfeb1abcbefca346d563bf17484  /tmp/uv.tar.gz' | sha256sum -c - && tar -xf /tmp/uv.tar.gz -C /usr/local/bin --strip-components=1 && rm /tmp/uv.tar.gz
ENV UV_PYTHON_INSTALL_DIR=/opt/scisense/python
WORKDIR /app
COPY server/trainer/hermes-pin.json server/trainer/hermes-pin.json
COPY scripts/hermes-source-prepare.py scripts/hermes-source-prepare.py
RUN python3 scripts/hermes-source-prepare.py
RUN uv python install 3.14.6 && uv sync --project .agents/runtime/hermes-lab/source --python 3.14.6 --frozen --no-dev --extra anthropic --extra messaging && uv cache clean
COPY server/trainer/food-data*.mjs server/trainer/food-data-manifest.json server/trainer/
COPY scripts/food-data-import.mjs scripts/hermes-food-prepare.mjs scripts/
RUN node scripts/hermes-food-prepare.mjs && rm .agents/runtime/food-data/*.zip
COPY workers/meal-parser/package.json workers/meal-parser/package-lock.json workers/meal-parser/
RUN npm ci --prefix workers/meal-parser --omit=dev --ignore-scripts --no-audit --no-fund
COPY package.json package.json
COPY server server
RUN gcc -O2 -Wall -Werror server/trainer/worker-seccomp.c -lseccomp -o /tmp/seccomp-policy && /tmp/seccomp-policy > server/trainer/worker-seccomp.bpf && rm /tmp/seccomp-policy
COPY src/services src/services
COPY src/data src/data
COPY scripts/hermes-gateway-test.mjs scripts/hermes-gateway-test.mjs
COPY scripts/phone-lab scripts/phone-lab
COPY workers/meal-parser/src workers/meal-parser/src
RUN chown -R 10001:10001 .agents/runtime/hermes-lab && chmod 700 .agents/runtime/hermes-lab
USER 10001:10001
ENTRYPOINT ["node","scripts/hermes-gateway-test.mjs"]
