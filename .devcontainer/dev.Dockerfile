FROM mcr.microsoft.com/devcontainers/typescript-node:latest

RUN sudo apt-get update && sudo apt-get install -y \
    lsb-release \
    gnupg \
    curl \
    apt-transport-https \
    ca-certificates

# gcloud
RUN echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
    | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list && \
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg \
    | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg && \
    sudo apt-get update && \
    sudo apt-get install -y google-cloud-cli && \
    gcloud version

# Docker outside of Docker
RUN curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian \
        $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && sudo apt-get update \
    && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

CMD [ "sleep", "infinity" ]
