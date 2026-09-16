import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
async function check(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${item.name}`;
    if (item.isDirectory()) {
      if (!["vendor", "node_modules", ".git"].includes(item.name))
        await check(path);
    } else if (path.endsWith(".js")) {
      const result = spawnSync(process.execPath, ["--check", path], {
        stdio: "inherit",
      });
      if (result.status) process.exit(result.status);
    }
  }
}
await check(".");
console.log("JavaScript syntax checks passed.");
