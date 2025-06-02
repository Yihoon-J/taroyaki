import json
import boto3
import time
from datetime import datetime
import traceback
import uuid
import re

# Bedrock Runtime 클라이언트 초기화
bedrock_runtime = boto3.client('bedrock-runtime')
bedrock_agent_runtime = boto3.client('bedrock-agent-runtime')

gateway_client = boto3.client('apigatewaymanagementapi', endpoint_url='https://tt0ikgb3sd.execute-api.us-east-1.amazonaws.com/production')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('tarotchat_ddb')

# 재시도 설정
MAX_RETRY_ATTEMPTS = 3  # 최대 재시도 횟수
INITIAL_RETRY_DELAY = 4  # 초기 재시도 간격 (초)
BACKOFF_FACTOR = 1.5  # 재시도 간격 증가 계수

def stream_to_connection(connection_id, content, request_id=None):
    try:
        data = {
            "type": "stream",
            "content": content
        }
        # 요청 ID가 있으면 포함
        if request_id:
            data["requestId"] = request_id
            
        gateway_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(data).encode('utf-8')
        )
    except Exception as e:
        print(f"Error streaming: {str(e)}")

def is_aurora_resuming_error(error_str):
    # Aurora DB 인스턴스 재개 중 에러인지 확인
    pattern = r"Aurora DB instance.*is resuming after being auto-paused"
    return bool(re.search(pattern, str(error_str)))

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

def invoke_bedrock_agent_with_retry(connection_id, user_id, session_id, user_message, conversation_json, request_id=None):
    """Bedrock Agent 호출 함수 (재시도 로직 포함)"""
    retry_count = 0
    retry_delay = INITIAL_RETRY_DELAY
    last_error = None
    
    # 중복 요청 확인
    if request_id and is_duplicate_request(user_id, session_id, request_id):
        print(f"Duplicate request detected: {request_id}")
        gateway_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps({
                "type": "duplicate_request", 
                "requestId": request_id
            }).encode('utf-8')
        )
        return "ALREADY_PROCESSED"
    
    while retry_count < MAX_RETRY_ATTEMPTS:
        try:
            # Bedrock Agent 호출
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
            
            # 응답 스트리밍 - request_id 전달
            full_response = ""
            for event in agent_response['completion']:
                if 'chunk' in event:
                    chunk = event['chunk']['bytes'].decode('utf-8')
                    stream_to_connection(connection_id, chunk, request_id)
                    full_response += chunk
            
            # 요청 처리 완료 표시
            if request_id:
                record_request(user_id, session_id, request_id)
                
            return full_response
            
        except Exception as e:
            last_error = e
            error_str = str(e)
            print(f"Agent 호출 에러 (시도 {retry_count+1}/{MAX_RETRY_ATTEMPTS}): {error_str}")
            
            # Aurora DB 재개 중 에러인 경우 재시도
            if is_aurora_resuming_error(error_str):
                retry_count += 1
                
                # 클라이언트에 재시도 중임을 알림 - 요청 ID 포함
                try:
                    gateway_client.post_to_connection(
                        ConnectionId=connection_id,
                        Data=json.dumps({
                            "type": "error", 
                            "message": error_str,
                            "retry_info": {
                                "current_attempt": retry_count,
                                "max_attempts": MAX_RETRY_ATTEMPTS,
                                "delay": retry_delay * BACKOFF_FACTOR
                            },
                            "requestId": request_id
                        }).encode('utf-8')
                    )
                except Exception as notify_err:
                    print(f"Error notifying client: {str(notify_err)}")
                
                # 재시도 전 대기 (지수 백오프)
                time.sleep(retry_delay)
                retry_delay *= BACKOFF_FACTOR
            else:
                # 다른 유형의 에러면 재시도하지 않고 바로 예외 발생
                raise e
    
    # 최대 재시도 횟수 초과 시 마지막 에러 다시 발생
    raise last_error

