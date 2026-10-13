#!/usr/bin/env python3
"""Verify exported control-plane Git objects and source-file inclusion proofs."""
from pathlib import Path
import base64
import hashlib
import json

root = Path(__file__).resolve().parent
proof = json.loads((root / "control-git-object-proofs.json").read_text())


def object_hash(kind, data):
    header = f"{kind} {len(data)}".encode() + b"\0"
    return hashlib.sha1(header + data).hexdigest()


def tree_entries(data):
    result = {}
    offset = 0
    while offset < len(data):
        zero = data.index(b"\0", offset)
        mode, name = data[offset:zero].split(b" ", 1)
        object_id = data[zero + 1:zero + 21].hex()
        result[name.decode()] = (mode.decode(), object_id)
        offset = zero + 21
    return result


objects = {}
for object_id, entry in proof["objects"].items():
    kind = entry["type"]
    data = base64.b64decode(entry["content_base64"], validate=True)
    if object_hash(kind, data) != object_id:
        raise ValueError(f"Git object hash mismatch: {object_id}")
    objects[object_id] = (kind, data)

for entry in proof["path_proofs"]:
    kind, commit = objects[entry["commit"]]
    if kind != "commit":
        raise ValueError("Expected a commit object")
    tree = commit.splitlines()[0].split(b" ", 1)[1].decode()
    components = entry["path"].split("/")
    if len(components) != len(entry["tree_chain"]):
        raise ValueError("Tree proof length mismatch")
    for index, component in enumerate(components):
        supplied = entry["tree_chain"][index]
        if supplied["tree"] != tree or supplied["component"] != component:
            raise ValueError(f"Tree chain mismatch: {entry['path']}")
        kind, data = objects[tree]
        if kind != "tree":
            raise ValueError("Expected a tree object")
        mode, child = tree_entries(data)[component]
        if supplied["entry_sha"] != child:
            raise ValueError("Tree entry mismatch")
        if index < len(components) - 1:
            if mode != "40000":
                raise ValueError("Expected a directory")
            tree = child
        else:
            payload = (root / entry["export_path"]).read_bytes()
            if child != entry["blob"] or object_hash("blob", payload) != child:
                raise ValueError(f"Source file binding mismatch: {entry['path']}")

print(json.dumps({
    "git_objects_verified": len(objects),
    "exact_source_files_verified": len(proof["path_proofs"]),
    "result": "passed",
}, indent=2))
