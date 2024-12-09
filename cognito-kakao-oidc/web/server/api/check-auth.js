import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const dynamodb = new DynamoDBClient({ region: "us-east-1" });

export default defineEventHandler(async (event) => {
  // CORS 헤더 설정
  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': 'http://localhost:3001',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '600',
  });

  // OPTIONS 요청 처리
  if (event.method === 'OPTIONS') {
    return 'OK';
  }
  
  const query = getQuery(event)
  const userId = query.userId

  console.log("Received request for userId:", userId);

  if (!userId) {
    console.log("No userId provided");
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required',
    })
  }

  try {
    const params = {
      TableName: 'tarotchat_ddb',
      KeyConditionExpression: 'UserId = :userId',
      ExpressionAttributeValues: marshall({
        ':userId': userId
      }),
      Limit: 1 // We only need to know if at least one item exists
    };

    console.log("Querying DynamoDB with params:", JSON.stringify(params, null, 2));

    const command = new QueryCommand(params);
    const result = await dynamodb.send(command);
    
    console.log("DynamoDB result:", JSON.stringify(result, null, 2));

    return { 
      isAuthenticated: result.Items && result.Items.length > 0
    }
  } catch (error) {
    console.error('Error checking user authentication:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Error checking user authentication',
    })
  }
})