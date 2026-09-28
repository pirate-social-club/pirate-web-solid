#!/usr/bin/env python3
"""Read-only staging mainnet route check with live DS, DNSSEC and DANE."""

import hashlib
import json
import socket
import ssl
import subprocess
import time
from datetime import datetime, timezone

import dns.dnssec
import dns.message
import dns.name
import dns.query
import dns.rdatatype
from cryptography import x509
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat


ROOT = dns.name.from_text("8s28.")
AUTHORITIES = (("ns1", 5301, "81.15.150.167"),
               ("ns2", 5302, "94.103.168.209"))
GATEWAY_PORT = 8443
READER_HOST = "ubuntu@81.15.150.162"
COMMUNITY_ID = "community_05833acf-710f-4b6e-b1f1-9e3da59dc11f"
CLAIMED = "membertest"

REMOTE_READ = r"""
import base64
import json
from pathlib import Path
from urllib.request import Request, urlopen
key = Path('/etc/pirate-hns-staging/mainnet-reader/client-key').read_text().strip()
if not key:
    raise SystemExit('reader key unavailable')
authorization = 'Basic ' + base64.b64encode(('x:' + key).encode()).decode()
def call(method, params):
    body = json.dumps({'method': method, 'params': params}, separators=(',', ':')).encode()
    request = Request('http://127.0.0.1:12039/', data=body,
                      headers={'Authorization': authorization,
                               'Content-Type': 'application/json'})
    with urlopen(request, timeout=8) as response:
        value = json.load(response)
    if value.get('error') is not None:
        raise SystemExit('HSD read failed')
    return value.get('result')
print(json.dumps({'chain': call('getblockchaininfo', []),
                  'safe': call('getnameresource', ['8s28', True])},
                 separators=(',', ':')))
"""


def live_chain_records():
    read = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
         "-o", "StrictHostKeyChecking=yes", READER_HOST,
         "sudo", "-n", "python3", "-"], input=REMOTE_READ, text=True,
        capture_output=True, timeout=30, check=True)
    result = json.loads(read.stdout)
    chain = result.get("chain") or {}
    resource = result.get("safe") or {}
    if chain.get("chain") != "main" or chain.get("headers", 0) - chain.get("blocks", 0) > 5:
        raise ValueError("Independent mainnet reader is unavailable or behind")
    records = resource.get("records")
    if not isinstance(records, list):
        raise ValueError("8s28 has no safe mainnet resource")
    return records, chain["blocks"]


def start_tunnel():
    child = subprocess.Popen(
        ["ssh", "-N", "-T", "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes",
         "-o", "ConnectTimeout=8", "-o", "StrictHostKeyChecking=yes",
         "-L", "127.0.0.1:5301:81.15.150.167:53",
         "-L", "127.0.0.1:5302:94.103.168.209:53",
         "-L", "127.0.0.1:8443:81.15.150.167:443", READER_HOST],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL)
    for _ in range(30):
        if child.poll() is not None:
            raise ValueError("Staging validation tunnel failed to start")
        try:
            for port in (5301, 5302, GATEWAY_PORT):
                with socket.create_connection(("127.0.0.1", port), timeout=1):
                    pass
            return child
        except OSError:
            time.sleep(0.2)
    child.terminate()
    child.wait(timeout=5)
    raise ValueError("Staging validation tunnel timed out")


def query(port, name, record_type):
    request = dns.message.make_query(name, record_type, want_dnssec=True)
    response = dns.query.tcp(request, "127.0.0.1", port=port, timeout=8)
    if response.rcode() != 0 or not request.is_response(response):
        raise ValueError(f"{name} {record_type}: DNS response refused")
    wanted = dns.rdatatype.from_text(record_type)
    rrset = next((rr for rr in response.answer if rr.rdtype == wanted), None)
    signature = next((rr for rr in response.answer
                      if rr.rdtype == dns.rdatatype.RRSIG and rr.covers == wanted), None)
    if rrset is None or signature is None:
        raise ValueError(f"{name} {record_type}: signed answer missing")
    return rrset, signature


def trusted_keys(port, expected_ds):
    rrset, signature = query(port, "8s28.", "DNSKEY")
    matching = []
    for key in rrset:
        derived = sorted(dns.dnssec.make_ds(ROOT, key, algorithm).to_text().lower()
                         for algorithm in ("SHA256", "SHA384"))
        if derived == expected_ds:
            matching.append(key)
    if len(matching) != 1:
        raise ValueError("Plan or chain DS does not authenticate the DNSKEY")
    anchor = dns.rrset.from_rdata(ROOT, rrset.ttl, matching[0])
    dns.dnssec.validate(rrset, signature, {ROOT: anchor})
    return rrset


def signed(port, name, record_type, keys):
    rrset, signature = query(port, name, record_type)
    dns.dnssec.validate(rrset, signature, {ROOT: keys})
    return rrset


