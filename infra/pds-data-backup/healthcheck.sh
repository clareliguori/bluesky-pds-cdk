#!/usr/bin/env bash

# This script determines if the sync container is healthy.

# Validate that the sync container has synced on startup successfully,
# from the S3 bucket to the local directory.
# The file /tmp/restore_success should exist.
if [ ! -f /tmp/restore_success ]; then
  echo "Database restore failed, exiting."
  exit 1
fi

exit 0