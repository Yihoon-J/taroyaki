import { CognitoIdentityProviderClient, GetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const cognitoIdentityProvider = new CognitoIdentityProviderClient({ region: "us-east-1" });

export default defineEventHandler(async (event) => {
  const token = event.headers.get('authorization')?.replace('Bearer ', '');

  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  try {
    const command = new GetUserCommand({
      AccessToken: token
    });
    const response = await cognitoIdentityProvider.send(command);
    
    return {
      username: response.Username,
      // Add any other user attributes you need
    }
  } catch (error) {
    console.error('Error getting user info:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to get user info'
    })
  }
})