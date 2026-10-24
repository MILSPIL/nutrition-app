"""Malformed public payloads must fail before the app release is assembled."""
import hashlib, io, json, pathlib, sys, tarfile, tempfile, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'scripts'))
from hermes_runtime_validation import validate_runtime, link_target

class PackageValidation(unittest.TestCase):
    def check_rejected(self, entries, error):
        with tempfile.TemporaryDirectory(prefix='hermes-package-test-') as temp:
            root = pathlib.Path(temp); rows=[]
            with tarfile.open(root/'runtime.tar.gz', 'w:gz') as archive:
                for name, data, link in entries:
                    member=tarfile.TarInfo(name); member.mode=0o644
                    if link is not None:
                        member.type=tarfile.SYMTYPE; member.linkname=link
                        rows.append({'path':name,'link':link}); archive.addfile(member)
                    else:
                        member.size=len(data);archive.addfile(member,io.BytesIO(data))
                        rows.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
            body=(root/'runtime.tar.gz').read_bytes()
            (root/'manifest.json').write_text(json.dumps({'version':1,'platform':'linux-x64','os':'ubuntu-24.04','credentialsIncluded':False,'syntheticStateIncluded':False,'archiveBytes':len(body),'archiveSha256':hashlib.sha256(body).hexdigest(),'files':rows}))
            with self.assertRaisesRegex(ValueError,error): validate_runtime(root,{})
    def test_empty_runtime(self): self.check_rejected([], 'runtime_payload_missing')
    def test_partial_runtime(self): self.check_rejected([('node/bin/node',b'fake',None)], 'runtime_payload_missing')
    def test_relative_escape(self): self.check_rejected([('hermes/escape',b'', '../../outside')], 'archive_link_escape')
    def test_absolute_escape(self): self.check_rejected([('hermes/escape',b'', '/etc/passwd')], 'archive_link_escape')
    def test_absolute_normalization_escape(self): self.check_rejected([('hermes/escape',b'', '/opt/scisense/python/../../etc')], 'archive_link_escape')
    def test_symlink_ancestor(self): self.check_rejected([('hermes/alias',b'', '../python'),('python/file',b'x',None),('hermes/alias/override',b'y',None)], 'archive_symlink_parent')
    def test_cyclic_symlink(self): self.check_rejected([('hermes/a',b'','b'),('hermes/b',b'','a')], 'archive_link_cycle')
    def test_duplicate_member(self): self.check_rejected([('node/file',b'a',None),('node/file',b'b',None)], 'manifest_duplicate')
    def test_unknown_root(self): self.check_rejected([('profile/context',b'private',None)], 'archive_path')
    def test_allowed_pinned_python_link(self): self.assertEqual(link_target('hermes/source/.venv/bin/python','/opt/scisense/python/bin/python3.14'), 'python/bin/python3.14')

if __name__ == '__main__': unittest.main()
