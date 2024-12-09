import json
import boto3

cognito_client = boto3.client('cognito-idp')
USER_POOL_ID = 'us-east-1_qo0eomUul'

def lambda_handler(event, context):
    print(f"Event: {json.dumps(event)}")
    
    # Check for WebSocket connection
    if event.get('requestContext', {}).get('connectionId'):
        body = json.loads(event.get('body', '{}'))
        auth_token = body.get('token')
    else:
        auth_header = event.get('headers', {}).get('Authorization')
        auth_token = auth_header.replace('Bearer ', '') if auth_header else None
    
    if not auth_token:
        print("No Authorization token found")
        return generate_policy(None, 'Deny', event['methodArn'])
    
    try:
        user_info = cognito_client.get_user(
            AccessToken=auth_token
        )
        
        print(f"User info: {json.dumps(user_info, default=str)}")
        
        return generate_policy(user_info['Username'], 'Allow', event['methodArn'], user_info)
            
    except cognito_client.exceptions.NotAuthorizedException:
        print(f"Invalid token: {auth_token}")
        return generate_policy(None, 'Deny', event['methodArn'])
    except Exception as e:
        print(f"Error: {str(e)}")
        return generate_policy(None, 'Deny', event['methodArn'])

def generate_policy(principal_id, effect, resource, user_info=None):
    policy = {
        'principalId': principal_id,
        'policyDocument': {
            'Version': '2012-10-17',
            'Statement': [{
                'Action': 'execute-api:Invoke',
                'Effect': effect,
                'Resource': resource
            }]
        }
    }
    
    if user_info:
        policy['context'] = {
            'user_id': user_info['Username'],
            'provider': 'KakaotalkOIDC',
            'sub': next((attr['Value'] for attr in user_info['UserAttributes'] if attr['Name'] == 'sub'), None)
        }
    
    print(f"Generated policy: {json.dumps(policy, default=str)}")
    return policy