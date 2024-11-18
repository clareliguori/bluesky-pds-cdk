#!/usr/bin/env bash

# This script determines if the sync container is healthy.

# Validate that the sync container has synced on startup successfully,
# from the S3 bucket to the local directory.
# The file /tmp/download_success should exist.
if [ ! -f /tmp/download_success ]; then
  echo "Download failed, exiting."
  exit 1
fi

exit 0