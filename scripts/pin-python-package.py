"""Replace one bundled dependency with an official CPython 3.14 wheel.

Used to resolve sandbox incompatibilities. Hash/source are recorded in the lock;
normal runtime preparation then reproduces the pinned version.
"""
import hashlib
import importlib.util
import json
import pathlib
import shutil
import sys
import urllib.request

spec = importlib.util.spec_from_file_location('prepare', pathlib.Path(__file__).with_name('prepare-python-runtime.py'))
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
name, version = sys.argv[1].split('==', 1)
metadata = json.load(urllib.request.urlopen(f'https://pypi.org/pypi/{name}/{version}/json', timeout=60))
artifact = next(item for suffix in ['-cp314-cp314-win_amd64.whl', '-py3-none-any.whl', '-py2.py3-none-any.whl'] for item in metadata['urls'] if item['filename'].endswith(suffix))
body = urllib.request.urlopen(artifact['url'], timeout=60).read()
digest = hashlib.sha256(body).hexdigest()
if digest != artifact['digests']['sha256']:
    raise RuntimeError('Official wheel checksum mismatch')
wheel = prepare.CACHE / 'wheels-314' / artifact['filename']
wheel.write_bytes(body)
lock = json.loads(prepare.LOCK.read_text(encoding='utf8'))
old = next(item for item in lock['packages'] if item['name'].replace('_', '-') == name)
site = (prepare.TARGET / 'Lib/site-packages').resolve()
# Only the named package and its old distribution metadata may be replaced.
module_name = {'scikit-learn': 'sklearn'}.get(name, old['name'].replace('-', '_'))
for folder_name in [module_name, f"{old['name'].replace('-', '_')}-{old['version']}.dist-info", f"{old['name'].replace('-', '_')}.libs"]:
    folder = (site / folder_name).resolve()
    if folder.parent != site or folder.is_symlink():
        raise RuntimeError('Invalid package replacement path')
    if folder.exists():
        shutil.rmtree(folder)
prepare.extract(wheel, site, wheel=True)
old.update(name=name, version=version, wheel=wheel.name, sha256=digest, url=artifact['url'])
for destination in [prepare.LOCK, prepare.TARGET / 'runtime-manifest.json']:
    destination.write_text(json.dumps(lock, indent=2), encoding='utf8')
print(name, version, digest)
