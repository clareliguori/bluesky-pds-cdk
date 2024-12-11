#!/bin/bash
set -o errexit
set -o nounset
set -o pipefail

# This script uses the ECS exec feature to run a command in the PDS container.
# https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html

# Use minimal PDS env file
ADMIN_SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PDS_ENV_FILE="${ADMIN_SCRIPT_DIR}/pds.env"
source "${PDS_ENV_FILE}"

CLUSTER_NAME="$(echo $PDS_HOSTNAME | sed 's/\./-/g')"
SERVICE_NAME=$CLUSTER_NAME

# Find the task ARN for the service.
TASK_ARN="$(aws ecs list-tasks \
  --cluster $CLUSTER_NAME \
  --service-name $SERVICE_NAME \
  --desired-status RUNNING \
  --query 'taskArns[0]' \
  --output text \
  --region us-east-2)"

if [[ -z "${TASK_ARN:-}" ]]; then
  echo "ERROR: task ARN not found"
  exit 1
fi

# Replace process with execute-command
exec aws ecs execute-command \
  --region us-east-2 \
  --cluster $CLUSTER_NAME \
  --task $TASK_ARN \
  --container 'pds' \
  --interactive \
  --command "/bin/bash"
