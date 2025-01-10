import json
import uuid
import time
from session_manager import SessionManager
from auth_utils import *
import base64
from jose import jwt
import requests
import traceback

def lambda_handler(event, context):
    session_manager = SessionManager()
    print('Received event:', json.dumps(event, indent=2))
    print('Environment variables:', {
        'COGNITO_DOMAIN': COGNITO_DOMAIN,
        'CLIENT_ID': CLIENT_ID,
        'REDIRECT_URI': REDIRECT_URI
    })

    try:
        # 1. 요청 바디 파싱 및 검증
        if isinstance(event, dict):
            code = event.get('code')
            if not code and event.get('body'):
                body = json.loads(event.get('body')) if isinstance(event.get('body'), str) else event.get('body')
                code = body.get('code')
        else:
            code = None
            
        print('Extracted code:', code)
        
        if not code:
            return create_auth_response({'error': 'No authorization code provided'}, None)

        # 2. 토큰 교환 준비
        token_endpoint = f"{COGNITO_DOMAIN}/oauth2/token"
        auth_header = base64.b64encode(
            f"{CLIENT_ID}:{CLIENT_SECRET}".encode('utf-8')
        ).decode('utf-8')
        
        data = {
            'grant_type': 'authorization_code',
            'client_id': CLIENT_ID,
            'code': code,
            'redirect_uri': REDIRECT_URI
        }

        print('Token exchange request:', {
            'endpoint': token_endpoint,
            'data': {**data, 'code': code[:10] + '...'},
            'headers': {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic <hidden>'
            }
        })

        # 3. 토큰 교환 요청
        try:
            response = requests.post(
                token_endpoint,
                headers={
                    'Authorization': f'Basic {auth_header}',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data=data
            )
            print('Token exchange response status:', response.status_code)
            print('Token exchange response headers:', dict(response.headers))
            
            if not response.ok:
                print('Token exchange error response:', response.text)
                error_detail = json.loads(response.text) if response.text else {}
                return create_auth_response({
                    'error': 'Token exchange failed',
                    'details': error_detail
                }, None)

        except requests.RequestException as e:
            print('Request error:', str(e))
            return create_auth_response({'error': 'Failed to connect to Cognito'}, None)

        # 4. 응답 처리
        try:
            tokens = response.json()
            print('Received tokens with keys:', list(tokens.keys()))
            print('Access token preview:', tokens['access_token'][:20] + '...')
        except json.JSONDecodeError as e:
            print('Error parsing token response:', str(e))
            return create_auth_response({'error': 'Invalid token response'}, None)

        # 5. ID 토큰 디코딩
        try:
            id_token = tokens.get('id_token')
            if not id_token:
                print('No id_token in response')
                return create_auth_response({'error': 'No ID token in response'}, None)

            # jose.jwt.decode 대신 jwt 헤더와 페이로드만 디코딩
            id_token_parts = id_token.split('.')
            if len(id_token_parts) != 3:
                print('Invalid JWT format')
                return create_auth_response({'error': 'Invalid ID token format'}, None)
                
            # 페이로드(두 번째 부분) 디코딩
            payload = id_token_parts[1]
            payload += '=' * ((4 - len(payload) % 4) % 4)  # 패딩 추가
            try:
                user_info = json.loads(base64.urlsafe_b64decode(payload).decode('utf-8'))
                print('Decoded user info:', {
                    'email': user_info.get('email'),
                    'sub': user_info.get('sub')[:5] + '...'
                })
            except Exception as e:
                print('Error decoding payload:', str(e))
                return create_auth_response({'error': 'Failed to decode token payload'}, None)

        except Exception as e:
            print('Error decoding ID token:', str(e))
            return create_auth_response({'error': 'Failed to decode ID token'}, None)

        # 6. 세션 생성
        try:
            session_id = str(uuid.uuid4())
            session_data = {
                'name': user_info.get('nickname') or user_info.get('email'),
                'email': user_info.get('email'),
                'sub': user_info.get('sub')
            }
            print('Creating session with ID:', session_id)
            print('Session user data:', {
                'name': session_data['name'],
                'email': session_data['email'],
                'sub': session_data['sub'][:5] + '...'
            })
            print('Session tokens preview:', {
                'access_token': tokens['access_token'][:20] + '...',
                'token_expiry': int(time.time() + tokens['expires_in'])
            })

            session_manager.create_session(
                session_id=session_id,
                user_info=session_data,
                tokens={
                    'access_token': tokens['access_token'],
                    'refresh_token': tokens['refresh_token'],
                    'token_expiry': int(time.time() + tokens['expires_in'])
                }
            )
            print('Session successfully created in DynamoDB')

        except Exception as e:
            print('Error creating session:', str(e))
            return create_auth_response({'error': 'Failed to create session'}, None)

        # 7. 성공 응답
        response = {
            'success': True,
            'access_token': tokens['access_token'],
            'expires_in': tokens['expires_in']
        }
        print('Preparing auth response with session ID:', session_id)
        final_response = create_auth_response(response, session_id)
        print('Final response headers:', final_response['headers'])
        print('Final response status code:', final_response['statusCode'])
        return final_response
        
    except Exception as e:
        print('Unexpected error:', str(e))
        print('Traceback:', traceback.format_exc())
        return create_auth_response({'error': f'Internal server error: {str(e)}'}, None)