def https_status(host, expected_spki):
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    # DANE-EE usage 3 authenticates the server key below, including names
    # outside the public WebPKI. The TLS handshake still uses the real SNI.
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    with socket.create_connection(("127.0.0.1", GATEWAY_PORT), timeout=8) as raw:
        with context.wrap_socket(raw, server_hostname=host) as tls:
            der = tls.getpeercert(binary_form=True)
            if not der:
                raise ValueError(f"{host}: no certificate")
            cert = x509.load_der_x509_certificate(der)
            spki = hashlib.sha256(cert.public_key().public_bytes(
                Encoding.DER, PublicFormat.SubjectPublicKeyInfo)).hexdigest()
            now = datetime.now(timezone.utc)
            if spki != expected_spki or cert.not_valid_before.replace(tzinfo=timezone.utc) > now \
                    or cert.not_valid_after.replace(tzinfo=timezone.utc) <= now:
                raise ValueError(f"{host}: DANE certificate mismatch or expiry")
            tls.sendall((f"GET / HTTP/1.1\r\nHost: {host}\r\n"
                         "Connection: close\r\n\r\n").encode())
            response = tls.makefile("rb")
            status = response.readline(256).decode("ascii", "replace").strip()
            header_bytes = 0
            while True:
                line = response.readline(8192)
                header_bytes += len(line)
                if not line or line in (b"\r\n", b"\n"):
                    break
                if header_bytes > 32768:
                    raise ValueError(f"{host}: HTTP headers exceed bound")
            body = response.read(2_000_001)
            if len(body) > 2_000_000:
                raise ValueError(f"{host}: HTTP body exceeds bound")
            return status, body


def check_route():
    records, height = live_chain_records()
    ds = sorted(f"{r['keyTag']} {r['algorithm']} {r['digestType']} {r['digest'].lower()}"
                for r in records if r["type"] == "DS")
    if len(ds) != 2:
        raise ValueError("Safe mainnet resource does not contain two DS records")
    expected_ns = ["ns1.8s28.", "ns2.8s28."]
    actual_ns = sorted(r["ns"] for r in records if r["type"] == "NS")
    if actual_ns != expected_ns:
        raise ValueError("Mainnet nameserver delegation changed")
    for label, _, address in AUTHORITIES:
        if not any(r.get("type") == "GLUE4" and r.get("ns") == f"{label}.8s28."
                   and r.get("address") == address for r in records):
            raise ValueError(f"Mainnet {label} glue changed")
    controls = [value for r in records if r["type"] == "TXT"
                for value in r.get("txt", []) if value.startswith("pirate-verification=")]
    if len(controls) != 1:
        raise ValueError("Safe mainnet resource must have one Pirate challenge TXT")
    control = controls[0]
    expected_spki = "1a518978ace36f3803db5ecbe24ce43e5622c8556ab78609ede4ee56decf23ba"
    hosts = ["app.8s28", f"{CLAIMED}.8s28", "unclaimedtest.8s28"]
    for label, port, address in AUTHORITIES:
        keys = trusted_keys(port, ds)
        ns_a = signed(port, f"{label}.8s28.", "A", keys)
        if [record.address for record in ns_a] != [address]:
            raise ValueError(f"{label}: signed address disagrees with glue")
        txt = signed(port, "_pirate.8s28.", "TXT", keys)
        values = [b"".join(record.strings).decode() for record in txt]
        if values != [control]:
            raise ValueError(f"{label}: signed control TXT mismatch")
        for host in hosts:
            host_a = signed(port, f"{host}.", "A", keys)
            if [record.address for record in host_a] != ["81.15.150.167"]:
                raise ValueError(f"{label}: {host} address mismatch")
            tlsa = signed(port, f"_443._tcp.{host}.", "TLSA", keys)
            if not any((record.usage, record.selector, record.mtype,
                        record.cert.hex()) == (3, 1, 1, expected_spki)
                       for record in tlsa):
                raise ValueError(f"{label}: {host} signed TLSA mismatch")
    responses = {host: https_status(host, expected_spki) for host in hosts}
    wanted = {host: (421 if host == "unclaimedtest.8s28" else 200) for host in hosts}
    for host, (status, body) in responses.items():
        if not status.startswith(f"HTTP/1.1 {wanted[host]} "):
            raise ValueError(f"{host}: expected {wanted[host]}, got {status}")
        if wanted[host] == 200 and b"<html" not in body[:16384].lower():
            raise ValueError(f"{host}: 200 response did not contain an HTML page")
    community_match = COMMUNITY_ID.encode() in responses["app.8s28"][1]
    claimed_host = f"{CLAIMED}.8s28"
    claimed_match = claimed_host.encode() in responses[claimed_host][1]
    if not community_match or not claimed_match:
        raise ValueError("Gateway content does not match attached community and name")
    print(json.dumps({"root": "8s28", "mainnet_safe_height": height,
                      "authorities": 2, "dnssec_validated": True,
                      "dane_spki_match": True,
                      "statuses": {host: status for host, (status, _) in responses.items()},
                      "content_checks": {"community_id_in_app_html": community_match,
                                         "claimed_name_in_member_html": claimed_match}}))


def main():
    tunnel = start_tunnel()
    try:
        check_route()
    finally:
        tunnel.terminate()
        tunnel.wait(timeout=5)


if __name__ == "__main__":
    main()
