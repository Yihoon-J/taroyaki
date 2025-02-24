import json
from auth_utils import *

def lambda_handler(event, context):
    print("Full event:", json.dumps(event, indent=2))
    
    # 모든 응답에 사용할 CORS 헤더
    cors_headers = {
        'Access-Control-Allow-Origin': 'https://d256c0vgw8wwge.cloudfront.net',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Expose-Headers': 'Set-Cookie'
    }
    
    try:
        request_context = event.get('requestContext', {})
        print("Request context:", json.dumps(request_context, indent=2))
        
        authorizer = request_context.get('authorizer', {})
        print("Authorizer context:", json.dumps(authorizer, indent=2))
        
        claims = authorizer.get('claims', {})
        print("Claims:", json.dumps(claims, indent=2))

        if not authorizer:
            print("WARNING: No authorizer found in request context")
            return {
                'statusCode': 401,
                'headers': cors_headers,
                'body': json.dumps({'error': 'No authorization context'})
            }
            
        if not claims:
            print("WARNING: No claims found in authorizer context")
            return {
                'statusCode': 401,
                'headers': cors_headers,
                'body': json.dumps({'error': 'No claims found in authorizer context'})
            }

        user_info = {
            'sub': claims.get('sub'),
            'email': claims.get('email'),
            'name': claims.get('cognito:username')
        }

        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps(user_info)
        }
    except Exception as e:
        print("ERROR:", str(e))
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }