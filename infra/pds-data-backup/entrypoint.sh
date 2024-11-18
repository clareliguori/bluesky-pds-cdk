#!/usr/bin/env bash

# This script syncs PDS on-disk data to an S3 bucket, such as sqlite files.
# When the container starts, the script will sync from the S3 bucket to the local directory
# to initialize its local data.
# Then, every 15 minutes, it will sync any changes from the local directory to the S3 bucket.
# On shutdown (SIGTERM), the container will sync from the local directory to the S3 bucket one last time.

# This script was originally based on vladgh/s3sync
# https://github.com/vladgh/docker_base_images/tree/main/s3sync

# Required environment variables:
# AWS_DEFAULT_REGION: the region of the S3 bucket
# S3_PATH: the S3 bucket path, such as s3://bucket/path/to/data
# LOCAL_PATH: the local directory to sync, such as /sync

# Bash strict mode
set -euo pipefail
IFS=$'\n\t'

# Every 15 minutes
CRON_TIME="*/15 * * * *"

# Log message
log(){
  echo "[$(date "+%Y-%m-%dT%H:%M:%S%z") - $(hostname)] ${*}"
}

# Sync files
sync_files(){
  local src dst sync_cmd
  src="${1:-}"
  dst="${2:-}"

  sync_cmd="--no-progress --delete --exact-timestamps";

  log "Sync '${src}' to '${dst}'"
  if ! eval aws s3 sync "$sync_cmd" "$src" "$dst"; then
    log "Could not sync '${src}' to '${dst}'" >&2; exit 1
  fi
}

# Download files
download_files(){
  sync_files "$S3_PATH" "$LOCAL_PATH"
  touch /tmp/download_success
}

# Upload files
upload_files(){
  sync_files "$LOCAL_PATH" "$S3_PATH"
  touch /tmp/upload_success
}

# Run initial download
initial_download(){
  if [[ -d "$LOCAL_PATH" ]]; then
    # directory exists
    if [[ $(ls -A "$LOCAL_PATH" 2>/dev/null) ]]; then
      # directory is not empty
      log "${LOCAL_PATH} is not empty; cannot do initial download"; exit 1
    else
      # directory exists and is empty
      download_files
    fi
  else
    # directory does not exist
    log "${LOCAL_PATH} does not exist; cannot do initial download"; exit 1
  fi
}

# Install cron job that periodically syncs to S3
run_upload_cron(){
  # Download initial data
  initial_download

  log "Setup the cron job (${CRON_TIME})"
  echo "${CRON_TIME} /entrypoint.sh upload" > /etc/crontabs/root
  crond -f -l 6
}

# Main function
main(){
  if [[ ! "$S3_PATH" =~ s3:// ]]; then
    log 'No S3_PATH specified' >&2; exit 1
  fi

  # Parse command line arguments
  cmd="${1:-periodic_upload}"
  case "$cmd" in
    upload)
      upload_files
      ;;
    periodic_upload)
      run_upload_cron
      ;;
    *)
      log "Unknown command: ${cmd}"; exit 1
      ;;
  esac
}

# Sigterm Handler
# See https://aws.amazon.com/blogs/containers/graceful-shutdowns-with-ecs/
graceful_shutdown_handler() {
  log "Received SIGTERM, gracefully shutting down"

  # The initial data was downloaded successfully,
  # so we can safely upload any changes to the bucket
  if [ -f /tmp/download_success ]; then
    upload_files
  fi
  exit 143; # 128 + 15 -- SIGTERM
}

trap 'graceful_shutdown_handler' SIGTERM

trap "log 'Received SIGINT'" SIGINT
trap "log 'Received SIGKILL'" SIGKILL
trap "log 'Received SIGQUIT'" SIGQUIT

main "$@"
