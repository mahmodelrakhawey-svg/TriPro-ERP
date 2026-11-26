/**
 * Generates supabase/schema_columns.json from canonical SQL definitions
 * (commercial_db_packages/01_core_erp.sql, 00_full_enterprise_all_in_one.sql, sql_updates/*.sql).
 * Run: node scripts/generate-schema-snapshot.mjs
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const OUT_FILE = path.join(ROOT, 'supabase', 'schema_columns.json');

const SQL_KEYWORDS = new Set([
  'constraint', 'primary', 'foreign', 'unique', 'check', 'exclude',
  'like', 'with', 'using', 'references', 'on', 'delete', 'update',
  'default', 'not', 'null', 'generated', 'always', 'as', 'if', 'exists'
]);

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, '');
}

function addCol(schema, table, col) {
  if (!table || !col) return;
  const t = table.replace(/^public\./i, '').replace(/"/g, '').trim().toLowerCase();
  const c = col.replace(/"/g, '').trim().toLowerCase();
  if (!t || !c || SQL_KEYWORDS.has(c) || !/^[a-z_][a-z0-9_]*$/.test(c)) return;
  if (!schema[t]) schema[t] = new Set();
  schema[t].add(c);
}

function splitTopLevelCommas(body) {
  const parts = [];
  let current = '';
  let depth = 0;
  let inSingleQuote = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'" && body[i - 1] !== '\\') {
      inSingleQuote = !inSingleQuote;
    } else if (!inSingleQuote) {
      if (ch === '(') depth++;
      else if (ch === ')' && depth > 0) depth--;
      else if (ch === ',' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function parseSqlIntoSchema(sqlText, schema) {
  const clean = stripComments(sqlText);

  // 1. CREATE TABLE [IF NOT EXISTS] [public.]name ( ... )
  const createRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?("?[a-zA-Z0-9_]+"?)\s*\(/gi;
  let match;
  while ((match = createRegex.exec(clean)) !== null) {
    const tableName = match[1];
    let idx = match.index + match[0].length;
    let depth = 1;
    let inQuote = false;
    const start = idx;
    while (idx < clean.length && depth > 0) {
      const ch = clean[idx];
      if (ch === "'" && clean[idx - 1] !== '\\') inQuote = !inQuote;
      else if (!inQuote) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
      }
      idx++;
    }
    const body = clean.slice(start, idx - 1);
    const defs = splitTopLevelCommas(body);
    for (const def of defs) {
      const trimmed = def.trim();
      if (!trimmed) continue;
      const firstWordMatch = trimmed.match(/^("?[a-zA-Z_][a-zA-Z0-9_]*"?)\s+/);
      if (firstWordMatch) {
        addCol(schema, tableName, firstWordMatch[1]);
      }
    }
  }

  // 2. ALTER TABLE [IF EXISTS] [public.]name ADD [COLUMN] [IF NOT EXISTS] ...
  const alterRegex = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?("?[a-zA-Z0-9_]+"?)\s+([^;]+);/gi;
  while ((match = alterRegex.exec(clean)) !== null) {
    const tableName = match[1];
    const clause = match[2];
    const addColRegex = /ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?("?[a-zA-Z_][a-zA-Z0-9_]*"?)\s+/gi;
    let colMatch;
    while ((colMatch = addColRegex.exec(clause)) !== null) {
      addCol(schema, tableName, colMatch[1]);
    }
  }

  // 3. Dynamic array loops adding user_id / organization_id
  const arrayLoops = [
    { regex: /tables_with_user_id\s+text\[\]\s*:=\s*ARRAY\[([^\]]+)\]/gi, col: 'user_id' },
    { regex: /(?:tables_to_heal|tables_to_fix|tables_to_ensure|org_tables)\s+text\[\]\s*:=\s*ARRAY\[([^\]]+)\]/gi, col: 'organization_id' },
  ];
  for (const { regex, col } of arrayLoops) {
    while ((match = regex.exec(clean)) !== null) {
      const items = match[1].match(/'([a-zA-Z0-9_]+)'/g) || [];
      for (const item of items) {
        addCol(schema, item.replace(/'/g, ''), col);
      }
    }
  }
}

function main() {
  const schema = {};
  const files = [];

  const coreSql = path.join(ROOT, 'commercial_db_packages', '01_core_erp.sql');
  const enterpriseSql = path.join(ROOT, 'commercial_db_packages', '00_full_enterprise_all_in_one.sql');
  if (fs.existsSync(coreSql)) files.push(coreSql);
  if (fs.existsSync(enterpriseSql)) files.push(enterpriseSql);

  const sqlUpdatesDir = path.join(ROOT, 'sql_updates');
  if (fs.existsSync(sqlUpdatesDir)) {
    const updates = fs
      .readdirSync(sqlUpdatesDir)
      .filter((f) => f.endsWith('.sql') && !f.endsWith('_bundle.sql') && !f.startsWith('mark_all_'))
      .sort()
      .map((f) => path.join(sqlUpdatesDir, f));
    files.push(...updates);
  }

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    parseSqlIntoSchema(content, schema);
  }

  const outObj = {};
  for (const table of Object.keys(schema).sort()) {
    outObj[table] = Array.from(schema[table]).sort();
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(outObj, null, 2) + '\n', 'utf8');
  console.log(`Generated ${OUT_FILE} with ${Object.keys(outObj).length} tables.`);
}

main();