# 세션 초기화 처리 함수 (새로 추가)
def handle_init_session(connection_id, user_id, session_id):
    """
    세션 초기화 처리 - 세션 정보와 대화 내역을 클라이언트에 전송
    """
    try:
        # DynamoDB에서 세션 정보 가져오기
        response = table.get_item(Key={'UserId': user_id, 'SessionId': session_id})
        
        if 'Item' not in response:
            raise Exception(f"Session not found: {session_id}")

        existing_item = response['Item']
        history_data = existing_item.get('History', '[]')
        session_name = existing_item.get('SessionName', '새 대화')
        
        # 세션 이름 전송
        send_session_name_update(connection_id, session_name)
        
        # 대화 내역 전송
        gateway_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps({
                "type": "session_history", 
                "history": history_data
            }).encode('utf-8')
        )
        
        return True
        
    except Exception as e:
        print(f"Session initialization error: {str(e)}")
        try:
            gateway_client.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps({
                    "type": "error", 
                    "message": f"세션 초기화 중 오류가 발생했습니다: {str(e)}"
                }).encode('utf-8')
            )
        except Exception as notify_err:
            print(f"Error notifying client about session init error: {str(notify_err)}")
        
        return False

# DynamoDB에 별도 테이블 생성 필요 없이 기존 항목에 추가 속성으로 관리
def is_duplicate_request(user_id, session_id, request_id):
    response = table.get_item(Key={'UserId': user_id, 'SessionId': session_id})
    if 'Item' in response:
        processed_requests = response['Item'].get('ProcessedRequests', [])
        return request_id in processed_requests
    return False

def record_request(user_id, session_id, request_id):
    # 최근 20개 요청 ID만 유지 (공간 절약)
    table.update_item(
        Key={'UserId': user_id, 'SessionId': session_id},
        UpdateExpression="SET ProcessedRequests = list_append(if_not_exists(ProcessedRequests, :empty_list), :request_id)",
        ExpressionAttributeValues={
            ':empty_list': [],
            ':request_id': [request_id]
        }
    )
    
    # 10개로 제한 (공간 절약)
    response = table.get_item(Key={'UserId': user_id, 'SessionId': session_id})
    if 'Item' in response:
        processed_requests = response['Item'].get('ProcessedRequests', [])
        if len(processed_requests) > 20:
            table.update_item(
                Key={'UserId': user_id, 'SessionId': session_id},
                UpdateExpression="SET ProcessedRequests = :new_list",
                ExpressionAttributeValues={
                    ':new_list': processed_requests[-20:]
                }
            )

# 전역 변수로 활성 연결 추적 맵 추가
active_connections = {}  # session_id -> connection_id 매핑

