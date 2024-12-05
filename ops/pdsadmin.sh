#!/bin/bash
set -o errexit
set -o nounset
set -o pipefail

# This is a wrapper around the official pdsadmin.sh script
# which first pulls the PDS admin password from Secrets Manager.

ORIGINAL_PDSADMIN_URL="https://raw.githubusercontent.com/bluesky-social/pds/refs/heads/main/pdsadmin.sh"

# Command to run.
COMMAND="${1:-help}"
shift || true

# Ensure the user is root, since it's required for most commands.
if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: This script must be run as root"
  exit 1
fi

# Download the script, if it exists.
SCRIPT_URL="${PDSADMIN_BASE_URL}/${COMMAND}.sh"
SCRIPT_FILE="$(mktemp /tmp/pdsadmin.${COMMAND}.XXXXXX)"

if ! curl --fail --silent --show-error --location --output "${SCRIPT_FILE}" "${SCRIPT_URL}"; then
  echo "ERROR: ${COMMAND} not found"
  exit 2
fi

chmod +x "${SCRIPT_FILE}"
if "${SCRIPT_FILE}" "$@"; then
  rm --force "${SCRIPT_FILE}"
fi