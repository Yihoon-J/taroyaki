import json
import boto3
from datetime import datetime

# Bedrock Runtime 클라이언트 초기화
bedrock_runtime = boto3.client('bedrock-runtime')
bedrock_agent_runtime = boto3.client('bedrock-agent-runtime')

gateway_client = boto3.client('apigatewaymanagementapi', endpoint_url='https://tt0ikgb3sd.execute-api.us-east-1.amazonaws.com/production')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('tarotchat_ddb')

def stream_to_connection(connection_id, content):
    try:
        gateway_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps({"type": "stream", "content": content}).encode('utf-8')
        )
    except Exception as e:
        print(f"Error streaming: {str(e)}")

def generate_session_name(user_message):
    try:
        response = bedrock_runtime.invoke_model(
            modelId='anthropic.claude-3-haiku-20240307-v1:0',
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1000,
                "temperature": 0.1,
                "messages": [
                    {
                        "role": "user",
                        "content": f"사용자의 다음 고민을 요약해서 20자 이내의 대화 세션 이름을 생성해 줘. 따옴표를 쓰지 말아 줘: {user_message}"
                    }
                ]
            })
        )
        response_body = json.loads(response['body'].read())
        session_name = response_body['content'][0]['text'].strip()
        return session_name
    except Exception as e:
        print(f"Error generating session name: {str(e)}")
        return "새 대화"

def update_session_name(user_id, session_id, new_name):
    response = table.update_item(
        Key={'UserId': user_id, 'SessionId': session_id},
        UpdateExpression="SET SessionName = :name",
        ExpressionAttributeValues={':name': new_name}
    )

def send_session_name_update(connection_id, new_name):
    gateway_client.post_to_connection(
        ConnectionId=connection_id,
        Data=json.dumps({"type": "session_name_update", "name": new_name}).encode('utf-8')
    )

def lambda_handler(event, context):
    connection_id = event['requestContext']['connectionId']
    body = json.loads(event['body'])
    user_message = body['message']
    user_id = body['userId']
    session_id = body['sessionId']

    try:
        # DynamoDB에서 세션 정보 가져오기
        response = table.get_item(Key={'UserId': user_id, 'SessionId': session_id})
        
        if 'Item' not in response:
            raise Exception("Session not found")

        existing_item = response['Item']
        history_data = existing_item.get('History', '[]')
        existing_messages = json.loads(history_data)

        # 첫 메시지인 경우 세션 이름 생성
        if len(existing_messages) == 1 and user_message != "":
            new_session_name = generate_session_name(user_message)
            update_session_name(user_id, session_id, new_session_name)
            send_session_name_update(connection_id, new_session_name)

        # 대화 내역을 세션 속성으로 변환
        conversation_json = json.dumps(existing_messages)

        # Bedrock Agent 호출 시 세션 속성으로 대화 내역 전달
        agent_response = bedrock_agent_runtime.invoke_agent(
            agentId='IYS2YDOSEA',
            agentAliasId='K70SAWBLL5',
            sessionId=session_id,
            inputText=user_message,
            sessionState={
                "sessionAttributes": {
                    "conversation_history": conversation_json
                }
            }
        )

        # 응답 스트리밍
        full_response = ""
        for event in agent_response['completion']:
            if 'chunk' in event:
                chunk = event['chunk']['bytes'].decode('utf-8')
                stream_to_connection(connection_id, chunk)
                full_response += chunk

        current_time = datetime.now().isoformat()
        
        # 히스토리 업데이트
        existing_messages.append({"type": "human", "content": user_message})
        existing_messages.append({"type": "ai", "content": full_response})
        updated_history = json.dumps(existing_messages)

        # DynamoDB 업데이트
        table.update_item(
            Key={'UserId': user_id, 'SessionId': session_id},
            UpdateExpression="SET History = :history, LastUpdatedAt = :last_updated_at",
            ExpressionAttributeValues={
                ':history': updated_history,
                ':last_updated_at': current_time
            }
        )

        # 완료 메시지 전송
        gateway_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps({"type": "end"}).encode('utf-8')
        )
        
        return {'statusCode': 200}

    except Exception as e:
        print(f"Error: {str(e)}")
        print(f"Error type: {type(e).__name__}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        gateway_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps({"type": "error", "message": str(e)}).encode('utf-8')
        )
        return {'statusCode': 500}