"""Create a source-only delivery archive without dependencies, caches or Git internals."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import os
root=Path(__file__).resolve().parent.parent
output=root/'releases';output.mkdir(exist_ok=True)
archive=output/'ipman-fase2-source.zip'
excluded={'node_modules','dist','.git','releases','test-results','playwright-report','__pycache__','.venv'}
count=0
with ZipFile(archive,'w',ZIP_DEFLATED) as z:
 for folder,dirs,files in os.walk(root):
  dirs[:]=[d for d in dirs if d not in excluded]
  for name in files:
   path=Path(folder)/name
   if path.suffix=='.tsbuildinfo':continue
   z.write(path,Path('ipman-fase2')/path.relative_to(root));count+=1
print(f'{archive.name}: {count} files, {archive.stat().st_size:,} bytes')
