import json
import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('tarotchat_ddb')

def lambda_handler(event, context):
    connection_id = event['requestContext']['connectionId']
    
    try:
        # 연결 ID에 해당하는 사용자 정보 조회
        response = table.query(
            KeyConditionExpression=Key('ConnectionId').eq(connection_id)
        )
        
        if response['Items']:
            user_item = response['Items'][0]
            user_id = user_item['UserId']
            
            # 연결 정보만 삭제하고 대화 내역은 유지
            table.delete_item(
                Key={
                    'ConnectionId': connection_id
                }
            )
            
            # 여기에 추가적인 로그아웃 처리 로직을 구현할 수 있습니다.
            # 예: 사용자의 로그인 상태를 업데이트하는 등의 작업
            
            print(f"User {user_id} disconnected. Connection {connection_id} removed.")
        else:
            print(f"No user found for connection {connection_id}")
        
        return {
            'statusCode': 200,
            'body': json.dumps('Disconnected successfully')
        }
    except Exception as e:
        print(f"Error during disconnect: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps('Error during disconnect')
        }