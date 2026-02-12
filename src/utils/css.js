import fsSync from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadGlobalCss() {
  try {
    const cssPath = path.join(process.cwd(), "CID_HomeBase", "templates", "_SHARED", "styles.css");
    return fsSync.existsSync(cssPath) ? fsSync.readFileSync(cssPath, "utf8") : "";
  } catch (err) {
    console.error("Error loading global CSS:", err);
    return "";
  }
}
