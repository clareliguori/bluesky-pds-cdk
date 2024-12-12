import {
  aws_certificatemanager as acm,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_route53 as route53,
} from 'aws-cdk-lib';
import { CommonProps } from '../types';
import { Construct } from 'constructs';

export interface NetworkProps extends CommonProps {}

/**
 * The underlying network infrastructure for the Bluesky PDS application
 */
export class Network extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly cluster: ecs.Cluster;
  public readonly hostedZone: route53.IHostedZone;
  public readonly s3Endpoint: ec2.GatewayVpcEndpoint;
  public readonly certificate: acm.Certificate;

  constructor(parent: Construct, name: string, props: NetworkProps) {
    super(parent, name);

    // Network infrastructure
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    this.s3Endpoint = this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    this.cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: props.domainName.replace(/\./g, '-'),
      vpc: this.vpc,
    });

    this.hostedZone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: props.domainZone,
    });

    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      subjectAlternativeNames: [`*.${props.domainName}`],
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });
  }
}
