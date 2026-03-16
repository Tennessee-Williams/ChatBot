import { Pinecone } from "@pinecone-database/pinecone";
import config from "./config.js";

async function createIndex() {
  const pc = new Pinecone({ apiKey: config.pineconeApiKey });

  const indexes = await pc.listIndexes();
  const exists = indexes.indexes?.some((idx) => idx.name === config.indexName);

  if (exists) {
    console.log(`Index '${config.indexName}' already exists.`);
  } else {
    console.log(`Creating index '${config.indexName}'...`);
    await pc.createIndex({
      name: config.indexName,
      dimension: config.embeddingDimension,
      metric: config.metric,
      spec: {
        serverless: {
          cloud: config.cloud,
          region: config.region,
        },
      },
    });

    // Wait for the index to be ready
    let ready = false;
    while (!ready) {
      const desc = await pc.describeIndex(config.indexName);
      ready = desc.status?.ready ?? false;
      if (!ready) {
        console.log("  Waiting for index to be ready...");
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    console.log(`Index '${config.indexName}' created and ready.`);
  }

  // Print index stats
  const index = pc.index(config.indexName);
  const stats = await index.describeIndexStats();
  console.log("Index stats:", stats);
}

createIndex();
