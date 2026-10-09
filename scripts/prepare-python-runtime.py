"""Build an offline Windows CPython runtime from official, hashed binary artifacts."""
import hashlib
import json
import pathlib
import subprocess
import sys
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGET = ROOT / 'assets/python/win32-x64'
CACHE = ROOT / '.runtime-downloads'
VERSION = '3.14.8'
URL = f'https://www.python.org/ftp/python/{VERSION}/python-{VERSION}-embed-amd64.zip'
# Published on https://www.python.org/downloads/release/python-3148/
SHA256 = 'a93abe456ab01bd96d7a085b3cdb6566b3063f4241360d114142fbdb07f0a310'
PACKAGES = ['numpy', 'pandas', 'scipy', 'matplotlib', 'openpyxl', 'statsmodels', 'scikit-learn', 'linearmodels', 'lifelines']
LOCK = ROOT / 'assets/python/runtime-lock.json'

def extract(archive, destination, wheel=False):
    with zipfile.ZipFile(archive) as package:
        for item in package.infolist():
            parts = pathlib.PurePosixPath(item.filename).parts
            if not parts or '..' in parts or pathlib.PurePosixPath(item.filename).is_absolute() or ':' in item.filename:
                raise RuntimeError('Unsafe archive path')
            if item.is_dir():
                continue
            if wheel and parts[0].endswith('.data'):
                if len(parts) < 3 or parts[1] not in ('purelib', 'platlib'):
                    continue
                parts = parts[2:]
            output = destination.joinpath(*parts)
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(package.read(item))

def main():
    CACHE.mkdir(exist_ok=True)
    archive = CACHE / f'python-{VERSION}-embed-amd64.zip'
    if not archive.exists():
        with urllib.request.urlopen(URL, timeout=120) as response:
            archive.write_bytes(response.read())
    if hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
        raise RuntimeError('Official Python archive checksum mismatch')
    wheels = CACHE / 'wheels-314'
    wheels.mkdir(exist_ok=True)
    lock = json.loads(LOCK.read_text(encoding='utf8')) if LOCK.exists() else None
    extend = '--extend' in sys.argv
    normalize = lambda name: name.lower().replace('_', '-').replace('.', '-')
    locked_names = {normalize(item['name']) for item in lock['packages']} if lock else set()
    requirements = [f"{item['name']}=={item['version']}" for item in lock['packages']] if lock else PACKAGES
    if lock and extend:
        requirements += [name for name in PACKAGES if normalize(name) not in locked_names]
    subprocess.run([sys.executable, '-m', 'pip', 'download', '--index-url', 'https://pypi.org/simple', '--only-binary=:all:', '--implementation', 'cp', '--python-version', '3.14', '--abi', 'cp314', '--abi', 'abi3', '--abi', 'none', '--platform', 'win_amd64', '--dest', str(wheels), *requirements], check=True)
    TARGET.mkdir(parents=True, exist_ok=True)
    extract(archive, TARGET)
    packages = []
    artifacts = [wheels / item['wheel'] for item in lock['packages']] if lock else sorted(wheels.glob('*.whl'))
    if lock and extend:
        artifacts += [wheel for wheel in sorted(wheels.glob('*.whl')) if normalize(wheel.name.split('-')[0]) not in locked_names]
    if len({normalize(wheel.name.split('-')[0]) for wheel in artifacts}) != len(artifacts):
        raise RuntimeError('Duplicate package versions in runtime wheel cache')
    for wheel in artifacts:
        name, version = wheel.name.split('-')[:2]
        metadata = json.load(urllib.request.urlopen(f'https://pypi.org/pypi/{name}/{version}/json', timeout=60))
        artifact = next(item for item in metadata['urls'] if item['filename'] == wheel.name)
        digest = hashlib.sha256(wheel.read_bytes()).hexdigest()
        if digest != artifact['digests']['sha256']:
            raise RuntimeError('PyPI wheel checksum mismatch: ' + wheel.name)
        locked = next((item for item in lock['packages'] if item['wheel'] == wheel.name), None) if lock else None
        if locked and digest != locked['sha256']:
            raise RuntimeError('Locked wheel checksum mismatch')
        extract(wheel, TARGET / 'Lib/site-packages', wheel=True)
        packages.append({'name': name, 'version': version, 'wheel': wheel.name, 'sha256': digest, 'url': artifact['url']})
    (TARGET / 'python314._pth').write_text('python314.zip\n.\nLib/site-packages\nimport site\n', encoding='utf8')
    manifest = json.dumps({'python': VERSION, 'source': URL, 'sha256': SHA256, 'packages': packages}, indent=2)
    (TARGET / 'runtime-manifest.json').write_text(manifest, encoding='utf8')
    if not lock or extend:
        LOCK.write_text(manifest, encoding='utf8')
    probe = subprocess.run([str(TARGET / 'python.exe'), '-I', '-c', 'import sys,numpy,pandas,scipy,matplotlib,openpyxl,statsmodels,sklearn,linearmodels,lifelines; print(sys.version.split()[0]); print("BUNDLED_ANALYSIS_IMPORTS_OK")'], check=True, capture_output=True, text=True)
    print(probe.stdout)

if __name__ == '__main__':
    main()
