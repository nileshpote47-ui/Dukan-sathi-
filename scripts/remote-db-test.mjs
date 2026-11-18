// Turns a pgTAP test file into one SQL script that can run through a remote SQL
// endpoint which only returns errors/last results (e.g. the Supabase SQL tool).
// Each TAP line is stored in a temp table; the script then raises an exception
// containing the full TAP output, which also guarantees a rollback.
// Usage: node scripts/remote-db-test.mjs supabase/tests/database/rls.test.sql > /tmp/remote.sql
import { readFileSync } from 'node:fs'

const sql = readFileSync(process.argv[2], 'utf8')
const setup = `create temp table tap (n serial, line text);
grant all on tap to anon, authenticated;
grant usage on sequence tap_n_seq to anon, authenticated;`

const out = sql
  .replace(/^select plan\((\d+)\);/m, (m) => `${setup}\ninsert into tap (line) ${m.slice(0, -1)};`)
  .replace(/^select (results_eq|is_empty|throws_ok|lives_ok|ok|is|isnt)\(/gm, 'insert into tap (line) select $1(')
  .replace(/^select \* from finish\(\);/m, 'insert into tap (line) select * from finish();')
  .replace(/^rollback;\s*$/m, () => "do $$ begin raise exception E'TAP\\n%', (select string_agg(line, E'\\n' order by n) from tap); end $$;")

process.stdout.write(out)
