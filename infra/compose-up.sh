#!/bin/bash
set -o errexit
set -o nounset
set -o pipefail

GENERATE_SECURE_SECRET_CMD="openssl rand --hex 16"
GENERATE_K256_PRIVATE_KEY_CMD="openssl ecparam --name secp256k1 --genkey --noout --outform DER | tail --bytes=+8 | head --bytes=32 | xxd --plain --cols 32"

export PDS_ADMIN_PASSWORD=$(eval "${GENERATE_SECURE_SECRET_CMD}")
export PDS_JWT_SECRET=$(eval "${GENERATE_SECURE_SECRET_CMD}")

export PDS_PLC_ROTATION_KEY_KMS_KEY_ID="TODO FILL IN"
export PDS_BLOBSTORE_S3_BUCKET="TODO FILL IN"
export PDS_BACKUP_S3_BUCKET="TODO FILL IN"

docker compose down -v

docker compose up --build --force-recreate
