with open('card_meanings_v3.txt', 'r', encoding='cp949', errors="backslashreplace") as f:
    content = f.read()
    content = content.replace('\\x80', ' ').replace('쪾', ' ')

with open('card_meanings_v4.txt', 'w', encoding='cp949') as f:
    f.write(content)