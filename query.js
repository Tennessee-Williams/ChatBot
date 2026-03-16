import readline from "node:readline";
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import config from "./config.js";

async function queryIndex(question) {
  // Generate embedding for the question
  const openai = new OpenAI({ apiKey: config.openaiApiKey });
  const embeddingResponse = await openai.embeddings.create({
    input: [question],
    model: config.embeddingModel,
    dimensions: config.embeddingDimension,
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;

  // Query Pinecone
  const pc = new Pinecone({ apiKey: config.pineconeApiKey });
  const index = pc.index(config.indexName);

  const results = await index.query({
    vector: queryEmbedding,
    topK: config.topK,
    includeMetadata: true,
  });

  // Display results
  console.log(`\nQuery: ${question}`);
  console.log(`Top ${config.topK} results:\n`);

  for (let i = 0; i < results.matches.length; i++) {
    const match = results.matches[i];
    const score = match.score.toFixed(4);
    const source = match.metadata?.source ?? "unknown";
    const text = match.metadata?.text ?? "";
    console.log(`--- Result ${i + 1} (score: ${score}, source: ${source}) ---`);
    console.log(text.slice(0, 300));
    console.log();
  }
}

// Get question from command line args or prompt
const question = process.argv.slice(2).join(" ");

if (question) {
  queryIndex(question);
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question("Enter your question: ", (answer) => {
    rl.close();
    queryIndex(answer);
  });
}
