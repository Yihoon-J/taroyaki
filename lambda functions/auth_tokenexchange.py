import json
import uuid
import time
from auth_utils import *
import base64
from jose import jwt
import requests
import traceback

def create_auth_response(body, cookies=None):
    response = {
        'statusCode': 200 if body.get('success') else 400,
        'headers': {
            'Access-Control-Allow-Origin': 'https://d256c0vgw8wwge.cloudfront.net',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
        },
        'body': json.dumps(body)
    }
    
    if cookies:
        response['headers']['Set-Cookie'] = cookies
        
    return response

def lambda_handler(event, context):
    print('Received event:', json.dumps(event, indent=2))
    print('Environment variables:', {
        'COGNITO_DOMAIN': COGNITO_DOMAIN,
        'CLIENT_ID': CLIENT_ID,
        'REDIRECT_URI': REDIRECT_URI
    })

    try:
        # 1. 요청 바디 파싱 및 검증 (이전과 동일)
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
        
        # Auth 헤더 생성 과정 로깅
        auth_header_raw = f"{CLIENT_ID}:{CLIENT_SECRET}"
        print('Auth header components:')
        print(f'- Length of CLIENT_ID: {len(CLIENT_ID)}')
        print(f'- Length of CLIENT_SECRET: {len(CLIENT_SECRET)}')
        print(f'- Raw auth header length: {len(auth_header_raw)}')
        
        auth_header = base64.b64encode(auth_header_raw.encode('utf-8')).decode('utf-8')
        print(f'- Encoded auth header length: {len(auth_header)}')
        print(f'- First 10 chars of encoded header: {auth_header[:10]}...')
        
        data = {
            'grant_type': 'authorization_code',
            'client_id': CLIENT_ID,
            'code': code,
            'redirect_uri': REDIRECT_URI
        }

        # 요청 세부사항 로깅
        print('Token exchange request details:')
        print(f'- Endpoint: {token_endpoint}')
        print(f'- Request data: {json.dumps({**data, "code": code[:10] + "..."})}')
        print('- Headers:')
        print('  * Content-Type: application/x-www-form-urlencoded')
        print('  * Authorization: Basic <first 10 chars>:', f'Basic {auth_header[:10]}...')

        print('Token exchange request validation:')
        print(f'COGNITO_DOMAIN: {COGNITO_DOMAIN}')
        print(f'Token endpoint: {token_endpoint}')
        print(f'Redirect URI: {REDIRECT_URI}')
        print(f'Code length: {len(code) if code else 0}')
        print(f'Request data: {json.dumps({k:v if k != "code" else v[:10]+"..." for k,v in data.items()})}')

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
            print('\nToken exchange response:')
            print(f'- Status code: {response.status_code}')
            print(f'- Headers: {dict(response.headers)}')
            print(f'- Raw response body: {response.text}')
            print('Token exchange response validation:')
            print(f'Response status: {response.status_code}')
            print(f'Response headers: {dict(response.headers)}')
            print(f'Response content length: {len(response.content)}')
            try:
                response_text = response.text
                print(f'Raw response text: {response_text[:200]}...')  # 앞부분만 출력
            except Exception as e:
                print(f'Error reading response text: {str(e)}')


            if not response.ok:
                error_detail = json.loads(response.text) if response.text else {}
                print(f'- Error details: {error_detail}')
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

        # 7. 성공 응답
        response = {
            'success': True,
            'access_token': tokens['access_token'],
            'id_token': tokens['id_token'],
            'refresh_token': tokens['refresh_token'],
            'expires_in': tokens['expires_in']
        }
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': 'https://d256c0vgw8wwge.cloudfront.net',
                'Access-Control-Allow-Credentials': 'true',
                'Access-Control-Allow-Methods': 'POST,OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
            },
            'body': json.dumps(response)
        }
        
    except Exception as e:
        print('Unexpected error:', str(e))
        print('Traceback:', traceback.format_exc())
        return create_auth_response({'error': f'Internal server error: {str(e)}'}, None)