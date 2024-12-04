# Development guide

This repository contains a Docker Compose file for starting up the PDS container and the sidecar container locally for testing.

Edit `infra/compose-up.sh` and fill in S3 bucket names and a KMS key ID that can be used for testing.
I do not recommend filling in the buckets and key you intend to use for your production PDS server here!

```bash
cd infra/

# Start it up:
./compose-up.sh

# Shut it down
docker compose down -v
```
