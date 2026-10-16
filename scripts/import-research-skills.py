"""Import the user's two archives, backing up the complete previous skill tree first.

No code from either archive is executed. Existing destinations are never overwritten.
"""
import argparse
import hashlib
import json
import shutil
import zipfile
from datetime import datetime
from pathlib import Path, PurePosixPath


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def adapt_methods(methods):
    specific = {
        'ols': 'ols-regression', 'panel-fe': 'panel-data', 'panel-re': 'panel-data',
        'panel-first-difference': 'panel-data', 'iv-2sls': 'iv-estimation', 'iv-gmm': 'iv-estimation',
        'simple-did': 'did-analysis', 'staggered-did': 'did-analysis', 'local-rdd': 'rdd-analysis',
        'synthetic-control': 'synthetic-control', 'descriptive': 'stats', 'correlation': 'stats',
        'group-tests': 'stats', 'time-series': 'time-series',
    }
    for method in methods['methods']:
        method['skillId'] = (
            '67-econfin-workflow-toolkit::' + specific[method['id']] if method['id'] in specific
            else '50-brycewang-aer-skills::aer-robustness' if method['id'] in {'diagnostics', 'robustness', 'heterogeneity'}
            else '00.1-Full-empirical-analysis-skill_Python::Full-empirical-analysis-skill'
        )
    return methods


def unpack(archive, destination, expected_root):
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip():
            raise ValueError(f'Corrupt archive: {archive}')
        for entry in bundle.infolist():
            parts = PurePosixPath(entry.filename).parts
            if not parts or parts[0] != expected_root or '..' in parts or ':' in entry.filename or '\\' in entry.filename:
                raise ValueError(f'Unsafe archive path: {entry.filename}')
            if ((entry.external_attr >> 16) & 0o170000) == 0o120000:
                raise ValueError(f'Symlink is not supported: {entry.filename}')
            target = destination.joinpath(*parts[1:]).resolve()
            if not target.is_relative_to(destination.resolve()):
                raise ValueError(f'Archive escapes destination: {entry.filename}')
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('xb') as stream:
                    stream.write(bundle.read(entry))
        return bundle.comment.decode('ascii', errors='replace')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--main-zip', required=True)
    parser.add_argument('--workflow-zip', required=True)
    args = parser.parse_args()
    project = Path(__file__).resolve().parent.parent
    old = project / 'assets/skills'
    destination = project / 'assets/research-skills'
    adapter = project / 'assets/research-runtime'
    if destination.exists() or adapter.exists():
        raise ValueError('Import already exists; refusing to overwrite')
    skills = sorted(old.glob('*/SKILL.md'))
    if len(skills) != 21:
        raise ValueError(f'Expected 21 original skills, found {len(skills)}; inspect before migration')
    backup = project / 'local-backups' / ('skills-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(parents=True, exist_ok=False)
    shutil.copytree(old, backup / 'original-skills')
    hashes = {str(file.relative_to(old)).replace('\\', '/'): digest(file) for file in old.rglob('*') if file.is_file()}
    for relative, sha in hashes.items():
        if digest(backup / 'original-skills' / relative) != sha:
            raise ValueError(f'Backup verification failed: {relative}')
    # Preserve current, possibly uncommitted integration files too.
    for relative in ['electron/skills/skill-runtime.js', 'electron/skill-runtime.test.js',
                     'electron/pi/planner.mjs', 'electron/pi/run-engine.mjs', 'electron/pi/agent-tools.mjs',
                     'electron/agent/orchestrator.js', 'electron/empirical-workflow.js',
                     'electron/main.js', 'electron/research-workflow.js', 'electron/agent/local-edit.js']:
        source = project / relative
        if source.exists():
            target = backup / 'integration-before' / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    (backup / 'manifest.json').write_text(json.dumps({'skill_count': 21, 'files': hashes}, ensure_ascii=False, indent=2), encoding='utf-8')
    text = ['原有 21 个技能完整备份（含 runtime.json、引用文件和共享规则）',
            '备份 manifest.json 记录每个文件的 SHA-256，迁移前已逐文件核验。',
            'original-skills/ 是完整可恢复目录；integration-before/ 是修改前的接入代码。', '']
    for skill in skills:
        text += [f'===== {skill.parent.name}/SKILL.md =====', skill.read_text(encoding='utf-8'), '']
    (backup / '原有21个技能完整文档.txt').write_text('\n'.join(text), encoding='utf-8')
    with zipfile.ZipFile(backup / 'original-skills.zip', 'w', zipfile.ZIP_DEFLATED) as bundle:
        for relative in hashes:
            bundle.write(old / relative, 'skills/' + relative)
    main_commit = unpack(Path(args.main_zip), destination, 'Auto-Empirical-Research-Skills-main')
    workflow_commit = unpack(Path(args.workflow_zip), destination / 'skills/69-Paper-WorkFlow', 'Paper-WorkFlow-main')
    catalog = json.loads((destination / 'catalog/skills.json').read_text(encoding='utf-8'))
    for skill in catalog['skills']:
        if not (destination / skill['path']).is_file():
            raise ValueError(f'Missing imported skill: {skill["path"]}')
    adapter.mkdir()
    # This is a product capability registry, not an old skill or its research rules.
    methods = adapt_methods(json.loads((old / 'empirical-analysis-plan/methods.json').read_text(encoding='utf-8')))
    (adapter / 'methods.json').write_text(json.dumps(methods, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (destination / 'IMPORT.json').write_text(json.dumps({
        'main_commit': main_commit, 'workflow_commit': workflow_commit,
        'main_sha256': digest(Path(args.main_zip)), 'workflow_sha256': digest(Path(args.workflow_zip)),
        'catalog_entries': len(catalog['skills']), 'backup': backup.relative_to(project).as_posix(),
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    # Check the final resolved target stays inside this explicitly named workspace.
    if old.resolve() != (project / 'assets/skills').resolve() or not old.resolve().is_relative_to(project):
        raise ValueError('Refusing removal outside the verified original skill tree')
    shutil.rmtree(old)
    print(json.dumps({'backup': str(backup), 'imported': len(catalog['skills']), 'removed_old_skills': len(skills)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
