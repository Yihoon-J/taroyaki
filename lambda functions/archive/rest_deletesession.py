import json
import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('tarotchat_ddb')

def lambda_handler(event, context):
    try:
        # API Gateway에서 path parameter로 전달받은 session_id
        session_id = event.get('pathParameters', {}).get('sessionId')
        
        # 쿼리 파라미터에서 user_id 추출
        user_id = event.get('queryStringParameters', {}).get('userId')
        
        # DynamoDB에서 해당 세션 삭제
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
                'Access-Control-Allow-Origin': '*'
            }
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)}),
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        }