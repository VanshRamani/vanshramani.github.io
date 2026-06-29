import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const catChat = require("./api/cat-chat.js");

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8000);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const raw = statSync(envPath).isFile()
    ? require("node:fs").readFileSync(envPath, "utf8")
    : "";

  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      return;
    }
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

function send(res, statusCode, body, contentType) {
  res.writeHead(statusCode, { "Content-Type": contentType || "text/plain; charset=utf-8" });
  res.end(body);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(root, relativePath));

  if (!filePath.startsWith(root)) {
    send(res, 403, "Forbidden");
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    send(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const body = await readFile(filePath);
  send(res, 200, body, mimeTypes[ext] || "application/octet-stream");
}

loadEnvFile();

createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/cat-chat")) {
      await catChat(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    send(res, 500, error.message || "Server error");
  }
}).listen(port, () => {
  console.log(`research cat site running at http://localhost:${port}/`);
  console.log(process.env.GEMINI_API_KEY ? "Gemini cat chat: enabled" : "Gemini cat chat: waiting for GEMINI_API_KEY");
});
