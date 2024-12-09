import streamlit as st
import basic_backend as be

st.title('안녕하세요.')
st.session_state.memory=be.buffer_memory()
st.session_state.chat_history=[]

for message in st.session_state.chat_history:
    with st.chat_message(message['role']):
        str.markdown(message['text'])

input_text=st.chat_input('input: ')
if input_text:
    with st.chat_message("나"):
        st.markdown(input_text)
    st.session_state.chat_history.append({"role":"user", "text":input_text})
    chat_response=be.conversation(text=input_text, memory=st.session_state.memory)
    
    with st.chat_message("봇"):
        st.markdown(chat_response)
    st.session_state.chat_history.append({"role":"assistant", "text": chat_response})