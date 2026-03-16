import "dotenv/config";

const config = {
  // API Keys
  pineconeApiKey: process.env.PINECONE_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,

  // Pinecone settings
  indexName: "acme-hr",
  embeddingDimension: 1024, // text-embedding-3-large (reduced dimensions)
  metric: "cosine",
  cloud: "aws",
  region: "us-east-1",

  // OpenAI embedding model
  embeddingModel: "text-embedding-3-large",

  // Document chunking settings
  chunkSize: 2000,    // characters per chunk
  chunkOverlap: 200,  // overlapping characters between chunks

  // Query settings
  topK: 5,
};

export default config;
