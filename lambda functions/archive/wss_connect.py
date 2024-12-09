import json
import boto3
import uuid
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('tarotchat_ddb')

def lambda_handler(event, context):
    connection_id = event['requestContext']['connectionId']
    
    try:
        # 쿼리 문자열 파라미터 로깅
        query_string_parameters = event.get('queryStringParameters', {})
        print("Query string parameters:", query_string_parameters)

        # 다양한 위치에서 userId 찾기
        user_id = query_string_parameters.get('userId')
        if not user_id:
            user_id = event['requestContext'].get('authorizer', {}).get('userId')
        if not user_id:
            user_id = event.get('headers', {}).get('userId')

        print("Extracted userId:", user_id)

        if not user_id:
            raise ValueError("User ID not provided in query parameters, authorizer, or headers")

        # 새로운 세션 ID 생성
        session_id = str(uuid.uuid4())
        current_time = datetime.now().isoformat()

        # DynamoDB에 새 세션 정보 저장
        table.put_item(
            Item={
                'UserId': user_id,
                'SessionId': session_id,
                'ConnectionId': connection_id,
                'CreatedAt': current_time,
                'LastUpdatedAt': current_time,
                'SessionName': f"Chat Session {current_time}"
            }
        )

        return {
            'statusCode': 200,
            'body': json.dumps({'sessionId': session_id, 'message': 'Connected and session created'})
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps('Error in connecting or creating session')
        }
        