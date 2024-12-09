import json
import boto3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('tarotchat_ddb')

def lambda_handler(event, context):
    try:
        session_id = event.get('pathParameters', {}).get('sessionId')
        user_id = event.get('queryStringParameters', {}).get('userId')
        
        if not session_id or not user_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Both sessionId and userId are required'}),
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': 'http://localhost:3001',
                    'Access-Control-Allow-Credentials': 'true'
                }
            }

        response = table.delete_item(
            Key={
                'UserId': user_id,
                'SessionId': session_id
            }
        )
        
        return {
            'statusCode': 200,
            'body': json.dumps('Session deleted successfully'),
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'http://localhost:3001',
                'Access-Control-Allow-Credentials': 'true'
            }
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)}),
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'http://localhost:3001',
                'Access-Control-Allow-Credentials': 'true'
            }
        }