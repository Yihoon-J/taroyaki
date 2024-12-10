from flask import Flask, jsonify, request, session
from flask_cors import CORS
import requests
import jwt
import base64
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=['http://localhost:3001', 'http://localhost:3002'])
app.secret_key = os.getenv('FLASK_SECRET_KEY')
app.config.update(
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_DOMAIN='localhost',
    SESSION_COOKIE_PATH='/',
    PERMANENT_SESSION_LIFETIME=timedelta(days=5)
)

COGNITO_DOMAIN = os.getenv('COGNITO_DOMAIN')
CLIENT_ID = os.getenv('CLIENT_ID')
CLIENT_SECRET = os.getenv('CLIENT_SECRET')
REDIRECT_URI = os.getenv('REDIRECT_URI')

@app.route('/auth/token', methods=['POST'])
def get_token():
    try:
        code = request.json.get('code')
        if not code:
            return jsonify({'error': 'No authorization code provided'}), 400

        # Cognito 토큰 엔드포인트에 요청
        token_endpoint = f"{COGNITO_DOMAIN}/oauth2/token"
        auth_header = base64.b64encode(
            f"{CLIENT_ID}:{CLIENT_SECRET}".encode('utf-8')
        ).decode('utf-8')
        
        headers = {
            'Authorization': f'Basic {auth_header}',
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        
        data = {
            'grant_type': 'authorization_code',
            'client_id': CLIENT_ID,
            'code': code,
            'redirect_uri': REDIRECT_URI
        }
        
        response = requests.post(token_endpoint, headers=headers, data=data)
        if not response.ok:
            return jsonify({'error': 'Token exchange failed'}), response.status_code

        tokens = response.json()
        
        # ID 토큰에서 사용자 정보 추출
        id_token = tokens.get('id_token')
        user_info = jwt.decode(id_token, options={"verify_signature": False})
        
        # 세션에 사용자 정보 저장
        session.permanent = True
        session['tokens'] = {
            'access_token': tokens['access_token'],
            'refresh_token': tokens['refresh_token'],
            'token_expiry': datetime.now() + timedelta(seconds=tokens['expires_in'])
        }
        session['user'] = {
            'name': user_info.get('nickname') or user_info.get('email'),
            'email': user_info.get('email'),
            'sub': user_info.get('sub')
        }
        
        return jsonify({
            'success': True,
            'access_token': tokens['access_token'],
            'expires_in': tokens['expires_in']
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/auth/refresh', methods=['POST'])
def refresh_token():
    try:
        if 'tokens' not in session:
            return jsonify({'error': 'No refresh token available'}), 401

        refresh_token = session['tokens'].get('refresh_token')
        if not refresh_token:
            return jsonify({'error': 'No refresh token found'}), 401

        token_endpoint = f"{COGNITO_DOMAIN}/oauth2/token"
        auth_header = base64.b64encode(
            f"{CLIENT_ID}:{CLIENT_SECRET}".encode('utf-8')
        ).decode('utf-8')
        
        headers = {
            'Authorization': f'Basic {auth_header}',
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        
        data = {
            'grant_type': 'refresh_token',
            'client_id': CLIENT_ID,
            'refresh_token': refresh_token
        }
        
        response = requests.post(token_endpoint, headers=headers, data=data)
        if not response.ok:
            session.clear()
            return jsonify({'error': 'Token refresh failed'}), response.status_code

        new_tokens = response.json()
        
        # 세션의 토큰 정보 업데이트
        session['tokens']['access_token'] = new_tokens['access_token']
        session['tokens']['token_expiry'] = datetime.now() + timedelta(seconds=new_tokens['expires_in'])
        
        return jsonify({
            'success': True,
            'access_token': new_tokens['access_token'],
            'expires_in': new_tokens['expires_in']
        })

    except Exception as e:
        session.clear()
        return jsonify({'error': str(e)}), 400

@app.route('/api/user-info', methods=['GET'])
def get_user_info():
    if 'user' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    return jsonify(session['user'])

@app.route('/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(port=3000)