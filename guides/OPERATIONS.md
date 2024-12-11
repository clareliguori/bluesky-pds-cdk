# Operate your Bluesky PDS

Below are some instructions specific to how to operate your self-hosted Bluesky PDS
after deploying it with this template.
Also review the [Readme](https://github.com/bluesky-social/pds/blob/main/README.md)
on the official Bluesky PDS repo for additional guidance.
The [AT Protocol PDS Admins Discord](https://discord.gg/e7hpHxRfBP) is another resource
for self-hosting guidance and important updates about the PDS distribution.

### Keep your PDS up to date

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

### Create an account

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

You can now use pdsadmin to create an account on your PDS.

```bash
./ops/pdsadmin.sh account create
```

NOTE: This template requires the customized version of pdsadmin found in this repository.
The pdsadmin script from the main [Bluesky PDS repository](https://github.com/bluesky-social/pds) will not work.

### Create an account using an invite code

You can also create an invite code on your PDS and create an account through the Bluesky app using that invite code.
Note that account email addresses will still need to be pre-verified in SES, as in the section above.

```bash
./ops/pdsadmin.sh create-invite-code
```

### Use the Bluesky app with your PDS

You can use the Bluesky app to connect to your PDS.
When logging in through the app, enter the URL of your PDS (e.g. `https://pds.example.com/`)
