# Synthetic Node API rehearsal only. No model downloads, credentials or live requests.
FROM ubuntu:24.04@sha256:a2d43bffc46670d7108bb3c0468c67c5557c4c92e83e1e34cbff1322ad1b94dc
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl xz-utils && rm -rf /var/lib/apt/lists/*
RUN curl -fL https://nodejs.org/dist/v24.11.1/node-v24.11.1-linux-x64.tar.xz -o /tmp/node.tar.xz && echo '60e3b0a8500819514aca603487c254298cd776de0698d3cd08f11dba5b8289a8  /tmp/node.tar.xz' | sha256sum -c - && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 && rm /tmp/node.tar.xz
WORKDIR /app
COPY workers/meal-parser/package.json workers/meal-parser/package-lock.json workers/meal-parser/
RUN npm ci --prefix workers/meal-parser --omit=dev --ignore-scripts --no-audit --no-fund
COPY server server
COPY scripts/phone-lab scripts/phone-lab
COPY workers/meal-parser/src workers/meal-parser/src
COPY workers/meal-parser/test/groq.test.js workers/meal-parser/test/groq.test.js
COPY workers/meal-parser/pilot-proposal.json workers/meal-parser/
USER 10001:10001
ENTRYPOINT ["node","server/groq-linux-check.mjs"]
