#!/usr/bin/env node
import { App, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import {
  aws_cloudwatch as cloudwatch,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_ecs_patterns as patterns,
  aws_elasticloadbalancingv2 as elb,
  aws_iam as iam,
  aws_kms as kms,
  aws_logs as logs,
  aws_route53 as route53,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import { ApplicationProtocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';

interface BlueskyPdsInfraStackProps extends StackProps {
  domainName: string;
  domainZone: string;
  rootDomain: string;
}

class BlueskyPdsInfraStack extends Stack {
  constructor(parent: App, name: string, props: BlueskyPdsInfraStackProps) {
    super(parent, name, props);

    // Network infrastructure - use existing default VPC
    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', {
      isDefault: true,
    });
    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: props.domainName.replace(/\./g, '-'),
      vpc,
    });
    const domainZone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: props.domainZone });

    // Resources for the PDS application
    const adminPassword = new secretsmanager.Secret(this, 'AdminPassword',
      {
        generateSecretString: {
          passwordLength: 16,
        },
      }
    );
    const jwtSecret = new secretsmanager.Secret(this, 'JwtSecret',
      {
        generateSecretString: {
          passwordLength: 16,
        },
      }
    );
    const rotationKey = new kms.Key(this, 'RotationKey', {
      keySpec: kms.KeySpec.ECC_SECG_P256K1,
      keyUsage: kms.KeyUsage.SIGN_VERIFY,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // TODO mechanism for rotating the password, JWT, and rotation key

    const blobBucket = new s3.Bucket(this, "BlobStorage", {
        removalPolicy: RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      },
    );

    // ECR pull-through cache for the PDS image on GHCR
    const githubSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'GitHubToken', 'ecr-pullthroughcache/bluesky-pds-image-github-token',
    )
    new ecr.CfnPullThroughCacheRule(this, 'ContainerImagePullThroughCache', {
      credentialArn: githubSecret.secretArn,
      ecrRepositoryPrefix: 'github-bluesky',
      upstreamRegistryUrl: 'ghcr.io',
    });
    const cacheRepo = new ecr.Repository(this, 'CacheRepo', {
      repositoryName: 'github-bluesky/bluesky-social/pds',
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });
    const image = ecs.ContainerImage.fromEcrRepository(cacheRepo, '0.4');

    // Fargate service + load balancer to run PDS container image
    const service = new patterns.ApplicationLoadBalancedFargateService(this, 'Service', {
      cluster,
      serviceName: props.domainName.replace(/\./g, '-'),
      desiredCount: 1,
      domainName: props.domainName,
      domainZone,
      protocol: ApplicationProtocol.HTTPS,
      redirectHTTP: true,
      assignPublicIp: true,
      propagateTags: ecs.PropagatedTagSource.SERVICE,
      // PDS server configuration
      taskImageOptions: {
        containerName: 'pds',
        image,
        containerPort: 3000,
        logDriver: ecs.LogDriver.awsLogs({
          streamPrefix: 'PDSService',
          logGroup: new logs.LogGroup(this, 'ServiceLogGroup', {
            retention: logs.RetentionDays.ONE_MONTH,
            removalPolicy: RemovalPolicy.DESTROY,
          }),
        }),
        environment: {
          // TODO OAuth config
          PDS_HOSTNAME: props.domainName,
          PDS_PORT: "3000",
          PDS_DATA_DIRECTORY: '/tmp',  // TODO: EFS for persistent storage of sqlite databases
          PDS_PLC_ROTATION_KEY_KMS_KEY_ID: rotationKey.keyId,
          PDS_BLOBSTORE_S3_BUCKET: blobBucket.bucketName,
          PDS_BLOBSTORE_S3_REGION: this.region,
          PDS_BLOBSTORE_DISK_LOCATION: '',
          PDS_BLOB_UPLOAD_LIMIT: '52428800',
          PDS_DID_PLC_URL: 'https://plc.directory',
          PDS_BSKY_APP_VIEW_URL: 'https://api.bsky.app',
          PDS_BSKY_APP_VIEW_DID: 'did:web:api.bsky.app',
          PDS_REPORT_SERVICE_URL: 'https://mod.bsky.app',
          PDS_REPORT_SERVICE_DID: 'did:plc:ar7c4by46qjdydhdevvrndac',
          PDS_CRAWLERS: 'https://bsky.network',
          PDS_SERVICE_HANDLE_DOMAINS: '.' + props.rootDomain,
          LOG_ENABLED: 'true',
        },
        secrets: {
          PDS_ADMIN_PASSWORD: ecs.Secret.fromSecretsManager(adminPassword),
          PDS_JWT_SECRET: ecs.Secret.fromSecretsManager(jwtSecret),
        },
      },
      // PDS min system requirements: 1 CPU core, 1 GB memory, 20 GB disk
      cpu: 2048,
      memoryLimitMiB: 4096,
      // Only let 1 PDS instance run at a time.
      // Deployments will take down the old task before starting a new one
      maxHealthyPercent: 100,
      minHealthyPercent: 0,
      circuitBreaker: {
        enable: true,
        rollback: true,
      },
      // Enable running pdsadmin in the container
      enableExecuteCommand: true,
    });

    // Grant ECR pull-through cache permissions
    service.service.taskDefinition.addToExecutionRolePolicy(
      new iam.PolicyStatement({
        actions: ['ecr:BatchImportUpstreamImage'],
        resources: [cacheRepo.repositoryArn],
      }),
    );

    // Permissions needed by PDS
    blobBucket.grantReadWrite(service.service.taskDefinition.taskRole);
    rotationKey.grant(service.service.taskDefinition.taskRole, 'kms:GetPublicKey', 'kms:Sign');

    // TODO health checks: /xrpc/_health

    // Alarms: monitor 500s and unhealthy hosts on target groups
    new cloudwatch.Alarm(this, 'TargetGroupUnhealthyHosts', {
      alarmName: this.stackName + '-Unhealthy-Hosts',
      metric: service.targetGroup.metrics.unhealthyHostCount(),
      threshold: 1,
      evaluationPeriods: 2,
    });

    new cloudwatch.Alarm(this, 'TargetGroup5xx', {
      alarmName: this.stackName + '-Http-500',
      metric: service.targetGroup.metrics.httpCodeTarget(
        elb.HttpCodeTarget.TARGET_5XX_COUNT,
        { period: Duration.minutes(1) }
      ),
      threshold: 1,
      evaluationPeriods: 1,
    });
  }
}

const app = new App();
new BlueskyPdsInfraStack(app, 'BlueskyPdsInfra', {
  domainName: 'bsky-pds.aws.clare.dev',
  domainZone: 'aws.clare.dev',
  rootDomain: 'clare.dev',
  env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-2' },
  tags: {
      project: "bluesky-pds"
  }
});
app.synth();
