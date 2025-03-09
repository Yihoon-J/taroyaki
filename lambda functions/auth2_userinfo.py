import json
import base64
import boto3

def decode_jwt_payload(token):
    try:
        payload = token.split('.')[1]
        payload += '=' * (4 - len(payload) % 4)
        decoded = base64.b64decode(payload)
        return json.loads(decoded)
    except Exception as e:
        raise ValueError(f"Invalid token format: {str(e)}")

def get_user_attributes(username, user_pool_id):
    cognito = boto3.client('cognito-idp')
    try:
        response = cognito.admin_get_user(
            UserPoolId=user_pool_id,
            Username=username
        )
        # Convert attributes list to dictionary
        attributes = {attr['Name']: attr['Value'] for attr in response['UserAttributes']}
        return attributes
    except Exception as e:
        raise ValueError(f"Error fetching user attributes: {str(e)}")

def lambda_handler(event, context):
    try:
        token = event['headers'].get('Authorization')
        if not token:
            return {
                'statusCode': 401,
                'body': json.dumps({'message': 'No authorization token provided'})
            }
        
        decoded = decode_jwt_payload(token)
        
        # Get username from decoded token
        username = decoded.get('cognito:username')
        
        # Get user attributes from Cognito
        user_pool_id = 'us-east-1_ofS2k3zkI'  # YOUR_USER_POOL_ID
        user_attributes = get_user_attributes(username, user_pool_id)
        
        user_info = {
            'name': username,
            'email': decoded.get('email'),
            'nickname': user_attributes.get('nickname')
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