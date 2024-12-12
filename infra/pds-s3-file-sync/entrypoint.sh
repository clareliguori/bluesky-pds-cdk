#!/usr/bin/env bash

# This script periodically syncs PDS on-disk files to an S3 bucket, using the AWS CLI.
# When the container starts, the script will sync from the S3 bucket to the local directory
# to restore the files on disk.
# Then, a cronjob will periodically sync file changes from the local directory to the S3 bucket.
# On shutdown (SIGTERM), the container will sync from the local directory to the S3 bucket one last time.

# Required environment variables:
# AWS_DEFAULT_REGION: the region of the S3 bucket
# S3_PATH: the S3 bucket path, such as s3://bucket/path/to/data
# LOCAL_PATH: the local directory to sync, such as /sync

# Bash strict mode
set -euo pipefail
IFS=$'\n\t'

# Every 5 minutes
CRON_TIME="*/5 * * * *"

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
    log "Could not sync '${src}' to '${dst}'" >&2; return 1
  fi
  return 0
}

# Restore from S3
function restore() {
  log "Restore files to disk"
  rm -f /tmp/restore_success
  if [[ -d "$LOCAL_PATH" ]]; then
    # directory exists
    log "${LOCAL_PATH} already exists; cannot do initial download"; exit 1
  else
    # directory does not exist, create it
    mkdir -p "$LOCAL_PATH"
    if ! sync_files "$S3_PATH" "$LOCAL_PATH"; then
      exit 1
    fi
  fi
  touch /tmp/restore_success
}

function replicate(){
  log "Replicate files to S3"
  if ! sync_files "$LOCAL_PATH" "$S3_PATH"; then
      rm -f /tmp/replicate_success
      exit 1
  fi
  touch /tmp/replicate_success
}

function start_periodic_replication(){
  # Do an initial restore and replicate
  restore
  replicate

  log "Start periodic replication"
  log "Setup the cron job (${CRON_TIME})"
  echo "${CRON_TIME} /entrypoint.sh replicate" > /etc/crontabs/root
  crond -f -l 6
}

# Main function
main(){
  if [[ ! "$S3_PATH" =~ s3:// ]]; then
    log 'No S3_PATH specified' >&2; exit 1
  fi
  if [[ ! "$LOCAL_PATH" =~ / ]]; then
    log 'No LOCAL_PATH specified' >&2; exit 1
  fi

  # Parse command line arguments
  cmd="${1:-periodic_replicate}"
  case "$cmd" in
    replicate)
      replicate
      ;;
    periodic_replicate)
      start_periodic_replication
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
  # one last time.
  if [ -f /tmp/restore_success ]; then
    replicate
  fi
  exit 143; # 128 + 15 -- SIGTERM
}

trap 'graceful_shutdown_handler' SIGTERM

trap "log 'Received SIGINT'" SIGINT
trap "log 'Received SIGKILL'" SIGKILL
trap "log 'Received SIGQUIT'" SIGQUIT

main "$@"
