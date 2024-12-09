import os
import re
import time


def read_text_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        return file.read()

def replace_text(text):
    text=text.replace('\n\n', '\n')
    text=text.replace('카드 이름:', '\n\n카드 이름:')
    text=text.replace('Card Name:', '\n\n카드 이름:')
    return text


def main(input_file):
    text=read_text_file(input_file)
    output_text=replace_text(text)
    output_file=os.path.splitext(input_file)[0]+"_replaced.txt"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(output_text)
    print(f"Processed text saved to {output_file}")
    
if __name__=="__main__":
    input_file="./card_meanings_v4_processed.txt"
    main(input_file)