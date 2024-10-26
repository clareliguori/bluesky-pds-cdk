#!/usr/bin/env node
import { App, Duration, Stack, StackProps } from 'aws-cdk-lib';
import {
  aws_cloudwatch as cloudwatch,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_ecs_patterns as patterns,
  aws_elasticloadbalancingv2 as elb,
  aws_iam as iam,
  aws_route53 as route53,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import { ApplicationProtocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';

interface BlueskyPdsInfraStackProps extends StackProps {
  domainName: string;
  domainZone: string;
}

class BlueskyPdsInfraStack extends Stack {
  constructor(parent: App, name: string, props: BlueskyPdsInfraStackProps) {
    super(parent, name, props);

    // Network infrastructure
    const vpc = new ec2.Vpc(this, 'VPC', { maxAzs: 2 });
    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: props.domainName.replace(/\./g, '-'),
      vpc,
      containerInsights: true,
    });
    const domainZone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: props.domainZone });

    // ECR pull-through cache for the PDS image on GHCR
    const githubSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'GitHubToken', 'ecr-pullthroughcache/bluesky-pds-image-github-token',
    )
    new ecr.CfnPullThroughCacheRule(this, 'ContainerImagePullThroughCache', {
      credentialArn: githubSecret.secretArn,
      ecrRepositoryPrefix: 'github-bluesky',
      upstreamRegistryUrl: 'ghcr.io',
    });
    new ecr.CfnRepositoryCreationTemplate(this, 'PullThroughCacheRepoTemplate', {
      appliedFor: ['PULL_THROUGH_CACHE'],
      prefix: 'github-bluesky',
      resourceTags: [{
        key: 'project',
        value: 'bluesky-pds',
      }],
    });
    const cacheRepo = ecr.Repository.fromRepositoryName(this, 'CacheRepo', 'github-bluesky/bluesky-social/pds');
    const image = ecs.ContainerImage.fromEcrRepository(cacheRepo, '0.4');

    // TODO: S3 bucket for blob storage
    // TODO: EFS for persistent storage of sqlite databases

    // Fargate service + load balancer to run PDS container image
    const service = new patterns.ApplicationLoadBalancedFargateService(this, 'Service', {
      cluster,
      serviceName: props.domainName.replace(/\./g, '-'),
      desiredCount: 1,
      domainName: props.domainName,
      domainZone,
      protocol: ApplicationProtocol.HTTPS,
      redirectHTTP: true,
      propagateTags: ecs.PropagatedTagSource.SERVICE,
      // PDS server configuration
      taskImageOptions: {
        image,
        environment: {
          // TODO config
          BLUESKY_PDS_DOMAIN_NAME: props.domainName,
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
    service.service.taskDefinition.executionRole?.attachInlinePolicy(
      new iam.Policy(this, 'PullThroughCachePolicy', {
        statements: [
          new iam.PolicyStatement({
            actions: ['ecr:CreateRepository', 'ecr:BatchImportUpstreamImage'],
            resources: [cacheRepo.repositoryArn],
          }),
        ],
      }),
    );

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
  env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-2' },
  tags: {
      project: "bluesky-pds"
  }
});
app.synth();
