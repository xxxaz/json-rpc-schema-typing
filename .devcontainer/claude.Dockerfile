FROM debian:13

RUN apt-get update && apt-get install -y \
    lsb-release \
    gnupg \
    curl \
    apt-transport-https \
    ca-certificates

# Claude Code
RUN curl -fsSL https://claude.ai/install.sh | bash

CMD [ "sleep", "infinity" ]
