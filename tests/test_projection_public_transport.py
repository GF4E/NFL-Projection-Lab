"""Anonymous transport failures cannot become a public publication proof."""
import json,subprocess,tempfile,unittest,urllib.error
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from engine.projection import public_closeout as p

class PublicTransportTests(unittest.TestCase):
    def response(self,body=b'{}\n200',code=0):return SimpleNamespace(stdout=body,stderr=b'',returncode=code)
    def test_exact_bytes_default_identity_and_bounded_no_redirect_command(self):
        with patch.object(p.subprocess,'run',return_value=self.response(b'{"x":1}\n\n200')) as command:
            self.assertEqual(p.fetch('https://fixture.invalid/','curl'),b'{"x":1}\n')
        args=command.call_args.args[0]
        self.assertEqual(args[:2],['curl','--disable']);self.assertNotIn('--location',args)
        self.assertNotIn('--user-agent',args);self.assertNotIn('--cookie',args);self.assertNotIn('--header',args)
        self.assertEqual(args[args.index('--max-filesize')+1],str(p.LIMIT))
        self.assertEqual(command.call_args.kwargs['timeout'],12)
    def test_denial_redirect_and_error_are_not_data(self):
        for status in (301,302,401,403,404,500):
            with self.subTest(status=status),patch.object(p.subprocess,'run',return_value=self.response(b'body\n'+str(status).encode())),self.assertRaises(urllib.error.HTTPError):
                p.fetch('https://fixture.invalid/','curl')
    def test_oversize_missing_status_and_timeout_fail(self):
        for body in (b'body',b'body\nunknown',b'x'*(p.LIMIT+1)+b'\n200'):
            with patch.object(p.subprocess,'run',return_value=self.response(body)),self.assertRaises(ValueError):p.fetch('https://fixture.invalid/','curl')
        for error in (subprocess.TimeoutExpired('curl',12),FileNotFoundError()):
            with patch.object(p.subprocess,'run',side_effect=error),self.assertRaises(urllib.error.URLError):p.fetch('https://fixture.invalid/','curl')
        with patch.object(p.subprocess,'run',return_value=self.response(code=63)),self.assertRaises(urllib.error.URLError):p.fetch('https://fixture.invalid/','curl')
    def test_unknown_transport_fails_even_with_valid_mapping(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'config').mkdir()
            (root/p.CONFIG).write_text(json.dumps({'schema':'public-closeout-endpoints-v1','base_url':'https://fixture.invalid','transport':'unqualified'}))
            with self.assertRaises(ValueError):p.mapping(root,{'artifacts':{},'season':2026,'week':2})
        with self.assertRaises(ValueError):p.fetch('https://fixture.invalid/','unqualified')

    def test_watchdog_rechecks_when_qualified_transport_changes(self):
        from scripts import projection_watchdog as w
        prior={'state':'ACCESS_UNQUALIFIED','http_status':403}
        with patch.object(p,'fetch',return_value=b'{}') as request,patch.object(w,'board_identity',return_value={'fixture':True}):
            result=w.public_probe(prior,transport='curl')
        self.assertEqual(result['state'],'VERIFIED');request.assert_called_once()
        failed={'state':'ACCESS_UNQUALIFIED','http_status':403,'transport':'curl'}
        with patch.object(p,'fetch') as request:self.assertEqual(w.public_probe(failed,transport='curl'),failed)
        request.assert_not_called()

    def test_watchdog_rejects_denied_and_malformed_public_data(self):
        from scripts import projection_watchdog as w
        with patch.object(p,'fetch',side_effect=urllib.error.HTTPError('https://fixture.invalid',403,'denied',None,None)):
            self.assertEqual(w.public_probe(transport='curl')['state'],'ACCESS_UNQUALIFIED')
        with patch.object(p,'fetch',return_value=b'invalid json'):
            self.assertEqual(w.public_probe(transport='curl')['state'],'SCHEMA_UNQUALIFIED')
