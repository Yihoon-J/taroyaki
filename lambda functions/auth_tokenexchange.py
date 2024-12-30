import json
import uuid
from session_manager import SessionManager
from auth_utils import *
import base64
import jwt
import requests

def lambda_handler(event, context):
    session_manager = SessionManager()
    
    try:
        body = json.loads(event.get('body', '{}'))
        code = body.get('code')
        
        if not code:
            return create_auth_response({'error': 'No authorization code provided'}, None)

        # Cognito 토큰 교환
        token_endpoint = f"{COGNITO_DOMAIN}/oauth2/token"
        auth_header = base64.b64encode(
            f"{CLIENT_ID}:{CLIENT_SECRET}".encode('utf-8')
        ).decode('utf-8')
        
        response = requests.post(
            token_endpoint,
            headers={
                'Authorization': f'Basic {auth_header}',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data={
                'grant_type': 'authorization_code',
                'client_id': CLIENT_ID,
                'code': code,
                'redirect_uri': REDIRECT_URI
            }
        )
        
        if not response.ok:
            return create_auth_response({'error': 'Token exchange failed'}, None)

        tokens = response.json()
        
        # ID 토큰에서 사용자 정보 추출
        id_token = tokens.get('id_token')
        user_info = jwt.decode(id_token, options={"verify_signature": False})
        
        # 세션 생성
        session_id = str(uuid.uuid4())
        session_manager.create_session(
            session_id=session_id,
            user_info={
                'name': user_info.get('nickname') or user_info.get('email'),
                'email': user_info.get('email'),
                'sub': user_info.get('sub')
            },
            tokens={
                'access_token': tokens['access_token'],
                'refresh_token': tokens['refresh_token'],
                'token_expiry': int(time.time() + tokens['expires_in'])
            }
        )
        
        return create_auth_response({
            'success': True,
            'access_token': tokens['access_token'],
            'expires_in': tokens['expires_in']
        }, session_id)
        
    except Exception as e:
        return create_auth_response({'error': str(e)}, None)