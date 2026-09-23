"""Verify a staged source archive and exercise captured inputs in isolation.

No publication or source/runtime activation. Numerical work uses the accepted
host interpreter and the existing full-slate canary with disclosed clock/final
fixtures. This is not new executable-restoration evidence.
"""
import argparse,hashlib,importlib.util,json
from pathlib import Path


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source-manifest',type=Path,required=True)
    parser.add_argument('--code-root',type=Path,required=True)
    parser.add_argument('--data-root',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    manifest=json.loads(args.source_manifest.read_bytes())
    for name,digest in manifest['files'].items():
        if hashlib.sha256((args.code_root/name).read_bytes()).hexdigest()!=digest:
            raise ValueError('Staged code differs: '+name)
    helper=args.code_root/'work/engine-rebuild/check_full_lifecycle.py'
    spec=importlib.util.spec_from_file_location('captured_initial_handoff',helper)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    original=(args.data_root/'work/in-season-learning-v1/active-fit-ref.json').read_bytes()
    result=module.verify(args.data_root,temp_parent=args.output.parent,code_commit=manifest['source_commit'])
    if (args.data_root/'work/in-season-learning-v1/active-fit-ref.json').read_bytes()!=original:
        raise ValueError('Original active fit changed')
    result.update(staged_files_verified=len(manifest['files']),source_restore_verified=False,
                  source_manifest_sha256=hashlib.sha256(args.source_manifest.read_bytes()).hexdigest(),
                  live_activation=False)
    args.output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))


if __name__=='__main__':main()
