import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple in-memory cache to keep things fast
const cache = new Map();

function readFileCached(absPath) {
  const key = absPath;
  // Check if file exists first
  if (!fs.existsSync(absPath)) {
      throw new Error(`CRITICAL MISSING FILE: ${absPath}`);
  }

  const stat = fs.statSync(absPath);
  const mtime = stat.mtimeMs;

  const cached = cache.get(key);
  if (cached && cached.mtime === mtime) return cached.content;

  const content = fs.readFileSync(absPath, "utf8").trim();
  cache.set(key, { mtime, content });
  return content;
}

export function loadPrompts(segmentName) {
  // Move up one level from 'services' to 'src', then into 'prompts'
  const promptsDir = path.join(__dirname, "..", "prompts");

  // We support flat structure (your current setup) or nested 'segments'
  // Let's stick to your current 'src/prompts/plumber.md' for simplicity unless you move them
  const globalSystemPath = path.join(promptsDir, "global_system.md");
  
  // Dynamic Segment Loading
  const segmentPath = path.join(promptsDir, `${segmentName}.md`); 

  const globalSystem = readFileCached(globalSystemPath);
  const segmentPersona = readFileCached(segmentPath);

  return { globalSystem, segmentPersona };
}
