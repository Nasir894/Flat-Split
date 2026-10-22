// Applies db/schema.sql to DATABASE_URL. Usage: node --env-file=.env.local scripts/migrate.mjs
import { readFileSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
await pool.query(sql);
const { rows } = await pool.query(
  "select table_name from information_schema.tables where table_schema = 'public' order by 1",
);
console.log("Tables:", rows.map((r) => r.table_name).join(", "));
await pool.end();
