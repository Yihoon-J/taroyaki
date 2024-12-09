import boto3

dynamodb = boto3.resource('dynamodb')

table = dynamodb.create_table(
    TableName='tarotchat_ddb',
    KeySchema=[
        {
            'AttributeName': 'UserId',
            'KeyType': 'HASH'  # Partition key
        },
        {
            'AttributeName': 'SessionId',
            'KeyType': 'RANGE'  # Sort key
        }
    ],
    AttributeDefinitions=[
        {
            'AttributeName': 'UserId',
            'AttributeType': 'S'
        },
        {
            'AttributeName': 'SessionId',
            'AttributeType': 'S'
        },
        {
            'AttributeName': 'LastUpdatedAt',
            'AttributeType': 'S'
        }
    ],
    GlobalSecondaryIndexes=[
        {
            'IndexName': 'UserIdLastUpdatedIndex',
            'KeySchema': [
                {
                    'AttributeName': 'UserId',
                    'KeyType': 'HASH'
                },
                {
                    'AttributeName': 'LastUpdatedAt',
                    'KeyType': 'RANGE'
                }
            ],
            'Projection': {
                'ProjectionType': 'ALL'
            }
        }
    ],
    BillingMode='PAY_PER_REQUEST'
)

table.meta.client.get_waiter('table_exists').wait(TableName='tarotchat_ddb')
print(f"Table status: {table.table_status}")