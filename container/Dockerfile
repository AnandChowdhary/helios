# Helios Claude Code Runner Container
# This container runs Claude Code tasks in an isolated environment

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
# Note: Using npm install instead of npm install -g to avoid permission issues
RUN npm install -g @anthropic-ai/claude-code@latest

# Create non-root user for security
RUN useradd -m -s /bin/bash claude \
    && mkdir -p /workspace \
    && chown -R claude:claude /workspace

# Copy entrypoint script
COPY --chown=claude:claude entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Switch to non-root user
USER claude
WORKDIR /workspace

# Set environment variables
ENV NODE_ENV=production
ENV HOME=/home/claude

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node --version || exit 1

ENTRYPOINT ["/entrypoint.sh"]
