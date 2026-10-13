"""Verify an OCI archive's config/manifest identity across Docker image stores.

Caller must first verify the CI artifact checksum. No extraction or file writes.
Print only the verified loaded image ID; never print container environment.
"""
import hashlib
import json
import re
import subprocess
import sys
import tarfile

if not __debug__:
    raise RuntimeError("Image verification requires Python assertions enabled")


def check(archive, ci_id, revision, loaded):
    assert re.fullmatch(r"sha256:[a-f0-9]{64}", ci_id)
    assert re.fullmatch(r"[a-f0-9]{40}", revision)
    small = {}
    with tarfile.open(archive, "r|gz") as stream:
        for member in stream:
            if member.isfile() and member.size <= 65536:
                assert len(small) < 256
                small[member.name] = stream.extractfile(member).read()

    def blob(digest):
        assert re.fullmatch(r"sha256:[a-f0-9]{64}", digest)
        raw = small["blobs/sha256/" + digest.split(":")[1]]
        assert "sha256:" + hashlib.sha256(raw).hexdigest() == digest
        return json.loads(raw)

    index = json.loads(small["index.json"])
    assert len(index["manifests"]) == 1
    manifest_id = index["manifests"][0]["digest"]
    manifest = blob(manifest_id)
    config_id = manifest["config"]["digest"]
    config = blob(config_id)
    assert ci_id in (config_id, manifest_id), "CI ID must bind to archive identity"
    legacy = json.loads(small["manifest.json"])
    assert len(legacy) == 1
    assert legacy[0]["Config"] == "blobs/sha256/" + config_id.split(":")[1]
    assert legacy[0]["Layers"] == ["blobs/sha256/" + row["digest"].split(":")[1] for row in manifest["layers"]]
    assert loaded["Id"] in (config_id, manifest_id), "Loaded ID is not the CI archive"
    assert config["os"] == loaded["Os"] == "linux"
    assert config["architecture"] == loaded["Architecture"] == "amd64"
    assert config["config"]["User"] == loaded["Config"]["User"] == "node"
    assert config["config"]["Labels"]["org.opencontainers.image.revision"] == revision
    assert loaded["Config"]["Labels"]["org.opencontainers.image.revision"] == revision
    assert config["rootfs"]["diff_ids"] == loaded["RootFS"]["Layers"], "Root filesystem differs"
    return loaded["Id"]


if __name__ == "__main__":
    loaded = json.loads(subprocess.check_output(["docker", "image", "inspect", "personal-blog:ci"]))[0]
    print(check(sys.argv[1], sys.argv[2], sys.argv[3], loaded))
