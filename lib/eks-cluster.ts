import ec2 = require('@aws-cdk/aws-ec2');
import eks = require('@aws-cdk/aws-eks');
import iam = require('@aws-cdk/aws-iam');
import cdk = require('@aws-cdk/core');

export interface ClusterProps extends cdk.StackProps {
  clusterName: string;
  vpcProps?: ec2.VpcAttributes;
  env: cdk.Environment;
}

const EKS_POLICIES: string[] = [
  "AmazonEKSServicePolicy",
  "AmazonEKSClusterPolicy"
];

export class EksClusterStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly controlPlaneSG: ec2.SecurityGroup;
  public readonly cluster: eks.CfnCluster;
  constructor(parent: cdk.App, name: string, props: ClusterProps) {
    super(parent, name, props);
    let vpc = ec2.Vpc.fromLookup(this, 'XXXXXXXXXXXXX', {
      vpcId: 'vpc-XXXXXXXX'
    });
    this.vpc = vpc;
    const controlPlaneSG = new ec2.SecurityGroup(this, `${props.clusterName}ControlPlaneSG`, {
      vpc
    });
    this.controlPlaneSG = controlPlaneSG;
    const eksRole = new iam.Role(this, 'EksServiceRole', {
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName(EKS_POLICIES[0]),iam.ManagedPolicy.fromAwsManagedPolicyName(EKS_POLICIES[1])],
    });

    const eksPolicyStatement = new iam.PolicyStatement()
    eksPolicyStatement.addAllResources();
    eksPolicyStatement.addActions("elasticloadbalancing:*","ec2:CreateSecurityGroup","ec2:Describe*")

    eksRole.addToPolicy(eksPolicyStatement);

    const publicSubnetIds = vpc.publicSubnets.map( s => s.subnetId);
    const privateSubnetIds = vpc.privateSubnets.map( s => s.subnetId);
    this.cluster = new eks.CfnCluster(this, props.clusterName, {
      name: props.clusterName,
      resourcesVpcConfig: {
        subnetIds: publicSubnetIds.concat(privateSubnetIds),
        securityGroupIds: [controlPlaneSG.securityGroupId],
      },
      roleArn: eksRole.roleArn,
    });
    new cdk.CfnOutput(this, 'eksClustersg', {
      value: this.controlPlaneSG.securityGroupId,
      exportName: 'eksClustersg',
    });
  }
}
