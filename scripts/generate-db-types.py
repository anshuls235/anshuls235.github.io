"""Generate the public API contract by introspecting the migrated PostgreSQL schema.
Runs inside the isolated policy-test DB; no production database password required.
"""
import json
import subprocess
from pathlib import Path
sql = """
select json_build_object(
 'columns',(select json_agg(row_to_json(c) order by table_name,ordinal_position)
 from information_schema.columns c where table_schema='public'),
 'enums',(select json_agg(json_build_object('name',t.typname,'label',e.enumlabel) order by t.typname,e.enumsortorder)
 from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public')
);
"""
data = json.loads(subprocess.check_output(['psql','-X','-A','-t','-v','ON_ERROR_STOP=1','-c',sql],text=True))
enums = {}
for e in data['enums'] or []:
    enums.setdefault(e['name'],[]).append(e['label'])
tables = {}
for c in data['columns']:
    tables.setdefault(c['table_name'],[]).append(c)
def type_of(c):
    t = c['udt_name']
    if t in enums:
        return ' | '.join(json.dumps(v) for v in enums[t])
    if t.startswith('_'):
        return 'string[]' if t in ['_text','_uuid'] else 'Json[]'
    if t in ['int2','int4','int8','float4','float8','numeric']:
        return 'number'
    if t == 'bool':
        return 'boolean'
    if t in ['json','jsonb']:
        return 'Json'
    return 'string'
lines = ['// Generated from information_schema and pg_enum after applying the repository migration.',
         '// Reproduce: PORTFOLIO_GENERATE_TYPES=1 npm run test:policies',
         '// Never add credentials or private schema types to this public API contract.',
         'export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];',
         'export interface Database {', '  public: {', '    Tables: {']
for name,cols in tables.items():
    lines.append(f'      {name}: {{')
    for mode in ['Row','Insert','Update']:
        lines.append(f'        {mode}: {{')
        for c in cols:
            optional = mode == 'Update' or (mode == 'Insert' and (c['column_default'] is not None or c['is_nullable']=='YES'))
            t = type_of(c) + (' | null' if c['is_nullable']=='YES' else '')
            lines.append(f'          {c["column_name"]}{"?" if optional else ""}: {t};')
        lines.append('        };')
    if name=='project_links':
        lines.append('        Relationships: [{ foreignKeyName: "project_links_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }];')
    else:
        lines.append('        Relationships: [];')
    lines.append('      };')
lines += ['    };','    Views: Record<string, never>;','    Functions: { ingest_analytics: { Args: { p_event: Json }; Returns: boolean } };','    Enums: {']
for name,values in enums.items():
    lines.append(f'      {name}: '+ ' | '.join(json.dumps(v) for v in values)+';')
lines += ['    };','    CompositeTypes: Record<string, never>;','  };','}']
Path('src/lib/database.generated.ts').write_text('\n'.join(lines)+'\n')
print(f'Generated public types from {len(tables)} migrated database tables.')
