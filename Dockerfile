FROM docker.io/cloudflare/sandbox:0.7.6

ENV PATH="/root/.opencode/bin:${PATH}"
ENV PLAYWRIGHT_CHROMIUM_SANDBOX=false

RUN curl -fsSL https://opencode.ai/install -o /tmp/install-opencode.sh \
    && bash /tmp/install-opencode.sh \
    && rm /tmp/install-opencode.sh \
    && opencode --version

RUN git config --global user.email "agent@replo.app" \
    && git config --global user.name "Replo Agent" \
    && git config --global init.defaultBranch main

RUN apt-get update && apt-get install -y --no-install-recommends tini rsync \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://rclone.org/install.sh | bash

RUN npm install -g @playwright/mcp @braintrust/trace-opencode

RUN npx playwright install chrome --with-deps

RUN mkdir -p /workspace
RUN printf 'node_modules/\n.next/\n' > /workspace/.gitignore

RUN rm -rf /root/.config/opencode \
    && rm -rf /tmp/* \
    && rm -rf /root/.npm/_cacache

WORKDIR /workspace

EXPOSE 4096
EXPOSE 8734
EXPOSE 3000

RUN printf '#!/bin/bash\nexec /container-server/sandbox "$@"\n' > /entrypoint.sh \
    && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
