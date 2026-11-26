/**
 * ==============================================================================
 * 🛡️ TriPro ERP — Static Supabase Schema Column Guard
 * scripts/verify-code-schema.mjs
 * ==============================================================================
 * Scans TS/TSX files for supabase.from('table') queries (.select, .eq, .order,
 * .in, .not, .is, .gt, .gte, .lt, .lte, .neq, .ilike, .like) and validates
 * column names against supabase/schema_columns.json.
 *
 * Exit code 1 if any unknown column is found.
 * ==============================================================================
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const SCHEMA_FILE = path.join(ROOT, 'supabase', 'schema_columns.json');
const SCAN_DIRS = ['modules', 'services', 'context', 'components', 'utils'];

// Pre-existing legacy queries predating the schema guard (do not add new entries here)
const LEGACY_ALLOWLIST = new Set([
  'hims_prescriptions:status',
  'security_logs:module',
  'project_progress_billings:customer_id',
  'invoice_items:line_no',
  'invoice_items:description',
  'invoice_items:discount',
  'invoice_items:custom_fields',
  'invoice_items:created_by',
]);

// Legacy optional tables cleaned up during org purge / old migrations
const LEGACY_OPTIONAL_TABLES = new Set([
  'recipe_items',
  'combo_items',
  'mfg_order_steps',
  'transfers',
  'audit_logs',
]);

if (!fs.existsSync(SCHEMA_FILE)) {
  console.error(`❌ Schema snapshot not found: ${SCHEMA_FILE}`);
  process.exit(1);
}

const rawSchema = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf8'));
const schemaMap = new Map();
for (const [table, cols] of Object.entries(rawSchema)) {
  schemaMap.set(table.toLowerCase(), new Set(cols.map((c) => c.toLowerCase())));
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.d.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Splits a PostgREST .select(...) string at top-level commas,
 * ignoring commas inside nested relation(...) parentheses.
 */
function splitSelectTokens(selectStr) {
  const tokens = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < selectStr.length; i++) {
    const ch = selectStr[i];
    if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;
    else if (ch === ',' && depth === 0) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

/**
 * Extracts scalar column name from a top-level PostgREST select token.
 * Returns null if the token is '*', a relation embed 'rel(...)', or an expression.
 */
function extractScalarColumn(token) {
  const t = token.trim();
  if (!t || t === '*') return null;
  // Relation embed like: suppliers(id, name) or item_categories!inner(name) or alias:suppliers(id)
  if (t.includes('(')) return null;
  // Handle alias:col_name
  const afterColon = t.includes(':') ? t.split(':').pop().trim() : t;
  // Strip PostgREST cast ::type or json arrow ->
  const base = afterColon.split('::')[0].split('->>')[0].split('->')[0].trim();
  if (!base || base === '*' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(base)) return null;
  return base.toLowerCase();
}

function getLineNumber(content, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Finds the end of a supabase.from('table')... chain: stops at ';',
 * a comma at parenDepth 0 (e.g. inside Promise.all([...])), or the next '.from('.
 */
function extractQueryChain(content, startIdx) {
  const slice = content.slice(startIdx, Math.min(content.length, startIdx + 1200));
  let parenDepth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i];
    const prev = i > 0 ? slice[i - 1] : '';
    if (prev === '\\') continue;
    if (!inDouble && !inBacktick && ch === "'") inSingle = !inSingle;
    else if (!inSingle && !inBacktick && ch === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === '`') inBacktick = !inBacktick;
    else if (!inSingle && !inDouble && !inBacktick) {
      if (i > 6 && slice.startsWith('.from(', i)) return slice.slice(0, i);
      if (ch === '(') parenDepth++;
      else if (ch === ')' && parenDepth > 0) parenDepth--;
      else if ((ch === ';' || ch === ',' || ch === ']') && parenDepth === 0) return slice.slice(0, i);
    }
  }
  return slice;
}

/**
 * Extracts top-level property keys from an inline JS object literal body `{ ... }`.
 * Handles `key: value`, `'key': value`, shorthand `key`, and skips `...spread`.
 */
