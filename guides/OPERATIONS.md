# Operate your Bluesky PDS

Below are some instructions specific to how to operate your self-hosted Bluesky PDS
after deploying it with this template.
Also review the [Readme](https://github.com/bluesky-social/pds/blob/main/README.md)
on the official Bluesky PDS repo for additional guidance.
The [AT Protocol PDS Admins Discord](https://discord.gg/e7hpHxRfBP) is another resource
for self-hosting guidance and important updates about the PDS distribution.

## Keep your PDS up to date

It is important to keep your PDS up to date with the latest PDS version.
Breaking changes can occur in the AT Protocol, which can break communication
between Bluesky and an out-of-date PDS.

Check for the latest version of PDS:

https://github.com/bluesky-social/pds/pkgs/container/pds

Edit `infra/pds/Dockerfile` and update the PDS image tag.
Then, re-build and re-deploy the CDK template.

To automate this process, enable
[Dependabot](https://docs.github.com/en/code-security/getting-started/dependabot-quickstart-guide)
to keep the PDS image tag up to date,
and let a CI/CD pipeline re-build and re-deploy the CDK template.

### PDS assumptions that could change

I have made several assumptions about PDS behavior in this template.
That behavior could change in the future with newer versions, so it's
important to check release notes for any major changes to behavior.

This template assumes that PDS writes data to these files and directories,
and only backs these up. Data loss will occur if a newer version of PDS
writes data to additional locations:
* `account.sqlite`
* `did_cache.sqlite`
* `sequencer.sqlite`
* `actors.sqlite`
* `actors/`

This template also assumes that these are the only paths that must be served
by the PDS. Federation may break if a newer version of PDS requires additional
paths to be served:
* `/xrpc/*`
* `/.well-known/*`
* `/oauth/*`
* `/@atproto/*`
* `/tls-check`

## Monitoring and troubleshooting

Logs can be viewed in the ECS console:

https://us-east-2.console.aws.amazon.com/ecs/v2/clusters/pds-example-com/services/pds-example-com/logs?region=us-east-2

### Remotely connect to your PDS

You can open a remote Bash shell into your PDS container, using the
[Amazon ECS Exec](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html)
feature. This shell is useful for troubleshooting and poking around in the PDS container.
Be careful to not make any changes to the PDS container, and use only read-only commands.

```bash
./ops/pdsshell.sh
```

In addition to having the AWS CLI installed, you must also install the
[Session Manager plugin for the AWS CLI](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)
before using the pdsshell script.

## Create an account

Note that each self-hosted PDS is limited to 10 accounts by the Bluesky Relay.

Before creating an account, you must pre-verify the account's email address with SES.
All AWS accounts are initially placed in the
[SES sandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html),
and can only send email to verified email addresses.

For each account email address, create an email address identity in SES.
```bash
aws sesv2 create-email-identity \
    --email-identity your-accounts-email-address@domain.com \
    --region us-east-2 \
    --profile default
```
That email address will receive an email with a subject line containing
"Amazon Web Services – Email Address Verification Request".
Click on the email verification link in the email.

### Create an account with pdsadmin

Use pdsadmin to create an account on your PDS and generate a password for the account.

```bash
./ops/pdsadmin.sh account create
```

NOTE: This CDK template requires the customized version of pdsadmin found in this repository.
The pdsadmin script from the main [Bluesky PDS repository](https://github.com/bluesky-social/pds) will not work.

### Create an account using an invite code

You can also create an invite code on your PDS and create an account through the Bluesky app using that invite code.
Note that account email addresses will still need to be pre-verified in SES, as in the section above.

```bash
./ops/pdsadmin.sh create-invite-code
```

### Log into the Bluesky app

You can use the Bluesky app to connect to your PDS.
When logging in through the app, select 'Custom' hosting provider,
and enter the domain name of your PDS (e.g. `pds.example.com`).

If you get "Invalid handle" when viewing your profile on Bluesky,
use [Bluesky Debug](https://bsky-debug.app/handle) to check if
your PDS is verifying the handle correctly.
