# Cost of self-hosting

This is a rough and likely incorrect estimate of the costs associated with
self-hosting a PDS using this AWS CDK template. All prices are public
pricing as of Dec 4, 2024 in us-east-2, extrapolated to an average month
of 720 hours.

This architecture is certainly not the lowest-cost option for self-hosting a Bluesky PDS.
The architecture was designed with resiliency, observability, and security in mind,
as well as being completely serverless and containerized.
An alternative solution could be
[Amazon Lightsail](https://aws.amazon.com/lightsail/),
which offers a 2 vCPU + 2 GB memory instance for $12 / month
(compared to ~$72 / month for this architecture).
To self-host a PDS on a Lightsail instance, use the
[official PDS installer](https://github.com/bluesky-social/pds)
from Bluesky.
I also provide a cost comparison to Lightsail Containers at the end of this document.

*Note on free tier:*

This estimate assumes you have virtually nothing else in your AWS account,
so that the full 'always free' tier applies to this application.
This estimate also assumes that your AWS account is more than one year old,
such that 'free trials' and '12 months free' offerings no longer apply.
See https://aws.amazon.com/free/.

| Resource | Monthly Cost | Notes |
|----------|--------------|-------|
| Fargate vCPU Hours (1 vCPU) | $29.15 |  |
| Fargate Memory Hours (2 GB) | $6.40 |  |
| EC2 Application Load Balancer | $16.20 |  |
| EC2 ALB Capacity Units | Variable | 1 LCU = $5.76 |
| VPC Public IPv4 Addresses (3) | $10.80 | $3.60 per address |
| KMS Customer-Managed Keys (1) | $1.00 |  |
| KMS Symmetric API Requests | $0.00 | Free tier: 20k requests |
| KMS Asymmetric API Requests | <$0.15 | $0.15 per 10,000 requests (GetPublicKey, Sign) |
| Secrets Manager Secrets (3) | $1.20 | $0.40 per secret |
| Secrets Manager API Requests | <$0.05 | $0.05 per 10,000 API calls |
| Route 53 Hosted Zone | $0.50 | |
| Data Transfer from AWS to Internet | $0 | Free tier: 100 GB |
| S3 Storage | Variable | $0.023 per GB |
| S3 API Put Requests | Variable | $0.005 per 1,000 PUT, COPY, POST, LIST requests |
| S3 API Get Requests | Variable | $0.0004 per 1,000 GET, SELECT, and all other requests |
| SES Outbound Email | <$0.01 | $0.10/1000 emails |
| ACM TLS Certificate | $0.00 | |
| ECR Storage | $0.00 | Free tier: 50 GB |
| SNS API Requests | $0.00 | Free tier: 1 million requests |
| SNS Notification Deliveries (HTTP) | $0.00 | Free tier: 100k notifications |
| CloudWatch Logs Storage | $0.00 | Free tier: 5 GB |
| CloudWatch Logs Ingestion | $0.00 | Free tier: 5 GB |
| CloudWatch Alarms (4) | $0.00 | Free tier: 10 alarms |

**Known costs: $65.45 per month**

Unknown, variable costs (depends on traffic patterns):
* EC2 ALB Capacity Units: assume max 1 LCU ($5.76 / month)
* S3 storage and requests: assume 10 GB stored ($0.23), 10k PUT requests ($0.05), 100k GET requests ($0.04)
Assume an additional **$6.08 of variable costs per month**.

If the Data Transfer free tier runs out, the cost is $0.09 per GB.
For example, if a post with a 300 KB image becomes very popular and is loaded 5MM times,
that would cost an additional **$119.75** in data transfer charges
for an overage of 1330.5 GB.

### CI/CD pipeline costs

As long as your CI/CD pipeline runs relatively infrequently (a couple times a week?),
your costs will be negligible.

| Resource | Monthly Cost | Notes |
|----------|--------------|-------|
| CodePipeline Pipeline | $0 | Free tier: 1 pipeline |
| CodeBuild Build Minutes (Linux:g1.small) | $0 | Free tier: 100.0 minutes |
| S3 Storage | Variable | $0.023 per GB |
| S3 API Put Requests | Variable | $0.005 per 1,000 PUT, COPY, POST, LIST requests |
| S3 API Get Requests | Variable | $0.0004 per 1,000 GET, SELECT, and all other requests |

### AWS CDK costs

The AWS CDK creates some resources that will show up on your AWS bill.
For example, it may create and invoke Lambda functions for any custom
CloudFormation resources used by the template.
However, these should all fall under the free tier.

| Resource | Monthly Cost | Notes |
|----------|--------------|-------|
| CloudFormation Handler Operations | $0.00 | Free tier: 1k operations |
| Lambda Requests | $0.00 | Free tier: 1 million requests |
| Lambda Invocations (GB Seconds) | $0.00 | Free tier: 400k seconds |
| Systems Manager Parameter | $0.00 | |

### Comparison to Lightsail Containers

The Lightsail Containers "Medium" plan is the minimum needed to run a PDS,
and costs $40 / month. It includes logs (three days), load balancing, DNS management,
TLS certificates, and a data transfer quota of 500 GB per month.

This is a rough sketch of how the costs would change:

| Resource | Monthly Cost | Notes |
|----------|--------------|-------|
| Lightsail Containers Medium | $40 | |
| KMS Customer-Managed Keys (1) | $1.00 |  |
| KMS Symmetric API Requests | $0.00 | Free tier: 20k requests |
| KMS Asymmetric API Requests | $0.15 | $0.15 per 10,000 requests (GetPublicKey, Sign) |
| Secrets Manager Secrets (3) | $1.20 | $0.40 per secret |
| Secrets Manager API Requests | $0.05 | $0.05 per 10,000 API calls |
| Data Transfer from AWS to Internet | $0 | Free tier: 500 GB |
| S3 Storage | Variable | $0.023 per GB |
| S3 API Put Requests | Variable | $0.005 per 1,000 PUT, COPY, POST, LIST requests |
| S3 API Get Requests | Variable | $0.0004 per 1,000 GET, SELECT, and all other requests |
| SES Outbound Email | <$0.01 | $0.10/1000 emails |
| ECR Storage | $0.00 | Free tier: 50 GB |
| SNS API Requests | $0.00 | Free tier: 1 million requests |
| SNS Notification Deliveries (HTTP) | $0.00 | Free tier: 100k notifications |
| CloudWatch Logs Storage | $0.00 | Free tier: 5 GB |
| CloudWatch Logs Ingestion | $0.00 | Free tier: 5 GB |
| CloudWatch Alarms (4) | $0.00 | Free tier: 10 alarms |

The **known costs become $42.40 per month**.

The only variable costs compared to above are S3 (assumed to be $0.32).
Lightsail does offer Object storage bundled pricing for S3 buckets created
through Lightsail. However, the lowest offering is $1 / month, and I
expect typical S3 use to be lower than that.

For the example above of a popular image impacting data transfer costs,
it would cost an additional $83.75 for an overage of 930.50 GB.

While this option is significantly cheaper (~$43 vs ~$72),
there are some blockers for running a PDS and some drawbacks for a production system:
* Cannot exec commands within a container, which can hinder troubleshooting.
* Volume mounts are not supported, so the Litestream continuous replication must run
in the same container as the PDS (an anti-pattern in containers).
* Short-lived credentials from an IAM role are not supported for accessing other AWS services,
such as KMS for the PDS PLC rotation key.
Many Lightsail customers who need to access non-Lightsail services from their Lightsail
container bake long-term AWS credentials into their Docker image (an anti-pattern for security).
* Secret environment variables such as the PDS admin password are not supported.
Secret values must be provided to Lightsail in plaintext (an anti-pattern for security).
* Monitoring is limited: Alarms and notifications are currently not
supported for Lightsail container service metrics.
