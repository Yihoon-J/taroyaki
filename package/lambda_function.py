import json
import requests
import jwt
from jwt import InvalidTokenError

def lambda_handler(event, context):
    # Check if Authorization header exists
    token = event.get('headers', {}).get('Authorization', None)
    if not token:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Authorization token missing'})
        }
    
    # Verify and decode the token
    try:
        region = "us-east-1"
        user_pool_id = "us-east-1_ofS2k3zkI"
        client_id = "76pqubnjqg6o5ng1l3235j27sl"
        keys_url = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json"
        
        # Fetch JWKS keys from Cognito
        response = requests.get(keys_url)
        jwks = response.json()
        
        # Decode token
        decoded_token = jwt.decode(
            token,
            jwt.PyJWKClient(keys_url).get_signing_key_from_jwt(token).key,
            algorithms=["RS256"],
            audience=client_id,
            options={"verify_exp": True}
        )
        
        # Extract user information
        username = decoded_token.get('cognito:username', 'N/A')
        email = decoded_token.get('email', 'N/A')
        
        return {
            'statusCode': 200,
            'body': json.dumps({'name': username, 'email': email})
        }
    except InvalidTokenError as e:
        print('Error 401', str(e))
        return {
            'statusCode': 401,
            'body': json.dumps({'error': 'Invalid token', 'message': str(e)})
        }
    except Exception as e:
        print('Error 500', str(e))
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Internal server error', 'message': str(e)})
        }
