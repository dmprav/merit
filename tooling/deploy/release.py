#!/usr/bin/env python3
"""Replace the web and worker on one Docker host behind a stable loopback listener."""

import argparse
import fcntl
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path


NGINX = "nginx:1.30.8-alpine@sha256:8eb04fe3b385090e9aa02961f77398ad09b6bf33ab07f6669a5bb7acce22c0d3"
CONFIG = "/run/merit-config"
SLOTS = ("blue", "green")


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()


def deploy(image, env_file):
    name = os.getenv("MERIT_DEPLOY_NAME", "merit")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,48}", name):
        raise ValueError("MERIT_DEPLOY_NAME must be a short lowercase Docker name")
    network = os.getenv("MERIT_DEPLOY_NETWORK", "merit_default")
    port = int(os.getenv("MERIT_DEPLOY_PORT", "8080"))
    timeout = int(os.getenv("MERIT_DEPLOY_READY_SECONDS", "90"))
    if not (1 <= port <= 65535 and timeout > 0 and env_file.is_file()):
        raise ValueError("Check the loopback port, readiness timeout and runtime env file")
    state = Path(os.getenv("MERIT_DEPLOY_STATE", Path.home() / ".local/state" / name)).resolve()
    os.umask(0o022)
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    config = state / "config"
    client = state / "client"
    proxy = f"{name}-proxy"
    template = Path(__file__).with_name("nginx.conf").read_text()
    labels = ["--label", f"merit.deploy={name}", "--label", f"merit.deploy.state={state}"]

    def inspect(container):
        if not docker("ps", "-aq", "--filter", f"name=^/{container}$"):
            return None
        info = json.loads(docker("inspect", container))[0]
        owner = info["Config"]["Labels"]
        if owner.get("merit.deploy") != name or owner.get("merit.deploy.state") != str(state):
            raise RuntimeError(f"Container name belongs to another deployment: {container}")
        return info

    def stop_slot(slot):
        for role in ("worker", "web"):
            container = f"{name}-{slot}-{role}"
            if inspect(container):
                docker("stop", "--time", "-1", container)
                docker("rm", container)

    def write_config(path, slot):
        upstream = f"set $backend {name}-{slot}-web:3000;\n            proxy_pass http://$backend;"
        path.write_text(template.replace("@slot@", slot).replace(
            "@proxy@", "return 503;" if slot == "empty" else upstream))

    def live_slot():
        deadline = time.monotonic() + timeout
        while True:
            try:
                return docker("exec", proxy, "wget", "-qO-", "-T", "2", "http://127.0.0.1:8081/")
            except subprocess.CalledProcessError:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.25)

    def verify_serving(slot):
        if slot == "empty":
            return
        docker("exec", proxy, "wget", "-qO", "/dev/null", "-T", "3", "http://127.0.0.1:8080/_ready")
        for role in ("web", "worker"):
            container = f"{name}-{slot}-{role}"
            status = inspect(container)["State"]
            if status["Status"] != "running" or status["Health"]["Status"] != "healthy":
                raise RuntimeError(f"{container} lost readiness after the switch")

    def reload_and_drain(slot):
        # nginx is PID 1. With no cache manager, its children are the workers serving
        # the old configuration. They exit only after finishing their requests.
        children = ("exec", proxy, "cat", "/proc/1/task/1/children")
        previous = set(docker(*children).split())
        docker("kill", "--signal", "HUP", proxy)
        deadline = time.monotonic() + timeout
        while live_slot() != slot:
            if time.monotonic() > deadline:
                raise RuntimeError(f"nginx did not activate {slot}; both releases retained")
            time.sleep(0.25)
        print(f"Traffic switched to {slot}; draining previous requests", flush=True)
        verify_serving(slot)
        next_check = time.monotonic() + 3
        while previous.intersection(docker(*children).split()):
            time.sleep(0.25)
            if time.monotonic() >= next_check:
                verify_serving(slot)
                next_check = time.monotonic() + 3
        verify_serving(slot)

    def await_health(containers):
        deadline = time.monotonic() + timeout
        while True:
            statuses = {}
            for container in containers:
                status = inspect(container)["State"]
                health = status.get("Health", {}).get("Status", "no health check")
                statuses[container] = health if status["Status"] == "running" else status["Status"]
            if all(value == "healthy" for value in statuses.values()):
                return
            if time.monotonic() > deadline or any(
                value not in ("healthy", "starting") for value in statuses.values()
            ):
                raise RuntimeError(f"Candidate readiness failed: {statuses}")
            time.sleep(0.5)

    def retain_assets(web):
        # Publish each completed content-hashed file atomically. An open browser
        # can still lazy-load its build's assets after its release is retired.
        with tempfile.TemporaryDirectory(dir=state) as staging:
            docker("cp", f"{web}:/opt/merit/app/dist/client/assets/.", staging)
            for source in Path(staging).rglob("*"):
                if source.is_file():
                    target = client / "assets" / source.relative_to(staging)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if not target.exists():
                        source.chmod(0o644)
                        os.link(source, target)

    with (state / "lock").open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("Another deployment is using this state directory") from error
        lock.seek(0)
        owner = lock.read().strip()
        if owner and owner != name:
            raise RuntimeError(f"State directory already belongs to {owner}")
        if not owner:
            lock.write(name)
            lock.flush()
        docker("network", "inspect", network)
        # Resolve the tag once so both processes use identical bytes.
        image_id = docker("image", "inspect", "--format", "{{.Id}}", image)
        config.mkdir(exist_ok=True)
        client.mkdir(exist_ok=True)
        active_config = config / "nginx.conf"
        confirmed = config / "confirmed.conf"
        staged = config / "next.conf"
        if not confirmed.exists():
            write_config(staged, "empty")
            staged.replace(confirmed)

        def restore_confirmed():
            staged.write_bytes(confirmed.read_bytes())
            staged.replace(active_config)

        # A crash during the switch can leave a live but unverified generation.
        # Keep the previous pair until both the public route and new worker pass.
        interrupted = not active_config.is_file() or active_config.read_bytes() != confirmed.read_bytes()
        if interrupted:
            restore_confirmed()
        active = confirmed.read_text().splitlines()[0].removeprefix("# slot ")
        if active not in (*SLOTS, "empty"):
            raise RuntimeError("Unrecognized active nginx configuration")
        candidate = "green" if active == "blue" else "blue"
        info = inspect(proxy)
        if not info:
            docker("run", "-d", "--name", proxy, *labels, "--restart", "unless-stopped",
                   "--network", network, "-p", f"127.0.0.1:{port}:8080",
                   "-v", f"{config}:{CONFIG}:ro", "-v", f"{client}:/srv/merit:ro",
                   NGINX, "nginx", "-c", f"{CONFIG}/nginx.conf", "-g", "daemon off;")
        else:
            binding = info["HostConfig"]["PortBindings"].get("8080/tcp")
            if binding != [{"HostIp": "127.0.0.1", "HostPort": str(port)}]:
                raise ValueError("Existing proxy uses a different loopback port")
            if not info["State"]["Running"]:
                docker("start", proxy)
        proxy_ip = inspect(proxy)["NetworkSettings"]["Networks"][network]["IPAddress"]
        web, worker = (f"{name}-{candidate}-{role}" for role in ("web", "worker"))
        if live_slot() != active or inspect(web) or inspect(worker):
            # Reconcile a previous interrupted invocation before reusing a slot
            # that a surviving nginx worker could still be serving.
            reload_and_drain(active)
            stop_slot(candidate)
        try:
            for role, container in (("web", web), ("worker", worker)):
                env = ["-e", f"TRUSTED_PROXY_IP={proxy_ip}"] if role == "web" else []
                docker("run", "-d", "--init", "--name", container, *labels,
                       "--restart", "unless-stopped", "--network", network,
                       "--env-file", str(env_file), "-e", "PORT=3000", *env, image_id, role)
            await_health((web, worker))
            docker("exec", proxy, "wget", "-qO", "/dev/null", "-T", "5", f"http://{web}:3000/_ready")
            retain_assets(web)
            write_config(staged, candidate)
            docker("exec", proxy, "nginx", "-t", "-c", f"{CONFIG}/next.conf")
        except (Exception, KeyboardInterrupt):
            stop_slot(candidate)
            raise
        staged.replace(active_config)
        try:
            reload_and_drain(candidate)
        except (Exception, KeyboardInterrupt):
            print(f"Cutover failed; restoring {active}", file=sys.stderr, flush=True)
            restore_confirmed()
            reload_and_drain(active)
            stop_slot(candidate)
            raise
        staged.write_bytes(active_config.read_bytes())
        staged.replace(confirmed)
        if active in SLOTS:
            stop_slot(active)
        print(f"{candidate} is serving on 127.0.0.1:{port}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", help="locally built or pulled release image")
    parser.add_argument("env_file", type=Path, help="Docker-format runtime environment")
    args = parser.parse_args()
    try:
        deploy(args.image, args.env_file)
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        sys.exit(str(error))