function extractObjectLiteralKeys(objBody) {
  const keys = [];
  let current = '';
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;

  const pushToken = (tok) => {
    const trimmed = tok.trim();
    if (!trimmed || trimmed.startsWith('...')) return;
    // key: value
    const colonMatch = trimmed.match(/^['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]?\s*:/);
    if (colonMatch) {
      keys.push(colonMatch[1].toLowerCase());
      return;
    }
    // shorthand property: { id, name }
    const shorthandMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (shorthandMatch) {
      keys.push(shorthandMatch[1].toLowerCase());
    }
  };

  for (let i = 0; i < objBody.length; i++) {
    const ch = objBody[i];
    const prev = i > 0 ? objBody[i - 1] : '';
    if (prev === '\\') {
      current += ch;
      continue;
    }
    if (!inDouble && !inBacktick && ch === "'") inSingle = !inSingle;
    else if (!inSingle && !inBacktick && ch === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && ch === '`') inBacktick = !inBacktick;
    else if (!inSingle && !inDouble && !inBacktick) {
      if (ch === '{' || ch === '[' || ch === '(') depth++;
      else if ((ch === '}' || ch === ']' || ch === ')') && depth > 0) depth--;
      else if (ch === ',' && depth === 0) {
        pushToken(current);
        current = '';
        continue;
      }
    }
    current += ch;
  }
  pushToken(current);
  return keys;
}

/**
 * Extracts balanced `{ ... }` blocks from `.insert(...)`, `.update(...)`, `.upsert(...)`
 * when passed an inline object literal or array of object literals.
 */
function extractMutationPayloads(chain) {
  const results = [];
  const mutRegex = /\.(insert|update|upsert)\(\s*(\[?\s*\{)/g;
  let m;
  while ((m = mutRegex.exec(chain)) !== null) {
    const method = m[1];
    const braceStart = chain.indexOf('{', m.index + m[1].length);
    if (braceStart === -1) continue;
    let idx = braceStart + 1;
    let depth = 1;
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    while (idx < chain.length && depth > 0) {
      const ch = chain[idx];
      const prev = chain[idx - 1];
      if (prev !== '\\') {
        if (!inDouble && !inBacktick && ch === "'") inSingle = !inSingle;
        else if (!inSingle && !inBacktick && ch === '"') inDouble = !inDouble;
        else if (!inSingle && !inDouble && ch === '`') inBacktick = !inBacktick;
        else if (!inSingle && !inDouble && !inBacktick) {
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
        }
      }
      idx++;
    }
    if (depth === 0) {
      const body = chain.slice(braceStart + 1, idx - 1);
      results.push({ method, keys: extractObjectLiteralKeys(body) });
    }
  }
  return results;
}

export function runSchemaGuard() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    walkFiles(path.join(ROOT, dir), files);
  }

  const violations = [];
  const fromRegex = /\.from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    fromRegex.lastIndex = 0;

    while ((match = fromRegex.exec(content)) !== null) {
      const prefix = content.slice(Math.max(0, match.index - 40), match.index);
      if (/storage\s*$/s.test(prefix)) continue; // Ignore supabase.storage.from('bucket')

      const table = match[1].toLowerCase();
      const chain = extractQueryChain(content, match.index);
      const lineStart = content.lastIndexOf('\n', match.index) + 1;
      const lineEnd = content.indexOf('\n', match.index);
      const lineText = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd);
      if (chain.includes('schema-guard-ignore') || lineText.includes('schema-guard-ignore')) continue;
      const baseLine = getLineNumber(content, match.index);

      const allowedCols = schemaMap.get(table);
      if (!allowedCols) {
        if (LEGACY_OPTIONAL_TABLES.has(table)) continue;
        violations.push({
          file: path.relative(ROOT, file),
          line: baseLine,
          table,
          column: '*',
          context: `.from('${table}') — unknown table`,
        });
        continue;
      }
      if (allowedCols.size <= 2) continue; // Stub table

      // 1. Check .select('...')
      const selectRegex = /\.select\(\s*(['"`])([\s\S]*?)\1/g;
      let selMatch;
      while ((selMatch = selectRegex.exec(chain)) !== null) {
        const selectStr = selMatch[2];
        if (selectStr.includes('${')) continue; // dynamic template literal
        const tokens = splitSelectTokens(selectStr);
        for (const tok of tokens) {
          const col = extractScalarColumn(tok);
          if (col && !allowedCols.has(col) && !LEGACY_ALLOWLIST.has(`${table}:${col}`)) {
            violations.push({
              file: path.relative(ROOT, file),
              line: baseLine,
              table,
              column: col,
              context: '.select(...)',
            });
          }
        }
      }

      // 2. Check filter/order methods: .eq('col', ...), .order('col', ...), etc.
      const filterRegex = /\.(eq|neq|gt|gte|lt|lte|in|is|not|ilike|like|order)\(\s*['"]([a-zA-Z0-9_]+)['"]([^)]*)\)/g;
      let fltMatch;
      while ((fltMatch = filterRegex.exec(chain)) !== null) {
        const method = fltMatch[1];
        const col = fltMatch[2].toLowerCase();
        const restArgs = fltMatch[3] || '';
        if (method === 'order' && /(?:foreignTable|referencedTable)\s*:/.test(restArgs)) {
          continue;
        }
        if (!allowedCols.has(col) && !LEGACY_ALLOWLIST.has(`${table}:${col}`)) {
          violations.push({
            file: path.relative(ROOT, file),
            line: baseLine,
            table,
            column: col,
            context: `.${method}('${col}', ...)`,
          });
        }
      }

      // 3. Check inline .insert({...}), .update({...}), .upsert({...}) keys
      for (const { method, keys } of extractMutationPayloads(chain)) {
        for (const col of keys) {
          if (!allowedCols.has(col) && !LEGACY_ALLOWLIST.has(`${table}:${col}`)) {
            violations.push({
              file: path.relative(ROOT, file),
              line: baseLine,
              table,
              column: col,
              context: `.${method}({ ${col}: ... })`,
            });
          }
        }
      }
    }
  }

  return violations;
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

if (isDirectRun) {
  const violations = runSchemaGuard();
  if (violations.length > 0) {
    console.error(`\n❌ Schema Column Guard found ${violations.length} mismatched column(s):\n`);
    for (const v of violations) {
      console.error(`  - ${v.file}:${v.line} -> table "${v.table}" has no column "${v.column}" (in ${v.context})`);
    }
    console.error('');
    process.exit(1);
  } else {
    console.log('✅ Schema Column Guard: All static Supabase queries match supabase/schema_columns.json.');
  }
}
