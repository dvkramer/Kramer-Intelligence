// Local server only. Production keeps the existing Vercel functions/static setup.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import chat from "../api/chat.js";
import config from "../api/config.js";
import live from "../api/live-token.js";
const root = resolve("public");
const mime = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};
const demo = process.argv.includes("--demo");
const routes = {
  "/api/chat": chat,
  "/api/config": config,
  "/api/live-token": live,
};
createServer(async (req, res) => {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (value) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(value));
  };
  try {
    const url = new URL(req.url, "http://localhost");
    if (routes[url.pathname]) {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4_000_000)
          return res.status(413).json({ error: "Request too large." });
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();
      req.body = body || {};
      if (demo) {
        if (url.pathname === "/api/config")
          return res
            .status(503)
            .json({ error: "Cloud accounts are disabled in the local demo." });
        if (url.pathname === "/api/live-token")
          return res
            .status(503)
            .json({
              error:
                "Live voice requires the configured Gemini key. Local demo does not connect to Gemini.",
            });
        if (url.pathname === "/api/chat") {
          await new Promise((resolve) => setTimeout(resolve, 700));
          return res.json({
            text: 'This is a **local test response**. No request was sent to Gemini.\n\n| Feature | Status |\n|---|---|\n| Complete replies | Ready |\n| Cloud data format | Preserved |\n\n```js\nconst greeting = "Hello";\n```\n\nMath: \\( E = mc^2 \\).',
            modelUsed: "local-test",
          });
        }
      }
      return await routes[url.pathname](req, res);
    }
    const path = resolve(
      root,
      "." +
        decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname),
    );
    if (!path.startsWith(root + "/")) return res.status(403).end();
    if (!(await stat(path)).isFile()) return res.status(404).end();
    res.setHeader(
      "Content-Type",
      mime[extname(path)] || "application/octet-stream",
    );
    res.setHeader("Cache-Control", "no-store");
    res.end(await readFile(path));
  } catch {
    res.status(404).end("Not found");
  }
}).listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
  console.log(
    `Local ${demo ? "demo" : "app"}: http://localhost:${process.env.PORT || 3000}`,
  ),
);
