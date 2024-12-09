from flask import Flask, jsonify, request, session
from flask_cors import CORS
import requests
import jwt
import base64
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=['http://localhost:3001'])
app.secret_key = os.getenv('FLASK_SECRET_KEY')
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

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
        session['user'] = {
            'name': user_info.get('nickname') or user_info.get('email'),
            'email': user_info.get('email'),
            'sub': user_info.get('sub')
        }
        
        return jsonify({'success': True})
    
    except Exception as e:
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