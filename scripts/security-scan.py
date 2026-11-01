"""Redacted credential scan of source, built output and all reachable Git blobs.
Heuristics are not proof that arbitrary secrets are absent. No matched values print.
"""
import re, subprocess, sys
from pathlib import Path
PATTERNS = {
 'private-key': rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
 'github-token': rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})',
 'supabase-secret': rb'sb_secret_[A-Za-z0-9_-]{15,}',
 'aws-access-key': rb'(?:AKIA|ASIA)[A-Z0-9]{16}',
 'database-url': rb'postgres(?:ql)?://[^\s\x22\x27]+:[^\s\x22\x27]+@',
 'service-jwt': rb'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
}
skip={'node_modules','.git','.agents','.codex','.claude','.playwright-mcp','graphify-out','tmp','output','test-results','playwright-report'}
findings=[]
def scan(name,data):
 for kind,pattern in PATTERNS.items():
  if re.search(pattern,data):findings.append((name,kind))
for p in Path('.').rglob('*'):
 if any(part in skip for part in p.parts) or not p.is_file() or p.name.startswith('.env') or p.stat().st_size>4_000_000:continue
 scan(str(p),p.read_bytes())
try:
 objects=subprocess.check_output(['git','rev-list','--objects','--all'],text=True).splitlines()
 scanned=set()
 for item in objects:
  oid,_,name=item.partition(' ')
  if oid in scanned or not name:continue
  scanned.add(oid)
  kind=subprocess.check_output(['git','cat-file','-t',oid],text=True).strip()
  if kind!='blob':continue
  scan('git-history:'+name+'@'+oid[:10],subprocess.check_output(['git','cat-file','blob',oid]))
except subprocess.CalledProcessError:
 print('Git history scan failed');sys.exit(2)
if findings:
 for name,kind in findings:print(f'{name}: possible {kind}; matched value withheld')
 sys.exit(1)
print(f'No credential-pattern matches in source, dist, or {len(scanned)} reachable Git objects. Environment files excluded; inspect only variable names there.')
