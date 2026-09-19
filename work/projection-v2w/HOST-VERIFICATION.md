# Direct droplet verification attempt

Command executed (read-only):

```sh
ssh -o BatchMode=yes -o ConnectTimeout=10 root@159.89.185.88 'cd /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6 && git rev-parse HEAD && cat work/in-season-learning-v1/active-fit-ref.json && systemctl list-timers --all "nfl-*" --no-pager'
```

Output:

```text
Host key verification failed.
```

Exit code 255. No remote command executed. Host commit, fit, schedule and local/remote code identity remain UNVERIFIED. No host-key checks bypassed. A trusted host connection is required; repository metadata is not substituted for host evidence.
