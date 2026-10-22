from pathlib import Path
import json,subprocess
p=Path('docs/model/g300-spec.json')
s=json.loads(p.read_text(encoding='utf-8'))
if isinstance(s['lightingFromPhoto'],dict):
 s['lightingFromPhoto']=[{'role':key,'settings':value} for key,value in s['lightingFromPhoto'].items()]
p.write_text(json.dumps(s,ensure_ascii=False,indent=2),encoding='utf-8')
tool='tools/img2threejs/forge/stage2_spec/validate_sculpt_spec.py'
for name,args in [('schema-validation',[]),('strict-quality',['--strict-quality'])]:
 result=subprocess.run(['python',tool,str(p),*args],capture_output=True,text=True,encoding='utf-8')
 Path(f'docs/model/{name}.txt').write_text(result.stdout+result.stderr,encoding='utf-8')
 print(name,'exit',result.returncode)
