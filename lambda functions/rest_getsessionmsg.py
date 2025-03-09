import json
import boto3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('tarotchat_ddb')

def lambda_handler(event, context):
    try:
        user_id = event.get('queryStringParameters', {}).get('userId')
        session_id = event.get('pathParameters', {}).get('sessionId')
        
        if not user_id or not session_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Both userId and sessionId are required'}),
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': 'https://dje3vsz99xjr1.cloudfront.net',
                    'Access-Control-Allow-Credentials': 'true'
                }
            }

        response = table.get_item(
            Key={
                'UserId': user_id,
                'SessionId': session_id
            }
        )
        
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'body': json.dumps({'error': 'Session not found'}),
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': 'https://dje3vsz99xjr1.cloudfront.net',
                    'Access-Control-Allow-Credentials': 'true'
                }
            }
        
        history = json.loads(response['Item'].get('History', '[]'))
        
        return {
            'statusCode': 200,
            'body': json.dumps(history),
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'https://dje3vsz99xjr1.cloudfront.net',
                'Access-Control-Allow-Credentials': 'true'
            }
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)}),
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': 'https://dje3vsz99xjr1.cloudfront.net',
                'Access-Control-Allow-Credentials': 'true'
            }
        }