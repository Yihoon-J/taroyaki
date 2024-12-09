import json
import boto3
import uuid
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('tarotchat_ddb')

def lambda_handler(event, context):
    connection_id = event['requestContext']['connectionId']
    
    try:
        # 쿼리 파라미터에서 userId 추출
        query_params = event.get('queryStringParameters', {})
        user_id = query_params.get('userId')
        session_id = query_params.get('sessionId')

        if not user_id or not session_id:
            raise ValueError("Both userId and sessionId are required")

        current_time = datetime.now().isoformat()

        # 기존 연결 정보 업데이트
        table.update_item(
            Key={
                'UserId': user_id,
                'SessionId': session_id
            },
            UpdateExpression="SET ConnectionId = :conn_id, LastUpdatedAt = :updated_at",
            ExpressionAttributeValues={
                ':conn_id': connection_id,
                ':updated_at': current_time
            }
        )

        return {
            'statusCode': 200,
            'body': json.dumps('Connected successfully')
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps('Connection failed')
        }