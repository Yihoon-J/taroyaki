import json
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
            return create_auth_response({'error': 'Not authenticated'}, None)
            
        session = session_manager.get_session(session_id)
        if not session:
            return create_auth_response({'error': 'Invalid session'}, None)
            
        # 토큰 만료 확인
        if session['Tokens']['token_expiry'] < time.time():
            session_manager.delete_session(session_id)
            return create_auth_response({'error': 'Session expired'}, None)
            
        return create_auth_response(session['UserInfo'], session_id)
        
    except Exception as e:
        return create_auth_response({'error': str(e)}, None)