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

    const topScore = results.matches.length > 0 ? (results.matches[0].score ?? 0) : 0;

    // If the best match score is too low, the question is off-topic — bail out early
    if (topScore < 0.2) {
      return res.json({
        reply: "I'm Charlie, your HR assistant for The Cox Group, and I can only help with questions about your employee benefits, HR policies, and company documents. It looks like your question falls outside that scope. Feel free to ask anything benefits- or HR-related, and I'll be happy to help!",
        sources: [],
      });
    }

    const context = results.matches
      .map((m) => m.metadata?.text ?? "")
      .join("\n\n---\n\n");

    // 3. Build conversation messages for GPT
    const systemPrompt = `You are Charlie, the HR assistant for The Cox Group. You ONLY answer questions that are directly related to The Cox Group's employee benefits, HR policies, and the company documents provided as context below.

If a question is not about HR, employee benefits, or company policies — for example, general programming help, math problems, recipes, or any other unrelated topic — you must politely decline and redirect the employee to ask an HR-related question. Do NOT answer off-topic questions, even briefly or partially.

Be warm, approachable, and professional. If an HR-related question isn't covered by the provided context, say so honestly and suggest the employee contact HR directly.

Keep responses concise but thorough. Use bullet points or numbered lists when listing multiple items.

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
