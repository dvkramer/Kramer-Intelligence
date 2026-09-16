import { mkdir, copyFile, cp } from "node:fs/promises";
await mkdir("public/vendor/katex", { recursive: true });
for (const [source, dest] of [
  ["marked/lib/marked.umd.js", "marked.umd.js"],
  ["marked/LICENSE", "marked-LICENSE"],
  ["dompurify/dist/purify.min.js", "purify.min.js"],
  ["dompurify/LICENSE", "dompurify-LICENSE"],
  ["katex/dist/katex.min.js", "katex/katex.min.js"],
  ["katex/dist/katex.min.css", "katex/katex.min.css"],
  ["katex/dist/contrib/auto-render.min.js", "katex/auto-render.min.js"],
  ["katex/LICENSE", "katex/LICENSE"],
])
  await copyFile(`node_modules/${source}`, `public/vendor/${dest}`);
await cp("node_modules/katex/dist/fonts", "public/vendor/katex/fonts", {
  recursive: true,
});
