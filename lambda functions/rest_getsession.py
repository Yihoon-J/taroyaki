import json
import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('tarotchat_ddb')

def lambda_handler(event, context):
    try:
        user_id = event.get('queryStringParameters', {}).get('userId')
        
        if not user_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'UserId is required'}),
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': 'http://localhost:3001',
                    'Access-Control-Allow-Credentials': 'true'
                }
            }
        
        response = table.query(
            KeyConditionExpression=Key('UserId').eq(user_id),
            ScanIndexForward=False,
            Limit=10
        )
        
        sessions = response['Items']
        sessions = sorted(sessions, key=lambda x: x.get('LastUpdatedAt', ''), reverse=True)
        
        return {
            'statusCode': 200,
            'body': json.dumps(sessions),
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