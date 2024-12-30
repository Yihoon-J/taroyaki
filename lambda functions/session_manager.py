import boto3
import time

class SessionManager:
    def __init__(self):
        self.dynamodb = boto3.resource('dynamodb')
        self.table = self.dynamodb.Table('tarotchat_authsessions')
        
    def create_session(self, session_id, user_info, tokens):
        expires_at = int(time.time() + (5 * 24 * 60 * 60))  # 5일 후 만료
        
        item = {
            'SessionId': session_id,
            'UserId': user_info['sub'],
            'UserInfo': user_info,
            'Tokens': tokens,
            'ExpiresAt': expires_at
        }
        
        self.table.put_item(Item=item)
        return session_id
        
    def get_session(self, session_id):
        response = self.table.get_item(Key={'SessionId': session_id})
        return response.get('Item')
        
    def delete_session(self, session_id):
        self.table.delete_item(Key={'SessionId': session_id})
        
    def update_tokens(self, session_id, new_tokens):
        self.table.update_item(
            Key={'SessionId': session_id},
            UpdateExpression='SET Tokens = :tokens',
            ExpressionAttributeValues={':tokens': new_tokens}
        )