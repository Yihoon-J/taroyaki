import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { BaseApiStack } from './base-stack';

interface Props extends cdk.StackProps {
  api: apigwv2.IHttpApi;
  authorizer?: apigwv2.IHttpRouteAuthorizer;
  userPoolId: string;
  userPoolClientId: string;
}

export class AuthKakaoStack extends BaseApiStack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const ns = this.node.tryGetContext('ns') as string;

    const checkFunction = this.newCheckFunction(ns);
    const getUserInfoFunction = this.newGetUserInfoFunction(ns, props.userPoolId);

    this.addRoute({
      api: props.api,
      authorizer: props.authorizer,
      routeId: 'Check',
      path: '/check',
      method: apigwv2.HttpMethod.GET,
      handler: checkFunction,
    });

    this.addRoute({
      api: props.api,
      authorizer: props.authorizer,
      routeId: 'GetUserInfo',
      path: '/user-info',
      method: apigwv2.HttpMethod.GET,
      handler: getUserInfoFunction,
    });
  }

  private newCheckFunction(ns: string) {
    const fn = new lambdaNodejs.NodejsFunction(this, `Check`, {
      functionName: `${ns}Check`,
      entry: path.resolve(__dirname, '..', 'functions', 'check.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      architecture: lambda.Architecture.ARM_64,
    });
    return fn;
  }

  private newGetUserInfoFunction(ns: string, userPoolId: string) {
    const fn = new lambdaNodejs.NodejsFunction(this, `GetUserInfo`, {
      functionName: `${ns}GetUserInfo`,
      entry: path.resolve(__dirname, '..', 'functions', 'get-user-info.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      architecture: lambda.Architecture.ARM_64,
      environment: {
        USER_POOL_ID: userPoolId,
      },
    });

    // Grant the Lambda function permissions to call AdminGetUser on the User Pool
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${userPoolId}`],
    }));

    return fn;
  }
}