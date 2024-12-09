import json
import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('tarotchat_ddb')

def lambda_handler(event, context):
   print('event: ', event)
   print('Received event:', json.dumps(event))
   try:
       user_id = event.get('queryStringParameters', {}).get('userId')
       session_id = event.get('pathParameters', {}).get('sessionId')
       
       if not user_id or not session_id:
           raise ValueError("Missing userId or sessionId")

       response = table.get_item(
           Key={
               'UserId': user_id,
               'SessionId': session_id
           }
       )
       
       if 'Item' not in response:
           return {
               'statusCode': 404,
               'body': json.dumps({'error': 'Session not found'}),
               'headers': {
                   'Content-Type': 'application/json',
                   'Access-Control-Allow-Origin': '*'
               }
           }
       
       session = response['Item']
       history = session.get('History', '[]')
       
       try:
           messages = json.loads(history)
       except json.JSONDecodeError:
           print(f"Error decoding history: {history}")
           messages = []
       print('MESSAGE: ', messages)
       return {
           'statusCode': 200,
           'body': json.dumps(messages),
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