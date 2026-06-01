# Codespaces / devcontainer image.
FROM mcr.microsoft.com/devcontainers/javascript-node:24-bookworm

# Keep in sync with the pnpm pin in the project root Dockerfile.
ARG PNPM_VERSION=10.33.4
RUN corepack enable \
 && corepack prepare pnpm@${PNPM_VERSION} --activate

RUN npm install -g opencode-ai
