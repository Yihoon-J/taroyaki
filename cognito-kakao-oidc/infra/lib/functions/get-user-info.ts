import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

export const handler = async (event) => {
  const client = new CognitoIdentityProviderClient();
  const username = event.requestContext.authorizer.jwt.claims.sub;

  try {
    const command = new AdminGetUserCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: username,
    });
    const response = await client.send(command);

    const email = response.UserAttributes.find(attr => attr.Name === 'email')?.Value;
    const nickname = response.UserAttributes.find(attr => attr.Name === 'nickname')?.Value;


    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*", // CORS 설정
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, nickname }),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*", // CORS 설정, 필요에 따라 수정
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
};