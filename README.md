# bluesky-pds-cdk
AWS CDK template for hosting a Bluesky Personal Data Server (PDS)

# Create a GitHub token

A GitHub personal access token is needed for ECR to pull the PDS image from GitHub Container Registry and cache it.

Create a [personal access token](https://github.com/settings/personal-access-tokens/new).
The token should have "Public Repositories (read-only)" access and no account permissions.

Copy the generated token, and create a Secrets Manager secret containing the token:
```
aws secretsmanager create-secret \
    --profile default \
    --region us-east-2 \
    --name "ecr-pullthroughcache/bluesky-pds-image-github-token" \
    --description "For access to the public Bluesky PDS image in GitHub Container Registry" \
    --tags Key=project,Value=bluesky-pds \
    --secret-string "{\"username\": \"<your GitHub username>\", \"accessToken\": \"<your token>\"}"
```

## Customize

Replace all references to 'clare.dev' with your own domain name.

This sample assumes that you already registered your domain name and created a
[Route53 hosted zone](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/AboutHZWorkingWith.html)
for the domain name in your AWS account.

## Provision

```
cd infra/

npm install -g aws-cdk

npm install

npm run build

cdk bootstrap --profile default aws://<aws account id>/us-east-2

cdk synth --profile default -o build --app 'node service.js'

cdk deploy --profile default --app 'node service.js'
```