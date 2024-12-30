import json
import boto3
import os

def lambda_handler(event, context):
    try:
        ssm = boto3.client('ssm')
        params = ssm.get_parameters_by_path(
            Path='/tarot-chat/prod',
            WithDecryption=True
        )['Parameters']
        
        config = {
            'apiUrl': next(p['Value'] for p in params if p['Name'].endswith('/api-url')),
            'wsUrl': next(p['Value'] for p in params if p['Name'].endswith('/ws-url')),
            'cognitoDomain': next(p['Value'] for p in params if p['Name'].endswith('/cognito-domain')),
            'redirectUri': next(p['Value'] for p in params if p['Name'].endswith('/redirect-uri')),
            'clientId': next(p['Value'] for p in params if p['Name'].endswith('/client-id')),
        }
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': os.environ['ALLOWED_ORIGIN'],
                'Access-Control-Allow-Credentials': 'true'
            },
            'body': json.dumps(config)
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }