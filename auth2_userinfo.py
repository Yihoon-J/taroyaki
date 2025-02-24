import json
import base64

def decode_jwt_payload(token):
    try:
        # Get payload part (second segment) of JWT
        payload = token.split('.')[1]
        # Add padding if needed
        payload += '=' * (4 - len(payload) % 4)
        # Decode base64
        decoded = base64.b64decode(payload)
        return json.loads(decoded)
    except Exception as e:
        raise ValueError(f"Invalid token format: {str(e)}")

def lambda_handler(event, context):
    try:
        # Get token from Authorization header
        token = event['headers'].get('Authorization')
        if not token:
            return {
                'statusCode': 401,
                'body': json.dumps({'message': 'No authorization token provided'})
            }
        
        # Decode JWT payload
        decoded = decode_jwt_payload(token)
        
        # Extract user info
        user_info = {
            'name': decoded.get('cognito:username'),
            'email': decoded.get('email')
        }
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            'body': json.dumps(user_info)
        }
    
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'message': str(e)})
        }