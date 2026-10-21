# Test/build image only. No daemon, production host, or real credentials.
FROM ubuntu:24.04@sha256:a2d43bffc46670d7108bb3c0468c67c5557c4c92e83e1e34cbff1322ad1b94dc
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl git cmake g++ make xz-utils espeak-ng systemd python3 && rm -rf /var/lib/apt/lists/*
RUN curl -fL --retry 2 https://nodejs.org/dist/v24.11.1/node-v24.11.1-linux-x64.tar.xz -o /tmp/node.tar.xz && echo '60e3b0a8500819514aca603487c254298cd776de0698d3cd08f11dba5b8289a8  /tmp/node.tar.xz' | sha256sum -c - && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 && rm /tmp/node.tar.xz
RUN git init /whisper && git -C /whisper remote add origin https://github.com/ggml-org/whisper.cpp.git && git -C /whisper fetch --depth=1 origin d1be6fde11ac6e0407606b4e42fe72d34add8037 && git -C /whisper checkout --detach FETCH_HEAD && test "$(git -C /whisper rev-parse HEAD)" = d1be6fde11ac6e0407606b4e42fe72d34add8037 && cmake -S /whisper -B /whisper/build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DWHISPER_BUILD_TESTS=OFF && cmake --build /whisper/build --target whisper-cli --parallel 2
RUN curl -fL --retry 2 https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin -o /whisper/model.bin && echo '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2  /whisper/model.bin' | sha256sum -c -
WORKDIR /app
COPY scripts/phone-lab/whisper.mjs scripts/phone-lab/whisper.mjs
COPY server/linux server/linux
RUN dpkg-query -W > /app/packages.txt
USER 10001:10001
ENTRYPOINT ["node","server/linux/benchmark.mjs"]
