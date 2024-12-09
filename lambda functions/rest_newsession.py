import json
import boto3
import uuid
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('tarotchat_ddb')

welcome_message = "어떤 이야기를 하고 싶나요?"

def lambda_handler(event, context):
    try:
        body = json.loads(event['body'])
        user_id = body.get('userId')
        
        if not user_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'userId is required'}),
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': 'http://localhost:3001',
                    'Access-Control-Allow-Credentials': 'true'
                }
            }

        session_id, created_at, session_name = create_new_session(user_id)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'sessionId': session_id,
                'createdAt': created_at,
                'sessionName': session_name,
                'welcomeMessage': welcome_message
            }),
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

def create_new_session(user_id):
    session_id = str(uuid.uuid4())
    current_time = datetime.now().isoformat()
    session_name = "(새 대화)"
    
    item = {
        'UserId': user_id,
        'SessionId': session_id,
        'CreatedAt': current_time,
        'LastUpdatedAt': current_time,
        'SessionName': session_name,
        'History': json.dumps([{
            "type": "ai",
            "content": welcome_message
        }])
    }
    
    table.put_item(Item=item)
    return session_id, current_time, session_name