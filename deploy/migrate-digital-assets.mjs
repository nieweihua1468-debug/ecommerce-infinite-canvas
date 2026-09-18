import fs from "node:fs/promises";
import path from "node:path";
import { migrateDigitalAssetRecords } from "../server/digital-asset-storage.js";

const root = process.cwd();
const file = path.join(root, "data", "digital_assets.json");
const raw = await fs.readFile(file, "utf8");
const current = JSON.parse(raw);
const result = await migrateDigitalAssetRecords(current);

if (!result.changed) {
  console.log(`数字资产无需迁移：${current.length} 条记录`);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${file}.before-blob-migration-${stamp}.bak`;
const temp = `${file}.${process.pid}.tmp`;
await fs.copyFile(file, backup);
await fs.writeFile(temp, JSON.stringify(result.assets, null, 2));
await fs.rename(temp, file);
console.log(
  `数字资产迁移完成：${result.assets.length} 条记录，原文件备份 ${backup}`,
);


