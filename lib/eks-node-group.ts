import ec2 = require('@aws-cdk/aws-ec2');
import iam = require('@aws-cdk/aws-iam');
import asg = require('@aws-cdk/aws-autoscaling');
import cdk = require('@aws-cdk/core');

export interface NodeGroupProps extends cdk.StackProps {
  controlPlaneSG: ec2.SecurityGroup;
  vpc: ec2.IVpc;
  clusterName: string;
  sshAllowedCidr: string[];
  keyName?: string;
  nodeGroupMaxSize: number;
  nodeGroupMinSize: number;
  nodeGroupDesiredSize: number;
  nodeGroupInstanceType: string;
}

const WORKER_NODE_POLICIES: string[] = [
  "AmazonEKSWorkerNodePolicy",
  "AmazonEKS_CNI_Policy",
  "AmazonEC2ContainerRegistryReadOnly"
];

export class EksNodeGroupStack extends cdk.Stack {

  public readonly workerNodeASG: asg.AutoScalingGroup;

  constructor(parent: cdk.App, name: string, props: NodeGroupProps) {
    super(parent, name, props);

    const vpc = props.vpc;
    const controlPlaneSG = ec2.SecurityGroup.fromSecurityGroupId(this, "eksClustersg", cdk.Fn.importValue('eksClustersg'));

    // have to periodically update this constant
    const amiMap: {[region: string]: string;} = {
      "ap-southeast-2": 'ami-029318fe7c3a1664b',
    };
    this.workerNodeASG = new asg.AutoScalingGroup(this, 'Workers', {
      instanceType: new ec2.InstanceType(props.nodeGroupInstanceType),
      machineImage: new ec2.GenericLinuxImage(amiMap),
      vpc,
      allowAllOutbound: true,
      minCapacity: props.nodeGroupMinSize,
      maxCapacity: props.nodeGroupMaxSize,
      desiredCapacity: props.nodeGroupDesiredSize,
      keyName: props.keyName,
      updateType: asg.UpdateType.ROLLING_UPDATE,
      rollingUpdateConfiguration: {
        maxBatchSize: 1,
        minInstancesInService: 1,
        pauseTime: cdk.Duration.minutes(5),
        waitOnResourceSignals: true,
      },
    });
    cdk.Tag.add(this.workerNodeASG, `kubernetes.io/cluster/${props.clusterName}`, 'owned');
    cdk.Tag.add(this.workerNodeASG, 'NodeType', 'Worker');
    for (const policy of WORKER_NODE_POLICIES) {
      this.workerNodeASG.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName(policy));
    }

    this.workerNodeASG.role.
      addToPolicy(  (()=> {
                      const workerNodeASGPolicyStatement = new iam.PolicyStatement();
                      workerNodeASGPolicyStatement.addActions('cloudformation:SignalResource')
                      workerNodeASGPolicyStatement.addResources( `arn:aws:cloudformation:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:stack/${cdk.Aws.STACK_NAME}/*`);
                      return workerNodeASGPolicyStatement;
                    })()
                  
      );

    this.workerNodeASG.role.
      addToPolicy(  (()=> {
                      const workerNodeASGPolicyStatement = new iam.PolicyStatement();
                      workerNodeASGPolicyStatement.addAllResources();
                      workerNodeASGPolicyStatement.addActions('ec2:DescribeTags');
                      return workerNodeASGPolicyStatement;
                    })()
      );

    // this issue is being tracked: https://github.com/awslabs/aws-cdk/issues/623
     
    const asgResource = this.workerNodeASG.node.children.find(c => (c as cdk.CfnResource).cfnResourceType === 'AWS::AutoScaling::AutoScalingGroup') as asg.CfnAutoScalingGroup;

    this.workerNodeASG.addUserData(
      'set -o xtrace',
      `/etc/eks/bootstrap.sh ${props.clusterName}`,
      `/opt/aws/bin/cfn-signal --exit-code $? \\`,
      `  --stack ${cdk.Aws.STACK_NAME} \\`,
      `  --resource ${asgResource.logicalId} \\`,
      `  --region ${cdk.Aws.REGION}`
    );

    this.workerNodeASG.connections.allowFrom(controlPlaneSG, ec2.Port.tcpRange(1025, 65535));
    this.workerNodeASG.connections.allowFrom(controlPlaneSG, ec2.Port.tcp(443));
    this.workerNodeASG.connections.allowInternally(ec2.Port.allTraffic());
    
    const cpConnection = controlPlaneSG.connections;
    cpConnection.allowTo(this.workerNodeASG, ec2.Port.tcpRange(1025, 65535));
    cpConnection.allowTo(this.workerNodeASG, ec2.Port.tcp(443));
    cpConnection.allowFrom(this.workerNodeASG, ec2.Port.tcpRange(1025, 65535));

    new cdk.CfnOutput(this, 'WorkerRoleArn', {
      value: this.workerNodeASG.role.roleArn,
    });
  }
}
