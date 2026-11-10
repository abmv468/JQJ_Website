import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface StoreSchema {
  tables: Record<string, string[]>;
  duplicateCreateColumns: Record<string, string[]>;
  functions: string[];
  orderStatuses: string[];
  sql: string;
}

let cached: StoreSchema | null = null;

export function migrationsDir() {
  return path.join(process.cwd(), "supabase", "migrations");
}

export function loadStoreSchema(): StoreSchema {
  if (cached) return cached;

  const files = readdirSync(migrationsDir())
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const sql = files
    .map((name) => readFileSync(path.join(migrationsDir(), name), "utf8"))
    .join("\n");

  const tables: Record<string, Set<string>> = {};
  const duplicateCreateColumns: Record<string, string[]> = {};

  const createRe = /create table if not exists (?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi;
  let createMatch: RegExpExecArray | null;
  while ((createMatch = createRe.exec(sql))) {
    const name = createMatch[1];
    const body = readBalanced(sql, createRe.lastIndex - 1);
    const columns = tables[name] ?? new Set<string>();
    const declared = columnsInCreateBody(body);
    const seen = new Set<string>();
    for (const column of declared) {
      if (seen.has(column)) {
        duplicateCreateColumns[name] = [...(duplicateCreateColumns[name] ?? []), column];
      }
      seen.add(column);
      columns.add(column);
    }
    tables[name] = columns;
  }

  const alterRe = /alter table (?:if exists )?(?:public\.)?([a-z_][a-z0-9_]*)\s+([\s\S]*?);/gi;
  let alterMatch: RegExpExecArray | null;
  while ((alterMatch = alterRe.exec(sql))) {
    const name = alterMatch[1];
    const body = alterMatch[2];
    const columns = tables[name] ?? new Set<string>();
    const addRe = /add column if not exists ([a-z_][a-z0-9_]*)/gi;
    let addMatch: RegExpExecArray | null;
    while ((addMatch = addRe.exec(body))) columns.add(addMatch[1]);
    if (columns.size) tables[name] = columns;
  }

  const functions = new Set<string>();
  const fnRe = /create or replace function (?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi;
  let fnMatch: RegExpExecArray | null;
  while ((fnMatch = fnRe.exec(sql))) functions.add(fnMatch[1]);

  const statusBlocks = [
    ...sql.matchAll(
      /orders_status_check[\s\S]*?check\s*\(\s*status\s+in\s*\(([\s\S]*?)\)\s*\)/gi
    ),
  ];
  const statusSource = statusBlocks.at(-1)?.[1] ?? "";
  const orderStatuses = [...statusSource.matchAll(/'([^']+)'/g)].map((match) => match[1]);

  cached = {
    tables: Object.fromEntries(
      Object.entries(tables).map(([name, columns]) => [name, [...columns].sort()])
    ),
    duplicateCreateColumns,
    functions: [...functions].sort(),
    orderStatuses,
    sql,
  };
  return cached;
}

function readBalanced(sql: string, openParenIndex: number) {
  let depth = 0;
  let body = "";
  for (let i = openParenIndex; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return body;
    }
    if (depth > 0 && !(depth === 1 && ch === "(" && body === "")) body += ch;
  }
  throw new Error("Unbalanced create table body");
}

function columnsInCreateBody(body: string) {
  const columns: string[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim().replace(/,$/, "");
    if (!line || line.startsWith("--")) continue;
    if (/^(constraint|primary|unique|check|foreign)\b/i.test(line)) continue;
    const match = line.match(/^([a-z_][a-z0-9_]*)\s+/i);
    if (match) columns.push(match[1]);
  }
  return columns;
}

export function checkoutCodeCalls() {
  const roots = ["app", "lib"].map((dir) => path.join(process.cwd(), dir));
  const files = roots.flatMap((root) => listSourceFiles(root));
  const tables = new Set<string>();
  const rpcs = new Set<string>();
  const fromRe = /(?<!Buffer)\.from\(\s*["']([a-z_][a-z0-9_]*)["']/g;
  const rpcRe = /\.rpc\(\s*["']([a-z_][a-z0-9_]*)["']/g;

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(fromRe)) tables.add(match[1]);
    for (const match of source.matchAll(rpcRe)) rpcs.add(match[1]);
  }

  return {
    tables: [...tables].sort(),
    rpcs: [...rpcs].sort(),
  };
}

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}
