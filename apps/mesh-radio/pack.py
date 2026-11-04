"""Create the installable web-only VPK; sources are distributed separately."""
from pathlib import Path
import argparse
import json
import zipfile

root=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--output',type=Path)
args=parser.parse_args()
manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
output=args.output or root/'dist'/('mesh-radio-'+manifest['appVersion']+'.vpk')
output.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
    for name in ('manifest.json','index.html','app.js','radio.js','styles.css','LICENSE','NOTICE.md'):
        archive.write(root/name,name)
    for directory in ('icons','LICENSES'):
        for file in sorted((root/directory).rglob('*')):
            if file.is_file():archive.write(file,file.relative_to(root).as_posix())
print(output)
