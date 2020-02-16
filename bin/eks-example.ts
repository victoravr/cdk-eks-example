#!/usr/bin/env node
import { EksClusterStack } from '../lib/eks-cluster';
import { EksNodeGroupStack } from '../lib/eks-node-group';
import cdk = require('@aws-cdk/core');

const app = new cdk.App();

const clusterName = app.node.tryGetContext('cluster-name');
const cluster = new EksClusterStack(app, 'EksCluster', { 
  clusterName, 
  env: { account: 'XXXXXXXXXX', region: 'ap-southeast-2' }, }
);

/* worker node configuration properties */
const nodeGroupMaxSize = app.node.tryGetContext('node-group-max-size');
const nodeGroupMinSize = app.node.tryGetContext('node-group-min-size');
const nodeGroupDesiredSize = app.node.tryGetContext('node-group-desired-size');
const keyFromContext = app.node.tryGetContext('key-name');
const keyName = (keyFromContext === null) ? undefined : keyFromContext;
const sshAllowedCidr = app.node.tryGetContext('ssh-allowed-cidr');
const nodeGroupInstanceType = app.node.tryGetContext('node-group-instance-type');

new EksNodeGroupStack(app, 'EksWorkers', {
  controlPlaneSG: cluster.controlPlaneSG,
  vpc: cluster.vpc,
  clusterName,
  keyName,
  sshAllowedCidr,
  nodeGroupMaxSize,
  nodeGroupMinSize,
  nodeGroupDesiredSize,
  nodeGroupInstanceType,
  env: { account: 'XXXXXXXXXXXX', region: 'ap-southeast-2' }, 
});

app.synth();