# Deploy your Bluesky PDS

## Prerequisites

This guide assumes that you already registered a domain name to use with your PDS and created a
[Route53 hosted zone](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/AboutHZWorkingWith.html)
for the domain name in your AWS account.

This guide also assumes you have completed the
[AWS CDK prerequisites](https://docs.aws.amazon.com/cdk/v2/guide/prerequisites.html)
on your local machine, including installing Node.js and installing the AWS CLI.
You must also have [the AWS CDK CLI installed](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html).

## Customize

Fork this GitHub repository.
Replace all references to 'clareliguori' with your own GitHub username in your forked repository.
Replace all references to 'clare.dev' with your own domain name.

The CDK template will deploy to us-east-2 region by default. If you wish to deploy to a different region,
find and replace all references to 'us-east-2'.

Commit and push these changes to your fork on GitHub.

## Create a GitHub token

A GitHub personal access token is needed for ECR to pull the PDS container image from GitHub Container Registry and cache it.

Create a [personal access token](https://github.com/settings/personal-access-tokens/new).
The token should have "Public Repositories (read-only)" access and no account permissions.

Copy the generated token, and create a Secrets Manager secret containing the token:
```bash
aws secretsmanager create-secret \
    --profile default \
    --region us-east-2 \
    --name "ecr-pullthroughcache/bluesky-pds-image-github-token" \
    --description "For access to the public Bluesky PDS image in GitHub Container Registry" \
    --tags Key=project,Value=bluesky-pds \
    --secret-string "{\"username\": \"<your GitHub username>\", \"accessToken\": \"<your token>\"}"
```

## Create an SNS topic

Create an SNS topic for notifications about alarms and pipeline execution failures (configured later on).

```bash
aws sns create-topic \
    --profile default \
    --name bluesky-pds-notifications \
    --tags Key=project,Value=bluesky-pds \
    --region us-east-2
```

You can now subscribe an email address or a
[chat bot](https://docs.aws.amazon.com/chatbot/latest/adminguide/setting-up.html)
to the topic to receive notifications.

## Deploy the PDS

```bash
cd infra/

npm install

npm run build

cdk bootstrap --profile default aws://<aws account id>/us-east-2

cdk synth --profile default -o build --app 'node service.js'

cdk deploy --profile default --app 'node service.js'
```

Your PDS should now be accessible:

```
curl https://example.com/xrpc/_health
```

WebSockets should also work:

```
wsdump "wss://example.com/xrpc/com.atproto.sync.subscribeRepos?cursor=0"
```

# Deploy a CI/CD pipeline (optional)

The CI/CD pipeline can automatically deploy changes to your PDS from your repository on GitHub.

### Deploy the pipeline

```bash
cd pipeline/

npm install

npm run build

cdk synth --profile default -o build --app 'node pipeline.js'

cdk deploy --profile default --app 'node pipeline.js'
```

### Activate the pipeline

Activate the CodeConnections connection created in the deployment.
Go to the [CodeConnections console](https://console.aws.amazon.com/codesuite/settings/connections?region=us-east-2),
select the `bluesky-pds` connection, and click "Update pending connection".
Then follow the prompts to connect your GitHub account and repositories to AWS.
When finished, the `bluesky-pds` connection should have the "Available" status.

Now that the pipeline is connected to GitHub, it can now deploy your PDS automatically.
Go to the pipeline page, and click 'Release change' to start the pipeline flowing.

https://us-east-2.console.aws.amazon.com/codesuite/codepipeline/pipelines/bluesky-pds/view?region=us-east-2

### Set up notifications for pipeline failures

Configure your SNS topic to be able to receive notifications about pipeline failures.
Open `guides/sns-topic-policy.json` and replace `{YOUR_AWS_ACCOUNT_ID}` with your actual AWS account ID.

```bash
aws sns set-topic-attributes \
    --topic-arn arn:aws:sns:us-east-2:{YOUR_AWS_ACCOUNT_ID}:bluesky-pds-notifications \
    --attribute-name Policy \
    --attribute-value file://guides/sns-topic-policy.json \
    --profile default \
    --region us-east-2
```
