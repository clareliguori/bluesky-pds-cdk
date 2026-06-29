#!/bin/bash
set -o errexit
set -o nounset
set -o pipefail

# This script runs goat CLI admin commands inside the PDS container via ECS Exec.
# The goat binary is included in the upstream PDS container image.
# See: https://github.com/bluesky-social/goat
#
# Usage:
#   ./ops/pdsadmin.sh account create
#   ./ops/pdsadmin.sh account list
#   ./ops/pdsadmin.sh create-invites
#   ./ops/pdsadmin.sh --help
#
# All arguments are passed directly to: goat pds admin <args>

# Use minimal PDS env file
ADMIN_SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PDS_ENV_FILE="${ADMIN_SCRIPT_DIR}/pds.env"
source "${PDS_ENV_FILE}"

CLUSTER_NAME="$(echo $PDS_HOSTNAME | sed 's/\./-/g')"
SERVICE_NAME=$CLUSTER_NAME

# Block the 'update' command - updates are done via Dockerfile tag + CDK redeploy
if [[ "${1:-}" == "update" ]]; then
  echo "ERROR: Cannot run pdsadmin update"
  echo "ERROR: To update PDS, update the Docker image tag in infra/pds/Dockerfile, and re-deploy the CDK template"
  exit 1
fi

# Find the task ARN for the service
TASK_ARN="$(aws ecs list-tasks \
  --cluster "$CLUSTER_NAME" \
  --service-name "$SERVICE_NAME" \
  --desired-status RUNNING \
  --query 'taskArns[0]' \
  --output text \
  --region us-east-2)"

if [[ -z "${TASK_ARN:-}" || "${TASK_ARN}" == "None" ]]; then
  echo "ERROR: No running PDS task found. Is the service running?"
  exit 1
fi

# Run goat pds admin command inside the PDS container via ECS Exec.
# PDS_ADMIN_PASSWORD is already set in the container's environment,
# so goat can authenticate without passing credentials explicitly.
exec aws ecs execute-command \
  --region us-east-2 \
  --cluster "$CLUSTER_NAME" \
  --task "$TASK_ARN" \
  --container 'pds' \
  --interactive \
  --command "goat pds admin $*"
