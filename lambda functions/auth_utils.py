import os
import requests
import json
import boto3
import botocore

ssm = boto3.client('ssm')
try:
    params = ssm.get_parameters_by_path(
        Path='/tarot-chat/prod',
        WithDecryption=True
    )['Parameters']
except botocore.exceptions.ClientError as e:
    print(f"Error details: {e.response}")
    raise

COGNITO_DOMAIN = next(p['Value'] for p in params if p['Name'].endswith('/cognito-domain'))
CLIENT_ID = next(p['Value'] for p in params if p['Name'].endswith('/client-id'))
CLIENT_SECRET = next(p['Value'] for p in params if p['Name'].endswith('/client-secret'))
REDIRECT_URI = next(p['Value'] for p in params if p['Name'].endswith('/redirect-uri'))


def get_cognito_public_keys():
    jwks_url = f'{COGNITO_DOMAIN}/.well-known/jwks.json'
    response = requests.get(jwks_url)
    return response.json()['keys']

def create_auth_response(response, session_id):
    return {
        'statusCode': response.get('statusCode', 200),
        'headers': {
            'Access-Control-Allow-Origin': 'https://d256c0vgw8wwge.cloudfront.net',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Set-Cookie': f'sessionId={session_id}; Secure; HttpOnly; SameSite=Lax; Path=/'
        },
        'body': json.dumps(response)
    }