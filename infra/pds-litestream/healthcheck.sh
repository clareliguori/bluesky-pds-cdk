#!/usr/bin/env bash

# This script determines if the litestream container is healthy.

# Validate that the container has restored the databases on startup successfully,
# from the S3 bucket to the local directory.
# The file /tmp/restore_success should exist.
if [ ! -f /tmp/restore_success ]; then
  echo "Database restore failed, exiting."
  exit 1
fi

exit 0