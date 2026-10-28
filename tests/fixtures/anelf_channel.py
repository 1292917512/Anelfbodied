"""Run the real Anelf HTTP channel with an isolated, deterministic agent fixture."""

import argparse
import asyncio
import datetime
import ipaddress
import json
import os
from pathlib import Path
import shutil
import socket
import sys
from types import SimpleNamespace


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def prepare(source, target):
    target.mkdir(parents=True, exist_ok=True)
    for name in ("agent", "core", "channels", "entities", "services", "acp", "app", "plugins"):
        for file in (source / name).rglob("*.py"):
            if "__pycache__" in file.parts or "tests" in file.parts:
                continue
            output = target / file.relative_to(source)
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file, output)
    shutil.copy2(source / "pyproject.toml", target / "pyproject.toml")
    for key, folder in (("ANELF_CONFIG_DIR", "config"), ("ANELF_DATA_DIR", "data"), ("ANELF_WORKSPACE_ROOT", "workspace")):
        os.environ[key] = str(target / folder)
    os.chdir(target)
    sys.path.insert(0, str(target))


def certificate(target):
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Embodied local test")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
            .public_key(key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(minutes=1))
            .not_valid_after(now + datetime.timedelta(days=1))
            .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
            .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]), critical=False)
            .sign(key, hashes.SHA256()))
    cert_file, key_file = target / "test-cert.pem", target / "test-key.pem"
    cert_file.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_file.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    return str(cert_file), str(key_file)


async def run(target):
    from channels.http_api.adapter import HttpApiChannel
    from channels.http_api.config import HttpApiConfig
    from agent.channel.output_tools import conversation_data_port
    from agent.execution_control import execution_control_port
    import agent.channel.manager as manager
    from core.log import set_log_level
    from core.tags import tag_label

    set_log_level("WARNING")
    cert, key = certificate(target)
    channels = []
    tasks = set()

    async def history(**_kwargs):
        return []

    async def stop(**_kwargs):
        return {"status": "idle"}

    async def reply(channel, message):
        await asyncio.sleep(0.05)
        prefix = tag_label("skill", "anelfbodied-control") + "\n"
        if not message.content.startswith(prefix):
            await channel.send_text(message.sender.user_id, "缺少频道技能", session_id=message.session_id)
            return
        content = message.content.removeprefix(prefix)
        if message.kind.value == "event":
            payload = json.loads(content)
            text = "回执已收到：" + payload["receipt"]["results"][0].get("answer", "完成")
        else:
            example = content.split("不使用代码围栏：", 1)[1].split("。id", 1)[0]
            command = json.loads(example)
            command["id"] = "fixture-" + message.message_id
            command["commands"] = [{"action": "ask", "question": "真实频道已连接，继续吗？", "options": ["继续"], "durationMs": 30000}]
            text = json.dumps(command, ensure_ascii=False)
        await channel.send_text(message.sender.user_id, text, session_id=message.session_id)
        channel._push_frame({"type": "turn_end", "turn_id": message.message_id}, f"user_http_api:{message.sender.user_id}#{message.session_id}")

    async def dispatch(channel, message):
        task = asyncio.create_task(reply(channel, message))
        tasks.add(task)
        task.add_done_callback(tasks.discard)

    manager.get_channel_manager = lambda: SimpleNamespace(dispatch_inbound=dispatch)
    conversation_data_port.set(SimpleNamespace(router=SimpleNamespace(sqlite=SimpleNamespace(fetch_conversation_with_id=history))))
    execution_control_port.set(stop)
    for tls in (False, True):
        channel = HttpApiChannel()
        channel._config = HttpApiConfig(host="127.0.0.1", port=free_port(), api_token="isolated-channel-test", ssl_certfile=cert if tls else "", ssl_keyfile=key if tls else "")
        await channel.start()
        channels.append(channel)
    (target / "ready.json").write_text(json.dumps({"urls": [f"{'https' if index else 'http'}://127.0.0.1:{channel.config.port}" for index, channel in enumerate(channels)], "token": "isolated-channel-test", "cert": cert}), encoding="utf-8")
    try:
        stop_file = target / "stop"
        stop_file.unlink(missing_ok=True)
        for _ in range(1200):
            if stop_file.exists():
                break
            await asyncio.sleep(0.25)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        for channel in channels:
            await channel.stop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.source.resolve(), args.output.resolve())
    asyncio.run(run(args.output.resolve()))
