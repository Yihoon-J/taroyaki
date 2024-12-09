apikey="..."

import os
import re
import anthropic
import time

client=anthropic.Anthropic(api_key=apikey)

def read_text_file(file_path):
    with open(file_path, 'r', encoding='cp949') as file:
        return file.read()

def split_text(text, max_tokens=4000):
    paragraphs = re.split(r'\n{2,}', text)
    chunks = []
    current_chunk = ""
    
    for paragraph in paragraphs:
        if len(current_chunk) + len(paragraph) <= max_tokens:
            current_chunk += paragraph + "\n\n"
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = paragraph + "\n\n"
    if current_chunk:
        chunks.append(current_chunk.strip())
    return chunks

def process_chunk(chunk):
    response=client.messages.create(
        model="claude-3-5-sonnet-20240620",
        max_tokens=4000,
        messages=[
            {"role": "user", "content": f"이 문서는 타로 카드의 의미와 해석을 포함하고 있어. 첫 줄에는 이 카드의 이름을 '카드 이름: The Fool'과 같이 영어로 표시하고 이어서 문단 구분과 띄어쓰기를 다듬어 줘. LLM의 Knowledge Base 문서로 사용될 예정이라는 점 유의해서 정리해 주고, 답변에 다른 불필요한 멘트를 달지 말아 줘. {chunk}"}
        ]
    )
    return response.content[0].text

def main(input_file):
    text=read_text_file(input_file)
    chunks=split_text(text)[:-1]
    processed_chunks=[]
    for i, chunk in enumerate(chunks):
        print(f"{i+1}/{len(chunks)}")
        processed_chunks.append(process_chunk(chunk))
        print('12초간 호출 정지...')
        time.sleep(12)
    
    final_text="\n\n".join(processed_chunks)
    
    output_file=os.path.splitext(input_file)[0]+"_processed.txt"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(final_text)
    print(f"Processed text saved to {output_file}")
    
if __name__=="__main__":
    input_file="./card_meanings_v4.txt"
    main(input_file)