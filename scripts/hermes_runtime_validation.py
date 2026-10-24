"""Validate a public Linux payload without extracting or executing it."""
import hashlib
import json
import pathlib
import posixpath
import tarfile

ROOTS = {'hermes', 'python', 'node', 'isolation', 'data'}
FOOD_SHA = 'a8e60fe05956869df3bc9d04371994c5ff8adf0d6014e474457f52191b591ad8'
REQUIRED = {
    'node/bin/node', 'node/LICENSE', 'python/bin/python3.14',
    'hermes/source-manifest.json', 'hermes/source/uv.lock',
    'hermes/source/.venv/pyvenv.cfg', 'hermes/source/.venv/bin/python',
    'isolation/bwrap', 'isolation/LICENSE.bubblewrap',
    'isolation/worker-seccomp.bpf', 'data/foods-v1-reviewed.sqlite',
}

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def safe_path(name):
    if not isinstance(name, str) or not name or '\\' in name or '\x00' in name:
        raise ValueError('archive_path')
    p = pathlib.PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or posixpath.normpath(name) != name or p.parts[0] not in ROOTS:
        raise ValueError('archive_path')
    return name

def link_target(name, link):
    if not isinstance(link, str) or not link or '\\' in link or '\x00' in link:
        raise ValueError('archive_link')
    if link.startswith('/'):
        # The pinned venv points to the canonical Python installation, nowhere else.
        if not link.startswith('/opt/scisense/python/'):
            raise ValueError('archive_link_escape')
        target = link.removeprefix('/opt/scisense/')
    else:
        target = posixpath.normpath(posixpath.join(posixpath.dirname(name), link))
    try:
        return safe_path(target)
    except ValueError as exc:
        raise ValueError('archive_link_escape') from exc

def validate_runtime(directory, pin):
    directory = pathlib.Path(directory)
    archive = directory / 'runtime.tar.gz'
    manifest = json.loads((directory / 'manifest.json').read_text())
    if (manifest.get('version') != 1 or manifest.get('platform') != 'linux-x64'
            or manifest.get('os') != 'ubuntu-24.04'
            or manifest.get('credentialsIncluded') is not False
            or manifest.get('syntheticStateIncluded') is not False
            or digest(archive) != manifest.get('archiveSha256')
            or archive.stat().st_size != manifest.get('archiveBytes')):
        raise ValueError('runtime_manifest_invalid')
    expected = {}
    for row in manifest.get('files', []):
        name = safe_path(row['path'])
        if name in expected:
            raise ValueError('manifest_duplicate')
        expected[name] = row
    seen, members, links, captured = set(), {}, {}, {}
    with tarfile.open(archive) as tf:
        for member in tf:
            name = safe_path(member.name)
            if name in members:
                raise ValueError('archive_duplicate')
            members[name] = member
            if member.mode & 0o6000:
                raise ValueError('archive_privileged_mode')
            if member.isdir():
                continue
            row = expected.get(name)
            if row is None:
                raise ValueError('archive_unexpected')
            seen.add(name)
            if member.issym():
                if member.linkname != row.get('link') or 'sha256' in row:
                    raise ValueError('archive_link')
                links[name] = link_target(name, member.linkname)
            elif member.isfile():
                if member.size <= 0 and name in REQUIRED:
                    raise ValueError('runtime_payload_empty')
                h = hashlib.sha256()
                data = bytearray() if name == 'hermes/source-manifest.json' else None
                if data is not None and member.size > 8 * 1024 * 1024:
                    raise ValueError('source_manifest_limit')
                with tf.extractfile(member) as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                        h.update(chunk)
                        if data is not None:
                            data.extend(chunk)
                if h.hexdigest() != row.get('sha256') or member.size != row.get('bytes') or 'link' in row:
                    raise ValueError('archive_bytes')
                if data is not None:
                    captured[name] = bytes(data)
            else:
                raise ValueError('archive_special')
    if seen != set(expected):
        raise ValueError('archive_incomplete')
    # Never permit archive entries underneath a symlink, even one pointing inside.
    for name in members:
        if any(str(p) in links for p in pathlib.PurePosixPath(name).parents):
            raise ValueError('archive_symlink_parent')
    for origin, target in links.items():
        visited = {origin}
        while target in links:
            if target in visited:
                raise ValueError('archive_link_cycle')
            visited.add(target)
            target = links[target]
        if target not in members:
            raise ValueError('archive_link_missing')
        if any(str(p) in links for p in pathlib.PurePosixPath(target).parents):
            raise ValueError('archive_link_indirect')
    if not REQUIRED.issubset(seen):
        raise ValueError('runtime_payload_missing')
    regular = REQUIRED - {'hermes/source/.venv/bin/python'}
    if any(not members[p].isfile() for p in regular):
        raise ValueError('runtime_payload_type')
    for name in ['node/bin/node', 'python/bin/python3.14', 'isolation/bwrap']:
        if not members[name].mode & 0o111:
            raise ValueError('runtime_executable_missing')
    if manifest.get('components') != {'node':'v24.22.1','python':'Python ' + pin['python'],'bubblewrap':'bubblewrap 0.11.0'}:
        raise ValueError('runtime_version_pin')
    source_bytes = captured['hermes/source-manifest.json']
    if hashlib.sha256(source_bytes).hexdigest() != pin['manifestSha256']:
        raise ValueError('runtime_source_pin')
    source = json.loads(source_bytes)
    if len(source) != pin['files'] or expected['hermes/source/uv.lock']['sha256'] != pin['dependencyLockSha256']:
        raise ValueError('runtime_source_pin')
    for name, sha in source.items():
        row = expected.get(safe_path('hermes/source/' + name))
        if row is None or row.get('sha256') != sha:
            raise ValueError('runtime_source_pin')
    if expected['data/foods-v1-reviewed.sqlite']['sha256'] != FOOD_SHA:
        raise ValueError('runtime_food_pin')
    if not manifest.get('packages') or not {'libc6', 'libcap2', 'libseccomp2'}.issubset({line.split('\t')[0].split(':')[0] for line in manifest['packages']}):
        raise ValueError('runtime_os_packages_missing')
    return manifest
