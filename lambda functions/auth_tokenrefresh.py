import json
import time
from session_manager import SessionManager
from auth_utils import *

def lambda_handler(event, context):
    session_manager = SessionManager()
    
    try:
        # 쿠키에서 세션 ID 추출
        cookies = event.get('headers', {}).get('Cookie', '')
        session_id = next(
            (c.split('=')[1] for c in cookies.split(';') 
             if c.strip().startswith('sessionId=')),
            None
        )
        
        if not session_id:
            return create_auth_response({'error': 'No refresh token available'}, None)
            
        session = session_manager.get_session(session_id)
        if not session:
            return create_auth_response({'error': 'Invalid session'}, None)
            
        refresh_token = session['Tokens'].get('refresh_token')
        if not refresh_token:
            session_manager.delete_session(session_id)
            return create_auth_response({'error': 'No refresh token found'}, None)

        # Cognito 토큰 리프레시
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
                'grant_type': 'refresh_token',
                'client_id': CLIENT_ID,
                'refresh_token': refresh_token
            }
        )
        
        if not response.ok:
            session_manager.delete_session(session_id)
            return create_auth_response({'error': 'Token refresh failed'}, None)

        new_tokens = response.json()
        
        # 세션의 토큰 정보 업데이트
        session_manager.update_tokens(session_id, {
            'access_token': new_tokens['access_token'],
            'refresh_token': refresh_token,  # 기존 refresh token 유지
            'token_expiry': int(time.time() + new_tokens['expires_in'])
        })
        
        return create_auth_response({
            'success': True,
            'access_token': new_tokens['access_token'],
            'expires_in': new_tokens['expires_in']
        }, session_id)
        
    except Exception as e:
        return create_auth_response({'error': str(e)}, None)