def lambda_handler(event, context):
    connection_id = event['requestContext']['connectionId']
    
    # WebSocket 연결 이벤트 처리
    if event.get('requestContext', {}).get('eventType') == 'CONNECT':
        print(f"New WebSocket connection: {connection_id}")
        # 새 연결 처리 로직 추가 (필요한 경우)
        return {'statusCode': 200}
    
    # WebSocket 연결 종료 이벤트 처리
    if event.get('requestContext', {}).get('eventType') == 'DISCONNECT':
        # 연결 종료 시 연결 목록에서 제거
        for session_id, conn_id in list(active_connections.items()):
            if conn_id == connection_id:
                del active_connections[session_id]
                print(f"Removed disconnected connection for session: {session_id}")
        return {'statusCode': 200}
    
    # 메시지 처리
    try:
        body = json.loads(event['body'])
        action = body.get('action', '')
        user_id = body.get('userId')
        session_id = body.get('sessionId')
        request_id = body.get('requestId')  # 요청 ID 추출

        if not session_id or not user_id:
            raise Exception("Missing required parameters: userId and sessionId")
        
        # 고유 요청 ID 생성 (없는 경우)
        if not request_id:
            request_id = str(uuid.uuid4())
            print(f"Generated request ID: {request_id}")
        
        # 메시지 처리 전 중복 체크 (요청 ID가 있는 경우만)
        if request_id and action == 'sendMessage' and is_duplicate_request(user_id, session_id, request_id):
            # 중복 요청으로 판단하고 처리 중지
            gateway_client.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps({
                    "type": "duplicate_request", 
                    "requestId": request_id
                }).encode('utf-8')
            )
            return {'statusCode': 200}

        # 액션 타입에 따라 다른 처리
        if action == 'initSession':
            # 이미 이 세션에 대한 활성 연결이 있는지 확인
            if session_id in active_connections:
                old_conn_id = active_connections[session_id]
                if old_conn_id != connection_id:
                    print(f"New connection for existing session. Old: {old_conn_id}, New: {connection_id}")
                    try:
                        # 기존 연결에 종료 알림
                        gateway_client.post_to_connection(
                            ConnectionId=old_conn_id,
                            Data=json.dumps({
                                "type": "connection_replaced", 
                                "message": "Another client connected to this session"
                            }).encode('utf-8')
                        )
                    except Exception as e:
                        # 기존 연결이 이미 닫혔을 수 있음
                        print(f"Error notifying old connection: {str(e)}")
            
            # 현재 연결을 활성 연결로 등록
            active_connections[session_id] = connection_id
            print(f"Registered connection {connection_id} for session {session_id}")
            
            # 세션 초기화 처리
            success = handle_init_session(connection_id, user_id, session_id)
            return {'statusCode': 200 if success else 500}
            
        elif action == 'sendMessage':
            user_message = body.get('message', '')
            
            # 연결 상태 확인 및 업데이트
            if session_id in active_connections and active_connections[session_id] != connection_id:
                # 다른 연결이 이 세션을 사용 중인 경우 업데이트
                print(f"Updating connection for session {session_id}: {connection_id}")
                active_connections[session_id] = connection_id
            
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

                # 대화 내역에 사용자 메시지 추가
                existing_messages.append({"type": "human", "content": user_message})
                
                # 대화 내역을 세션 속성으로 변환
                conversation_json = json.dumps(existing_messages)

                # 재시도 로직이 포함된 함수를 사용하여 Bedrock Agent 호출 (요청 ID 전달)
                full_response = invoke_bedrock_agent_with_retry(
                    connection_id, user_id, session_id, user_message, conversation_json, request_id
                )
                
                # 이미 처리된 요청인 경우 추가 처리 없이 성공 응답
                if full_response == "ALREADY_PROCESSED":
                    return {'statusCode': 200}

                current_time = datetime.now().isoformat()
                
                # 히스토리 업데이트 (AI 응답 추가)
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

                # 완료 메시지 전송 (요청 ID 포함)
                gateway_client.post_to_connection(
                    ConnectionId=connection_id,
                    Data=json.dumps({
                        "type": "end",
                        "requestId": request_id
                    }).encode('utf-8')
                )
                
                # 이 요청을 처리된 요청으로 기록
                if request_id:
                    record_request(user_id, session_id, request_id)
                
                return {'statusCode': 200}
            except Exception as e:
                print(f"Error: {str(e)}")
                print(f"Error type: {type(e).__name__}")
                print(f"Traceback: {traceback.format_exc()}")
                
                try:
                    gateway_client.post_to_connection(
                        ConnectionId=connection_id,
                        Data=json.dumps({
                            "type": "error", 
                            "message": str(e),
                            "requestId": request_id  # 요청 ID 포함
                        }).encode('utf-8')
                    )
                except Exception as notify_err:
                    print(f"Error notifying client about error: {str(notify_err)}")
                    
                return {'statusCode': 500}
        
        else:
            # 지원하지 않는 액션
            try:
                gateway_client.post_to_connection(
                    ConnectionId=connection_id,
                    Data=json.dumps({
                        "type": "error", 
                        "message": f"지원하지 않는 액션: {action}"
                    }).encode('utf-8')
                )
            except Exception as e:
                print(f"Error sending unsupported action message: {str(e)}")
                
            return {'statusCode': 400}
            
    except Exception as e:
        print(f"Unexpected error in lambda_handler: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        
        try:
            gateway_client.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps({
                    "type": "error", 
                    "message": "서버 오류가 발생했습니다."
                }).encode('utf-8')
            )
        except Exception as notify_err:
            print(f"Error sending error notification: {str(notify_err)}")
            
        return {'statusCode': 500}