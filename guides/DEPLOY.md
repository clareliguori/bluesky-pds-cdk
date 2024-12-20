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
Replace all references to 'exampleuser' with your own GitHub username in your forked repository.
Replace all references to 'example.com' with your own domain name.

The CDK template will deploy to us-east-2 region by default. If you wish to deploy to a different region,
find and replace all references to 'us-east-2'.

Commit and push these changes to your fork on GitHub.

## Create an SNS topic

Create an SNS topic for notifications about alarms.

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

By default, the template will deploy in a test mode, where all data is cleaned up
from the account (S3 objects, CloudWatch logs, etc) when the CloudFormation stack is
deleted. In the production mode, data is retained in the account if the CloudFormation
stack is accidentally deleted or if certain resources are accidentally replaced in
the stack. If you are ready to deploy in production mode, edit `infra/service.ts`,
and replace `mode: Mode.TEST` with `mode: Mode.PROD`.

```bash
cd infra/

npm install

npm run build

cdk bootstrap --profile default aws://<aws account id>/us-east-2

cdk synth --profile default -o build --app 'node service.js'

cdk deploy --profile default --app 'node service.js'
```

Your PDS should now be accessible:

```bash
curl https://pds.reinvent-trivia.com/xrpc/_health
```

WebSockets should also work:

```bash
wsdump "wss://pds.reinvent-trivia.com/xrpc/com.atproto.sync.subscribeRepos?cursor=0"
```

And the pdsadmin command should work:

```bash
./ops/pdsadmin.sh account list
```

NOTE: This template requires the customized version of pdsadmin found in this repository.
The pdsadmin script from the main [Bluesky PDS repository](https://github.com/bluesky-social/pds) will not work.

You can now create an account on your PDS (see [OPERATIONS.md](OPERATIONS.md) for instructions).

## Keep track of costs

A 'project' tag is attached to every resource created by this template,
with the value 'bluesky-pds' ('bluesky-pds-pipeline' for the CI/CD pipeline resources).
Activate the project tag in the Billing console to keep track of costs
incurred by your self-hosted PDS.

On the Billing console, select "project" in the table and click "Activate".

https://us-east-1.console.aws.amazon.com/costmanagement/home?region=us-east-1#/tags

## Deploy a CI/CD pipeline (optional)

The CI/CD pipeline can automatically deploy changes to your PDS from your repository on GitHub.

### Create a test handle

The CI/CD pipeline will run integration tests using a test handle registered on the PDS.
Create a test account on your PDS using the instructions in [OPERATIONS.md](OPERATIONS.md).

```
aws secretsmanager create-secret \
    --region us-east-2 \
    --name PdsCredentials \
    --secret-string "{\"HANDLE\": \"<your test handle>\", \"PASSWORD\": \"<your test account password>\"}"
```

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
