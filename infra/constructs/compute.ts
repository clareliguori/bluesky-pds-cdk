import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  aws_ecr_assets as ecr_assets,
  aws_ecs as ecs,
  aws_ecs_patterns as patterns,
  aws_elasticloadbalancingv2 as elb,
  aws_logs as logs,
  aws_route53 as route53,
  aws_route53_targets as route53_targets,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AppResources } from './app-resources';
import { Network } from './network';
import { CommonProps, Mode } from '../types';

export interface ComputeProps extends CommonProps {
  readonly appResources: AppResources;
  readonly network: Network;
}

/**
 * The underlying compute and load balancer infrastructure for the Bluesky PDS application,
 * running in containers.
 */
export class Compute extends Construct {
  public readonly service: ecs.BaseService;
  public readonly targetGroup: elb.ApplicationTargetGroup;
  public readonly pdsLogGroup: logs.LogGroup;
  public readonly syncLogGroup: logs.LogGroup;

  constructor(parent: Construct, name: string, props: ComputeProps) {
    super(parent, name);

    // Docker images to build
    const pdsImage = ecs.ContainerImage.fromAsset('./pds', {
      platform: ecr_assets.Platform.LINUX_AMD64,
    });
    const pdsBackupImage = ecs.ContainerImage.fromAsset('./pds-data-backup', {
      platform: ecr_assets.Platform.LINUX_AMD64,
    });

    // Logging
    this.pdsLogGroup = new logs.LogGroup(this, 'ServiceLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy:
        props.mode === Mode.TEST
          ? RemovalPolicy.DESTROY
          : RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });
    this.syncLogGroup = new logs.LogGroup(this, 'PDSS3SyncLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy:
        props.mode === Mode.TEST
          ? RemovalPolicy.DESTROY
          : RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });

    // Fargate service + load balancer to run PDS container image
    const service = new patterns.ApplicationLoadBalancedFargateService(
      this,
      'Service',
      {
        cluster: props.network.cluster,
        serviceName: props.domainName.replace(/\./g, '-'),
        desiredCount: 1,
        domainName: props.domainName,
        domainZone: props.network.hostedZone,
        certificate: props.network.certificate,
        protocol: elb.ApplicationProtocol.HTTPS,
        redirectHTTP: true,
        assignPublicIp: true,
        propagateTags: ecs.PropagatedTagSource.SERVICE,
        // PDS server configuration
        taskImageOptions: {
          containerName: 'pds',
          image: pdsImage,
          containerPort: 3000,
          logDriver: ecs.LogDriver.awsLogs({
            streamPrefix: 'PDSService',
            logGroup: this.pdsLogGroup,
          }),
          environment: {
            PDS_HOSTNAME: props.domainName,
            PDS_PORT: '3000',
            PDS_DATA_DIRECTORY: '/pds',
            PDS_PLC_ROTATION_KEY_KMS_KEY_ID:
              props.appResources.rotationKey.keyId,
            AWS_REGION: Stack.of(this).region,
            AWS_DEFAULT_REGION: Stack.of(this).region,
            PDS_BLOBSTORE_S3_BUCKET: props.appResources.blobBucket.bucketName,
            PDS_BLOBSTORE_S3_REGION: Stack.of(this).region,
            PDS_BLOBSTORE_DISK_LOCATION: '',
            PDS_BLOB_UPLOAD_LIMIT: '52428800',
            PDS_EMAIL_FROM_ADDRESS: `admin@mail.${props.domainZone}`,
            PDS_DID_PLC_URL: 'https://plc.directory',
            PDS_BSKY_APP_VIEW_URL: 'https://api.bsky.app',
            PDS_BSKY_APP_VIEW_DID: 'did:web:api.bsky.app',
            PDS_REPORT_SERVICE_URL: 'https://mod.bsky.app',
            PDS_REPORT_SERVICE_DID: 'did:plc:ar7c4by46qjdydhdevvrndac',
            PDS_CRAWLERS: 'https://bsky.network',
            PDS_SERVICE_HANDLE_DOMAINS: `.${props.domainName}`,
            LOG_ENABLED: 'true',
            SMTP_HOST: `email-smtp.${Stack.of(this).region}.amazonaws.com`,
          },
          secrets: {
            PDS_ADMIN_PASSWORD: ecs.Secret.fromSecretsManager(
              props.appResources.adminPassword
            ),
            PDS_JWT_SECRET: ecs.Secret.fromSecretsManager(
              props.appResources.jwtSecret
            ),
            SMTP_MAIL_USERNAME: ecs.Secret.fromSecretsManager(
              props.appResources.smtpCredentials.secret,
              'username'
            ),
            SMTP_MAIL_PASSWORD: ecs.Secret.fromSecretsManager(
              props.appResources.smtpCredentials.secret,
              'password'
            ),
          },
        },
        healthCheck: {
          command: [
            'CMD-SHELL',
            "node -e 'fetch(`http://localhost:3000/xrpc/_health`).then(()=>process.exitCode = 0).catch(()=>process.exitCode = 1)'",
          ],
        },
        // PDS min system requirements: 1 CPU core, 1 GB memory, 20 GB disk
        cpu: 1024,
        memoryLimitMiB: 2048, // lowest mem value allowed in Fargate for 1 CPU
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
      }
    );
    service.service.node.addDependency(props.appResources.emailIdentity);
    service.service.node.addDependency(props.appResources.smtpCredentials);

    // PDS will verify users at endpoints like:
    // https://<userhandle>.pds.example.com/.well-known/atproto-did
    // This wildcard record will route *.pds.example.com to the ALB
    new route53.ARecord(this, 'WildcardDNS', {
      zone: props.network.hostedZone,
      recordName: `*.${props.domainName}`,
      target: route53.RecordTarget.fromAlias(
        new route53_targets.LoadBalancerTarget(service.loadBalancer)
      ),
    });

    service.targetGroup.configureHealthCheck({
      path: '/xrpc/_health',
    });
    service.targetGroup.setAttribute(
      'deregistration_delay.timeout_seconds',
      '30'
    );

    // Add sidecar container that backs up and restores the PDS data to/from S3
    // TODO backup the actors/ directory to S3
    const sidecar = service.taskDefinition.addContainer('SyncContainer', {
      containerName: 's3_sync',
      image: pdsBackupImage,
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'PDSS3Sync',
        logGroup: this.syncLogGroup,
      }),
      environment: {
        AWS_REGION: Stack.of(this).region,
        AWS_DEFAULT_REGION: Stack.of(this).region,
        S3_PATH: `s3://${props.appResources.dataBackupBucket.bucketName}/pds-backup`,
        LOCAL_PATH: '/sync',
      },
      healthCheck: {
        command: ['CMD', '/healthcheck.sh'],
      },
      stopTimeout: Duration.minutes(1),
    });

    // Create a volume for the PDS data
    service.taskDefinition.addVolume({
      name: 'pds-data',
      host: {},
    });
    sidecar.addMountPoints({
      containerPath: '/sync',
      readOnly: false,
      sourceVolume: 'pds-data',
    });
    service.taskDefinition.findContainer('pds')!.addMountPoints({
      containerPath: '/pds',
      readOnly: false,
      sourceVolume: 'pds-data',
    });

    // Ensure that databases have been restored in the sidecar container before starting PDS
    service.taskDefinition.findContainer('pds')!.addContainerDependencies({
      container: sidecar,
      condition: ecs.ContainerDependencyCondition.HEALTHY,
    });

    // Permissions needed by containers
    props.appResources.dataBackupBucket.grantReadWrite(
      service.service.taskDefinition.taskRole
    );
    props.appResources.blobBucket.grantReadWrite(
      service.service.taskDefinition.taskRole
    );
    props.appResources.rotationKey.grant(
      service.service.taskDefinition.taskRole,
      'kms:GetPublicKey',
      'kms:Sign'
    );

    this.targetGroup = service.targetGroup;
    this.service = service.service;
  }
}
