import { CfnOutput, RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  aws_iam as iam,
  aws_kms as kms,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
  aws_ses as ses,
} from 'aws-cdk-lib';
import { SesSmtpCredentials } from '@pepperize/cdk-ses-smtp-credentials';
import { Construct } from 'constructs';
import { Network } from './network';
import { CommonProps, Mode } from '../types';

export interface AppResourcesProps extends CommonProps {
  readonly network: Network;
}

/**
 * The AWS resources used by the PDS application and sidecar containers
 */
export class AppResources extends Construct {
  public readonly adminPassword: secretsmanager.Secret;
  public readonly jwtSecret: secretsmanager.Secret;
  public readonly rotationKey: kms.Key;
  public readonly blobBucket: s3.Bucket;
  public readonly dataBackupBucket: s3.Bucket;
  public readonly emailIdentity: ses.EmailIdentity;
  public readonly smtpCredentials: SesSmtpCredentials;

  constructor(parent: Construct, name: string, props: AppResourcesProps) {
    super(parent, name);

    // Auto-generated secrets and keys
    // TODO mechanism for rotating the password, JWT, and rotation key

    this.adminPassword = new secretsmanager.Secret(this, 'AdminPassword', {
      generateSecretString: {
        passwordLength: 16,
      },
    });
    new CfnOutput(this, 'AdminPasswordID', {
      key: 'AdminPasswordID',
      value: this.adminPassword.secretArn,
      description: 'ARN of the admin password secret',
    });

    this.jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      generateSecretString: {
        passwordLength: 16,
      },
    });

    this.rotationKey = new kms.Key(this, 'RotationKey', {
      keySpec: kms.KeySpec.ECC_SECG_P256K1,
      keyUsage: kms.KeyUsage.SIGN_VERIFY,
      removalPolicy:
        props.mode === Mode.TEST
          ? RemovalPolicy.DESTROY
          : RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });

    // Storage

    this.blobBucket = new s3.Bucket(this, 'BlobStorage', {
      bucketName: props.domainName.replace(/\./g, '-') + '-blob',
      removalPolicy:
        props.mode === Mode.TEST
          ? RemovalPolicy.DESTROY
          : RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      autoDeleteObjects: props.mode === Mode.TEST,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    this.dataBackupBucket = new s3.Bucket(this, 'DataBackupStorage', {
      bucketName: props.domainName.replace(/\./g, '-') + '-backup',
      removalPolicy:
        props.mode === Mode.TEST
          ? RemovalPolicy.DESTROY
          : RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      autoDeleteObjects: props.mode === Mode.TEST,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    // Control access to the buckets
    const s3EndpointPolicy = new iam.PolicyStatement({
      actions: ['s3:*'],
      effect: iam.Effect.ALLOW,
      principals: [new iam.AnyPrincipal()],
      resources: [
        // Only these buckets can be accessed within the VPC
        this.blobBucket.bucketArn,
        this.blobBucket.arnForObjects('*'),
        this.dataBackupBucket.bucketArn,
        this.dataBackupBucket.arnForObjects('*'),
        // ECR
        `arn:${Stack.of(this).partition}:s3:::prod-${
          Stack.of(this).region
        }-starport-layer-bucket`,
        `arn:${Stack.of(this).partition}:s3:::prod-${
          Stack.of(this).region
        }-starport-layer-bucket/*`,
      ],
    });
    props.network.s3Endpoint.addToPolicy(s3EndpointPolicy);

    // In production mode, enforce that access to objects is only through the VPC endpoint
    if (props.mode === Mode.PROD) {
      const s3BucketPolicy = new iam.PolicyStatement({
        actions: [
          's3:GetObject*',
          's3:DeleteObject*',
          's3:PutObject*',
          's3:Abort*',
        ],
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        resources: ['*'],
        conditions: {
          StringNotEquals: {
            'aws:sourceVpce': props.network.s3Endpoint.vpcEndpointId,
          },
        },
      });
      this.blobBucket.addToResourcePolicy(s3BucketPolicy);
      this.dataBackupBucket.addToResourcePolicy(s3BucketPolicy);
    }

    // Resources for PDS to send emails

    this.emailIdentity = new ses.EmailIdentity(this, 'EmailIdentity', {
      identity: ses.Identity.publicHostedZone(props.network.hostedZone),
      mailFromDomain: 'mail.' + props.domainZone,
    });
    // SES does not support generating SMTP credentials from temporary credentials,
    // only long-term credentials.
    // TODO figure out how to regularly rotate this IAM user
    const emailUser = new iam.User(this, 'SesUser', {});
    this.emailIdentity.grantSendEmail(emailUser);
    this.smtpCredentials = new SesSmtpCredentials(this, 'SmtpCredentials', {
      user: emailUser,
    });
  }
}
