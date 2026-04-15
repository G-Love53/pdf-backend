import fsSync from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadAssetBase64 = (fullPath) => {
  try {
    if (fsSync.existsSync(fullPath)) {
      const ext = path.extname(fullPath).toLowerCase();
      const base64 = fsSync.readFileSync(fullPath).toString("base64");
      if (ext === ".svg") return `data:image/svg+xml;base64,${base64}`;
      if (ext === ".png") return `data:image/png;base64,${base64}`;
    }
    return null;
  } catch (err) {
    console.warn(`Asset load warning: ${fullPath} - ${err.message}`);
    return null;
  }
};

export function getSegmentAssets(segment) {
  const targetSegment = segment ? segment.toLowerCase().trim() : "default";
  const logosRoot = path.join(
    process.cwd(),
    "CID_HomeBase",
    "templates",
    "LOGOS",
    "segments",
  );
  const legacySharedRoot = path.join(
    process.cwd(),
    "CID_HomeBase",
    "templates",
    "_shared",
    "assets",
    "segments",
  );

  const resolveAsset = (filename) => {
    const candidates = [
      path.join(logosRoot, targetSegment, filename),
      path.join(logosRoot, "default", filename),
      // Backward compatibility for prior location/casing.
      path.join(legacySharedRoot, targetSegment, filename),
      path.join(legacySharedRoot, "default", filename),
    ];
    for (const c of candidates) {
      const loaded = loadAssetBase64(c);
      if (loaded) return loaded;
    }
    return null;
  };

  return {
    logo: resolveAsset("logo.png") || resolveAsset("logo.svg"),
    signature: resolveAsset("signature.svg")
  };
}
