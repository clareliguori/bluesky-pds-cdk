#!/usr/bin/env bash

# This script continuously syncs PDS' main SQLite databases to an S3 bucket, using Litestream.
# When the container starts, the script will sync from the S3 bucket to the local directory
# to restore the databases on disk.
# Then, Litestream will continuously sync database changes from the local directory to the S3 bucket.
# On shutdown (SIGTERM), Litestream syncs from the local directory to the S3 bucket one last time.

# Required environment variables:
# AWS_DEFAULT_REGION: the region of the S3 bucket
# S3_PATH: the S3 bucket path, such as s3://bucket/path/to/data
# LOCAL_PATH: the local directory to sync, such as /sync

# Bash strict mode
set -euo pipefail
IFS=$'\n\t'

# Log message
log(){
  echo "[$(date "+%Y-%m-%dT%H:%M:%S%z") - $(hostname)] ${*}"
}

# Restore from S3
function restore() {
    local db="$1"

    # Check if DB is provided
    if [ -z "$db" ]; then
        echo "Error: DB argument is required"
        exit 1
    fi

   log "Restore $db"
   # The restore command will fail if the file is already on disk,
   # but will succeed if there is no backup found on S3
   if ! eval litestream restore -if-replica-exists "$LOCAL_PATH"/"$db"; then
     log "Could not restore $db" >&2; exit 1
   fi
}

# Restore from S3 on startup
restore_all_dbs(){
  rm -f /tmp/restore_success
  # TODO figure out a good way to keep this list in sync with config file
  restore account.sqlite
  restore did_cache.sqlite
  restore sequencer.sqlite
  restore actors.sqlite
  touch /tmp/restore_success
}

# Start litestream replication
replicate_all_dbs(){
  log "Start litestream replication"
  # Replace this process with litestream replicate process.
  # Litestream will handle graceful shutdown of replication.
  exec litestream replicate
}

# Main function
main(){
  if [[ ! "$S3_PATH" =~ s3:// ]]; then
    log 'No S3_PATH specified' >&2; exit 1
  fi
  if [[ ! "$LOCAL_PATH" =~ / ]]; then
    log 'No LOCAL_PATH specified' >&2; exit 1
  fi

  log "Litestream configuration"
  litestream databases

  restore_all_dbs

  replicate_all_dbs
}

main
