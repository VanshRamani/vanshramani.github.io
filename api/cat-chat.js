const DEFAULT_MODEL = "gemini-2.0-flash-lite";

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  if (req.body) {
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function buildPrompt(question, context) {
  return [
    "You are the tiny orange research cat living on Vansh Ramani's personal website.",
    "Answer questions about Vansh using only the provided website context.",
    "Be concise, warm, playful, and factual. If the answer is not in the context, say you do not know from the website yet.",
    "Never invent awards, publications, dates, jobs, or contact details.",
    "",
    "Website context:",
    context || "No context provided.",
    "",
    "Question:",
    question
  ].join("\n");
}

async function callGemini({ apiKey, model, question, context }) {
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model || DEFAULT_MODEL) +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt(question, context) }]
        }
      ],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 220
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error("Gemini request failed: " + response.status + " " + text);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
}

async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    sendJson(res, 501, { error: "GEMINI_API_KEY is not configured" });
    return;
  }

  try {
    const body = await readJson(req);
    const question = String(body.question || "").trim();
    const context = String(body.context || "").slice(0, 12000);

    if (!question) {
      sendJson(res, 400, { error: "Missing question" });
      return;
    }

    const answer = await callGemini({
      apiKey,
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
      question,
      context
    });

    sendJson(res, 200, {
      answer: answer || "mrrp. I could not find that in the website context."
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Cat chat failed" });
  }
}

module.exports = handler;
module.exports.callGemini = callGemini;
module.exports.DEFAULT_MODEL = DEFAULT_MODEL;
