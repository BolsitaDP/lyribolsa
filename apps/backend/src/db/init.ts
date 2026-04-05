import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

export async function initializeDatabase(): Promise<void> {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDirPath = path.dirname(currentFilePath);
  const migrationPath = path.resolve(currentDirPath, "../../db/migrations/0001_init.sql");
  const sql = await readFile(migrationPath, "utf8");
  await pool.query(sql);
}
