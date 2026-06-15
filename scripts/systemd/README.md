# Rahoot CD — host auto-deploy timer

Pull-based GitOps: a host systemd timer polls `origin/main` every 2 min and runs
`scripts/deploy.sh` only when a new commit lands (build → smoke → compose up →
health-gate → auto-rollback). Self-contained on the host; no Gitea-runner host
access needed (the runner does CI only, via `.gitea/workflows/ci.yml`).

Install (host, once):
    sudo cp scripts/systemd/razzoozle-deploy.{service,timer} /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable --now razzoozle-deploy.timer
    # seed so the first tick is a no-op:
    git -C source rev-parse origin/main > /opt/razzoozle/.last-deployed-sha

Watch:  journalctl -u razzoozle-deploy.service -f
Force:  sudo systemctl start razzoozle-deploy.service
