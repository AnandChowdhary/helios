#!/bin/bash
# Helios Task Runner Entrypoint
# Clones a repository and executes Claude Code with the provided prompt
#
# For Cloudflare Containers, this script:
# 1. Starts an HTTP server on port 8080 for communication with the Worker
# 2. Writes status updates to /tmp/status.json
# 3. Writes final result to /tmp/result.json
set -euo pipefail

# File paths for HTTP server communication
STATUS_FILE="/tmp/status.json"
RESULT_FILE="/tmp/result.json"
LOG_FILE="/tmp/task.log"

# Initialize status file
echo '{"status":"starting","message":"Task runner initializing"}' > "$STATUS_FILE"

# Start HTTP server in background for Cloudflare Containers communication
echo "Starting HTTP server..."
node /server.mjs &
HTTP_SERVER_PID=$!

# Give server time to start
sleep 1

# Check if server started successfully
if ! kill -0 "$HTTP_SERVER_PID" 2>/dev/null; then
  echo "Failed to start HTTP server"
  exit 1
fi

echo "HTTP server started (PID: $HTTP_SERVER_PID)"

# Cleanup function to stop HTTP server on exit
cleanup() {
  echo "Stopping HTTP server..."
  kill "$HTTP_SERVER_PID" 2>/dev/null || true
  wait "$HTTP_SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Structured logging function - outputs JSON for the Worker to parse
log_event() {
  local type="$1"
  local data="$2"
  local event="{\"type\":\"$type\",\"data\":$data,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
  echo "$event"
  echo "$event" >> "$LOG_FILE"
}

# Update status file and log
update_status() {
  local status="$1"
  local message="$2"
  local json="{\"status\":\"$status\",\"message\":\"$message\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
  echo "$json" > "$STATUS_FILE"
  log_event "status" "{\"status\":\"$status\",\"message\":\"$message\"}"
}

log_error() {
  local code="$1"
  local message="$2"
  log_event "error" "{\"code\":\"$code\",\"message\":\"$message\"}"
}

# Write final result to result file
write_result() {
  local result="$1"
  echo "$result" > "$RESULT_FILE"
}

# Validate required environment variables
validate_env() {
  local missing=()

  [[ -z "${ANTHROPIC_API_KEY:-}" ]] && missing+=("ANTHROPIC_API_KEY")
  [[ -z "${REPO_URL:-}" ]] && missing+=("REPO_URL")
  [[ -z "${PROMPT:-}" ]] && missing+=("PROMPT")

  if [[ ${#missing[@]} -gt 0 ]]; then
    log_error "MISSING_ENV" "Missing required environment variables: ${missing[*]}"
    write_result "{\"success\":false,\"error\":\"Missing required environment variables: ${missing[*]}\"}"
    exit 1
  fi
}

# Configure git with safe defaults
configure_git() {
  git config --global user.name "Helios Bot"
  git config --global user.email "bot@helios.dev"
  git config --global init.defaultBranch main
  git config --global advice.detachedHead false

  # Allow all directories (needed for container security)
  git config --global --add safe.directory '*'
}

# Clone the repository
clone_repository() {
  local repo_url="$REPO_URL"
  local branch="${REPO_BRANCH:-main}"
  local clone_dir="/workspace/repo"

  update_status "cloning" "Cloning repository: $repo_url (branch: $branch)"

  # Add token to URL if provided
  if [[ -n "${GIT_TOKEN:-}" ]]; then
    # Handle different git providers
    repo_url=$(echo "$repo_url" | sed "s|https://|https://${GIT_TOKEN}@|")
  fi

  # Clone with limited depth for faster checkout
  if ! git clone --depth 100 --branch "$branch" "$repo_url" "$clone_dir" 2>&1; then
    log_error "CLONE_FAILED" "Failed to clone repository"
    write_result "{\"success\":false,\"error\":\"Failed to clone repository\"}"
    exit 1
  fi

  cd "$clone_dir"

  # Create a working branch for changes
  local task_branch="helios/task-$(date +%s)"
  git checkout -b "$task_branch"

  update_status "cloned" "Repository cloned successfully on branch: $task_branch"

  echo "$clone_dir"
}

# Run Claude Code with the provided prompt
run_claude() {
  local model="${MODEL:-claude-sonnet-4-5}"
  local max_turns="${MAX_TURNS:-10}"
  local timeout="${TIMEOUT:-300}"

  update_status "running" "Starting Claude Code (model: $model, max_turns: $max_turns)"

  # Build Claude command arguments
  local claude_args=(
    "--dangerously-skip-permissions"
    "--model" "$model"
    "--max-turns" "$max_turns"
    "--output-format" "stream-json"
    "-p" "$PROMPT"
  )

  # Add system prompt if provided
  if [[ -n "${SYSTEM_PROMPT:-}" ]]; then
    claude_args+=("--system-prompt" "$SYSTEM_PROMPT")
  fi

  # Run Claude Code with timeout, streaming output
  local exit_code=0
  timeout "$timeout" claude "${claude_args[@]}" 2>&1 | while IFS= read -r line; do
    # Forward Claude's output
    if echo "$line" | jq -e . >/dev/null 2>&1; then
      # Valid JSON from Claude - forward with wrapper
      local event_type
      event_type=$(echo "$line" | jq -r '.type // "message"')
      log_event "$event_type" "$line"
    else
      # Plain text output - wrap in log event
      local escaped_line
      escaped_line=$(echo "$line" | jq -Rs '.')
      log_event "log" "{\"message\":$escaped_line}"
    fi
  done || exit_code=$?

  if [[ $exit_code -eq 124 ]]; then
    log_error "TIMEOUT" "Task exceeded time limit of ${timeout}s"
    return 124
  fi

  return $exit_code
}

# Collect results after Claude Code execution
collect_results() {
  local success="$1"
  local error_message="${2:-}"

  update_status "collecting" "Collecting task results"

  # Get git diff (if any changes were made)
  local diff=""
  local files_json="[]"
  local commit_count=0

  if git diff --quiet HEAD 2>/dev/null; then
    # No uncommitted changes, check for commits
    diff=$(git diff HEAD~1 2>/dev/null || echo "")
  else
    # There are uncommitted changes
    diff=$(git diff 2>/dev/null || echo "")
  fi

  # Get file change statistics
  if [[ -n "$diff" ]]; then
    files_json=$(git diff --numstat 2>/dev/null | while read -r adds dels file; do
      # Handle binary files (show as 0 changes)
      [[ "$adds" == "-" ]] && adds=0
      [[ "$dels" == "-" ]] && dels=0
      echo "{\"path\":\"$file\",\"additions\":$adds,\"deletions\":$dels}"
    done | jq -s '.' 2>/dev/null || echo "[]")
  fi

  # Count new commits
  commit_count=$(git rev-list --count HEAD ^HEAD~10 2>/dev/null || echo "0")

  # Escape diff for JSON
  local escaped_diff
  escaped_diff=$(echo "$diff" | jq -Rs '.' 2>/dev/null || echo '""')

  # Build result object
  local result
  if [[ "$success" == "true" ]]; then
    result=$(jq -n \
      --argjson success true \
      --arg summary "Task completed successfully" \
      --argjson files "$files_json" \
      --argjson diff "$escaped_diff" \
      --argjson commits "$commit_count" \
      '{
        success: $success,
        summary: $summary,
        filesChanged: $files,
        diff: $diff,
        commits: $commits,
        usage: {inputTokens: 0, outputTokens: 0}
      }')
  else
    result=$(jq -n \
      --argjson success false \
      --arg summary "Task failed" \
      --arg error "$error_message" \
      --argjson files "$files_json" \
      --argjson diff "$escaped_diff" \
      --argjson commits "$commit_count" \
      '{
        success: $success,
        summary: $summary,
        error: $error,
        filesChanged: $files,
        diff: $diff,
        commits: $commits,
        usage: {inputTokens: 0, outputTokens: 0}
      }')
  fi

  log_event "result" "$result"
  write_result "$result"
}

# Main execution flow
main() {
  update_status "starting" "Helios task runner starting"

  # Step 1: Validate environment
  validate_env

  # Step 2: Configure git
  configure_git

  # Step 3: Clone repository (this also changes to the repo directory)
  clone_repository

  # Step 4: Run Claude Code
  local claude_exit=0
  run_claude || claude_exit=$?

  # Step 5: Collect results
  if [[ $claude_exit -eq 0 ]]; then
    collect_results "true"
    update_status "completed" "Task completed successfully"
  else
    collect_results "false" "Claude Code exited with code: $claude_exit"
    update_status "failed" "Task failed with exit code: $claude_exit"
  fi

  # Keep the HTTP server running so Cloudflare can fetch results
  # The container will be stopped by the Worker after fetching results
  # or by sleepAfter timeout in ClaudeRunner
  echo "Task finished, keeping HTTP server running for result retrieval..."

  # Wait indefinitely (container will be stopped externally)
  while true; do
    sleep 60
  done
}

# Run main function
main "$@"
