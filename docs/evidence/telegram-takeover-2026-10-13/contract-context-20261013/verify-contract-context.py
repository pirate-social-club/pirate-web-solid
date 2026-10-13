#!/usr/bin/env python3
"""Verify a self-contained Telegram control contract context snapshot."""
import base64
import hashlib
import json
import sys
from pathlib import Path

path = Path(sys.argv[1] if len(sys.argv) > 1 else "control-contract-context.json")
snapshot = json.loads(path.read_text(encoding="utf-8"))

def object_hash(kind, data):
    return hashlib.sha1(f"{kind} {len(data)}".encode() + b"\0" + data).hexdigest()

def entries(data):
    result = {}
    offset = 0
    while offset < len(data):
        zero = data.index(b"\0", offset)
        mode, name = data[offset:zero].split(b" ", 1)
        result[name.decode()] = (mode.decode(), data[zero + 1:zero + 21].hex())
        offset = zero + 21
    return result

objects = {}
for object_id, value in snapshot["git_objects"].items():
    data = base64.b64decode(value["content_base64"], validate=True)
    kind = value["type"]
    assert object_hash(kind, data) == object_id, "Git object digest mismatch"
    objects[object_id] = (kind, data)
kind, commit = objects[snapshot["source_commit"]]
assert kind == "commit", "Missing commit object"
root_tree = commit.splitlines()[0].split(b" ", 1)[1].decode()
assert root_tree == snapshot["source_tree"], "Commit/tree mismatch"
for source in snapshot["source_files"]:
    tree = root_tree
    components = source["path"].split("/")
    assert len(components) == len(source["tree_chain"]), "Incomplete tree chain"
    for index, (component, link) in enumerate(zip(components, source["tree_chain"])):
        assert link["tree"] == tree and link["component"] == component, "Tree chain mismatch"
        kind, raw = objects[tree]
        assert kind == "tree", "Expected tree object"
        mode, child = entries(raw)[component]
        assert child == link["entry_sha"] and mode == link["mode"], "Tree entry mismatch"
        if index < len(components) - 1:
            assert mode == "40000", "Expected directory"
            tree = child
        else:
            assert child == source["git_blob"], "Blob inclusion mismatch"
    payload = source["content"].encode("utf-8")
    assert len(payload) == source["bytes"], "Source length mismatch"
    assert hashlib.sha256(payload).hexdigest() == source["sha256"], "Source SHA256 mismatch"
    assert object_hash("blob", payload) == source["git_blob"], "Source Git blob mismatch"
print(json.dumps({"result": "passed", "source_commit": snapshot["source_commit"],
    "git_objects_verified": len(objects), "exact_source_files_verified": len(snapshot["source_files"])}, indent=2))
