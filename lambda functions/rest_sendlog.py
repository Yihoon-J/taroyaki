import json
import boto3
from datetime import datetime
import os

# AWS 서비스 클라이언트 초기화
s3 = boto3.client('s3')
firehose = boto3.client('firehose')

# 환경 변수에서 S3 버킷 이름 가져오기
BUCKET_NAME = os.environ.get('LOG_BUCKET_NAME', 'yihoon-tarothat-bucket')
FIREHOSE_STREAM = os.environ.get('FIREHOSE_STREAM_NAME', 'Taroyaki-logs-Firehose')

def lambda_handler(event, context):
    try:
        # API Gateway에서 전달된 이벤트 본문 파싱
        body = json.loads(event['body']) if isinstance(event.get('body'), str) else event.get('body', {})
        events = body.get('events', [])
        
        if not events:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'message': '이벤트가 없습니다',
                    'success': False
                })
            }
        
        # Firehose로 이벤트 전송
        send_events_to_firehose(events, context)
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'message': '로그 저장 성공',
                'count': len(events),
                'success': True
            })
        }
    except Exception as e:
        print(f"로그 처리 오류: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'message': f'서버 오류: {str(e)}',
                'success': False
            })
        }

def send_events_to_firehose(events, context):
    """Kinesis Firehose로 이벤트 전송"""
    try:
        # 각 이벤트를 Firehose에 개별 레코드로 전송
        records = []
        for event in events:
            # 타임스탬프가 없으면 추가
            if 'timestamp' not in event:
                event['timestamp'] = datetime.now().isoformat()
            # 서버 측에서 추가하는 메타데이터
            event['server_processed_at'] = datetime.now().isoformat()
            event['aws_request_id'] = context.aws_request_id
            
            # Firehose 레코드 형식
            records.append({
                'Data': json.dumps(event) + '\n'
            })
        
        # 배치로 전송 (최대 500개까지 가능)
        # 500개 이상의 레코드가 있는 경우 청크로 나누어 전송
        chunk_size = 500
        for i in range(0, len(records), chunk_size):
            chunk = records[i:i + chunk_size]
            response = firehose.put_record_batch(
                DeliveryStreamName=FIREHOSE_STREAM,
                Records=chunk
            )
            
            # 실패한 레코드 확인
            failed_count = response.get('FailedPutCount', 0)
            if failed_count > 0:
                print(f"경고: 청크 {i // chunk_size + 1}에서 {failed_count}개의 레코드가 Firehose에 전송되지 않음")
            
            print(f"청크 {i // chunk_size + 1}: {len(chunk) - failed_count}개 이벤트가 Firehose로 전송됨")
        
        return True
    except Exception as e:
        print(f"Firehose 전송 오류: {str(e)}")
        raise