import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import config from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readTextFiles(directory) {
  const files = fs.readdirSync(directory).filter((f) => f.endsWith(".txt"));
  return files.map((filename) => {
    const text = fs.readFileSync(path.join(directory, filename), "utf-8");
    console.log(`  Loaded: ${filename} (${text.length} chars)`);
    return { filename, text };
  });
}

function toAsciiId(str) {
  return str.replace(/[^\x20-\x7E]/g, "_");
}

function chunkText(text, filename) {
  const chunks = [];
  let start = 0;
  let chunkIdx = 0;

  while (start < text.length) {
    const end = start + config.chunkSize;
    const chunkText = text.slice(start, end);

    chunks.push({
      id: `${toAsciiId(filename)}::chunk-${chunkIdx}`,
      text: chunkText,
      metadata: {
        source: filename,
        chunkIndex: chunkIdx,
      },
    });

    start += config.chunkSize - config.chunkOverlap;
    chunkIdx++;
  }

  return chunks;
}

async function generateEmbeddings(texts, openai) {
  const response = await openai.embeddings.create({
    input: texts,
    model: config.embeddingModel,
    dimensions: config.embeddingDimension,
  });
  return response.data.map((item) => item.embedding);
}

async function loadDocuments() {
  const docsDir = path.join(__dirname, "documents");

  if (!fs.existsSync(docsDir)) {
    console.error(`Error: '${docsDir}' directory not found. Add .txt files there first.`);
    return;
  }

  // Read files
  console.log("Reading documents...");
  const documents = readTextFiles(docsDir);
  if (documents.length === 0) {
    console.log("No .txt files found in documents/.");
    return;
  }

  // Chunk all documents
  console.log("\nChunking documents...");
  const allChunks = [];
  for (const doc of documents) {
    const chunks = chunkText(doc.text, doc.filename);
    allChunks.push(...chunks);
    console.log(`  ${doc.filename} → ${chunks.length} chunks`);
  }
  console.log(`\nTotal chunks: ${allChunks.length}`);

  // Generate embeddings in batches
  console.log("\nGenerating embeddings...");
  const openai = new OpenAI({ apiKey: config.openaiApiKey });
  const batchSize = 100;
  const allEmbeddings = [];

  for (let i = 0; i < allChunks.length; i += batchSize) {
    const batchTexts = allChunks.slice(i, i + batchSize).map((c) => c.text);
    const embeddings = await generateEmbeddings(batchTexts, openai);
    allEmbeddings.push(...embeddings);
    console.log(
      `  Embedded batch ${Math.floor(i / batchSize) + 1} (${allEmbeddings.length}/${allChunks.length})`
    );
  }

  // Upsert to Pinecone in batches
  console.log("\nUpserting to Pinecone...");
  const pc = new Pinecone({ apiKey: config.pineconeApiKey });
  const index = pc.index(config.indexName);

  const upsertBatchSize = 100;
  for (let i = 0; i < allChunks.length; i += upsertBatchSize) {
    const batch = allChunks.slice(i, i + upsertBatchSize).map((chunk, j) => ({
      id: chunk.id,
      values: allEmbeddings[i + j],
      metadata: {
        ...chunk.metadata,
        text: chunk.text, // store text for retrieval
      },
    }));
    await index.upsert(batch);
    console.log(`  Upserted batch ${Math.floor(i / upsertBatchSize) + 1}`);
  }

  // Final stats
  const stats = await index.describeIndexStats();
  console.log(`\nDone! Index now has ${stats.totalRecordCount} vectors.`);
}

loadDocuments();
