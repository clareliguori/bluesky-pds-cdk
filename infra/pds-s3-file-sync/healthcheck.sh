#!/usr/bin/env bash

# This script determines if the s3-file-sync container is healthy.

# Validate that the container has restored the files on startup successfully,
# from the S3 bucket to the local directory.
# The file /tmp/restore_success should exist.
if [ ! -f /tmp/restore_success ]; then
  echo "File restore failed, exiting."
  exit 1
fi

# Validate that the container can backup the files successfully,
# from the local directory to the S3 bucket.
# The file /tmp/replicate_success should exist.
if [ ! -f /tmp/replicate_success ]; then
  echo "File replication failed, exiting."
  exit 1
fi

exit 0