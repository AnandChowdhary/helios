# Helios Claude Code Runner Container
# This container runs Claude Code tasks in an isolated environment
#
# For Cloudflare Containers, this image:
# 1. Runs an HTTP server on port 8080 for communication with the Worker
# 2. Executes Claude Code tasks with the provided prompt
# 3. Exposes /health, /status, and /result endpoints

FROM node:22-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    curl \
    jq \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code@latest

# Create non-root user for security
RUN useradd -m -s /bin/bash claude \
    && mkdir -p /workspace \
    && chown -R claude:claude /workspace

# Copy entrypoint script and HTTP server
COPY --chown=claude:claude entrypoint.sh /entrypoint.sh
COPY --chown=claude:claude server.mjs /server.mjs
RUN chmod +x /entrypoint.sh

# Switch to non-root user
USER claude
WORKDIR /workspace

# Set environment variables
ENV NODE_ENV=production
ENV HOME=/home/claude
ENV PORT=8080

# Expose HTTP server port for Cloudflare Containers communication
EXPOSE 8080

# Health check via HTTP endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
