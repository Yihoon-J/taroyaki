import boto3

# Create a DynamoDB resource
dynamodb = boto3.resource('dynamodb')

# Get the table
table = dynamodb.Table('tarotchat_ddb')

# Delete the table
table.delete()