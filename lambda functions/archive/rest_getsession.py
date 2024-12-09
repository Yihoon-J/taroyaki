import json
import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('tarotchat_ddb')

def lambda_handler(event, context):
    print("Full event:", json.dumps(event))
    
    try:
        user_id = event.get('queryStringParameters', {}).get('userId')
        
        if not user_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'UserId is required'}),
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            }
        
        # Query the main table instead of a secondary index
        response = table.query(
            KeyConditionExpression=Key('UserId').eq(user_id),
            ScanIndexForward=False,  # This will sort by SessionID in descending order
            Limit=10  # Limit to the 10 most recent sessions
        )
        
        sessions = response['Items']
        sessions = sorted(sessions, key=lambda x: x.get('LastUpdatedAt', ''), reverse=True)
        
        return {
            'statusCode': 200,
            'body': json.dumps(sessions),
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)}),
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        }