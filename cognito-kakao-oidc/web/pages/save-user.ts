import { DynamoDB } from 'aws-sdk'

const dynamodb = new DynamoDB.DocumentClient()

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { userId } = body

  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required',
    })
  }

  try {
    await dynamodb.put({
      TableName: 'tarotchat_ddb',
      Item: {
        UserId: userId,
        Timestamp: new Date().toISOString(),
      },
    }).promise()

    return { message: 'User saved successfully' }
  } catch (error) {
    console.error('Error saving user to DynamoDB:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to save user',
    })
  }
})