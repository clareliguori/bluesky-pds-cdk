# bluesky-pds-cdk

This repository contains an AWS CDK template for self-hosting a
[Bluesky Personal Data Server (PDS)](https://atproto.com/guides/self-hosting) on AWS Fargate.

## Architecture

```mermaid
flowchart LR
  A(Bluesky) --> B("PDS load balancer
  #40;ALB#41;")
  B --> C

  subgraph Fargate task
    direction TB
    C("PDS
    container") --- D("Litestream
    container")
  end

  C --> E("Blob store
  S3 bucket")
  D --> F("Database backup
  S3 bucket")
```

## Deploy your PDS

See the [deployment guide](guides/DEPLOY.md) for instructions on how to deploy the Bluesky PDS using this CDK template.
