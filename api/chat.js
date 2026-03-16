import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const INDEX_NAME = "acme-hr";
const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSION = 1024;
const TOP_K = 5;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
const index = pc.index(INDEX_NAME);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message, history } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Message is required." });
  }

  try {
    // 1. Embed the user's question
    const embeddingResponse = await openai.embeddings.create({
      input: [message],
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSION,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 2. Query Pinecone for relevant context
    const results = await index.query({
      vector: queryEmbedding,
      topK: TOP_K,
      includeMetadata: true,
    });

    const context = results.matches
      .map((m) => m.metadata?.text ?? "")
      .join("\n\n---\n\n");

    // 3. Build conversation messages for GPT
    const systemPrompt = `You are Charlie, the friendly and helpful HR assistant for The Cox Group. You answer employee questions using the company documents provided as context. Be warm, approachable, and professional. If the answer isn't in the provided context, say so honestly and suggest the employee contact HR directly.

Keep responses concise but thorough. Use bullet points or numbered lists when listing multiple items. Add a touch of personality — you're helpful and upbeat, but not over the top.

Context from company documents:
${context}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(history || []).slice(-10),
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0.7,
      max_tokens: 800,
    });

    const reply = completion.choices[0].message.content;
    const sources = results.matches
      .filter((m) => m.score > 0.3)
      .map((m) => m.metadata?.source ?? "Unknown");

    res.json({ reply, sources: [...new Set(sources)] });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
