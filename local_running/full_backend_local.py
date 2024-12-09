#기본 백엔드 구조, 로컬에서 실행되도록 변경

# import os
from langchain_aws import ChatBedrock
from langchain_core.callbacks import BaseCallbackHandler
from langchain.chains import ConversationChain
# from langchain.memory import ConversationBufferMemory


class ConsoleCallbackHandler(BaseCallbackHandler):
    def on_llm_new_token(self, token: str, **kwargs):
        print(token, end='', flush=True)

# Bedrock 클라이언트 설정
# os.environ['AWS_PROFILE'] = 'yihoon'  # AWS CLI 프로파일 이름 설정
# os.environ['AWS_REGION'] = 'us-east-1'  # AWS 리전 설정

model = ChatBedrock(
    model_id="anthropic.claude-3-haiku-20240307-v1:0",
    streaming=True,
    callbacks=[ConsoleCallbackHandler()],
    model_kwargs={
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 3000,
        "temperature": 0.1
    }
)

# 메모리 설정 (로컬 메모리 사용)
memory = ConversationBufferMemory()

# 대화 체인 생성
chain = ConversationChain(llm=model, memory=memory)

# 대화 루프
while True:
    user_input = input("\nYou: ")
    if user_input.lower() in ['exit', 'quit', 'bye']:
        print("Goodbye!")
        break
    
    print("\nAssistant: ", end='')
    response = chain.predict(input=f"\n\nHuman: {user_input}\n\nAssistant:")
    print("\n")  # 응답 후 새 줄 추가