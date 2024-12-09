CREATE EXTENSION IF NOT EXISTS vector; -- pgvector 설치

SELECT extversion FROM pg_extension WHERE extname='vector'; --pgvector 버전 확인

-- 스키마, 롤 생성
CREATE SCHEMA bedrock_knowledgebase;
CREATE ROLE yihoon WITH PASSWORD 'kboftarotchat' LOGIN;
GRANT ALL ON SCHEMA bedrock_knowledgebase to yihoon;

-- bedrock 연동 위한 테이블 인덱스 생성
CREATE TABLE bedrock_knowledgebase.bedrock_kb (
	id uuid PRIMARY KEY,
	embedding vector(1536),
	chunks text,
	metadata json
	);

CREATE INDEX on bedrock_knowledgebase.bedrock_kb
	USING hnsw (
		embedding vector_cosine_ops
	);

DELETE TABLE bedrock_knowledge.bedrock_kb;
TRUNCATE bedrock_knwoledgebae.bedrock_kb;