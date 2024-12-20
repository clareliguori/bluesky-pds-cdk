#!/usr/bin/env node
import { App, Stack, StackProps } from 'aws-cdk-lib';
import { AppResources, Compute, Monitoring, Network } from './constructs';
import { CommonProps, Mode } from './types';

interface BlueskyPdsInfraStackProps extends StackProps, CommonProps {}

class BlueskyPdsInfraStack extends Stack {
  constructor(parent: App, name: string, props: BlueskyPdsInfraStackProps) {
    super(parent, name, props);

    const network = new Network(this, 'Network', props);

    const appResources = new AppResources(this, 'AppResources', {
      ...props,
      network,
    });

    const compute = new Compute(this, 'Compute', {
      ...props,
      network,
      appResources,
    });

    new Monitoring(this, 'Monitoring', {
      ...props,
      compute,
    });
  }
}

const app = new App();
new BlueskyPdsInfraStack(app, 'BlueskyPdsInfra', {
  mode: Mode.PROD,
  domainName: 'pds.reinvent-trivia.com',
  domainZone: 'reinvent-trivia.com',
  env: { account: process.env['CDK_DEFAULT_ACCOUNT'], region: 'us-east-2' },
  tags: {
    project: 'bluesky-pds',
  },
});
app.synth();
