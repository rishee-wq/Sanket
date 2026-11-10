"""
Remote access to the INCLUDE dataset (AI4Bharat, CC BY 4.0) on Zenodo.

INCLUDE is 56.8 GB split over 44 zip files. A zip keeps its table of contents
(the "central directory") at the END of the file, so we can:
  1. fetch only the last few MB of every zip with an HTTP Range request and
     learn the name, offset and size of every video inside it;
  2. later fetch exactly the byte range of each video we want.
That turns "download 57 GB" into "download only the words we train on".

    python ml/include_remote.py index                 # build ml/data/include_index.json
    python ml/include_remote.py words                 # list every word and its video count
    python ml/include_remote.py download --words-file ml/vocab_words.txt
"""
from __future__ import annotations

import argparse
import io
import json
import struct
import sys
import zipfile
import zlib
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

RECORD = "4010759"
API = f"https://zenodo.org/api/records/{RECORD}"
DATA = Path(__file__).parent / "data"
INDEX_PATH = DATA / "include_index.json"
RAW_DIR = DATA / "raw" / "include"
VIDEO_EXTS = {".mov", ".mp4", ".avi", ".mkv"}


class HttpRangeFile(io.RawIOBase):
    """A read-only, seekable file backed by HTTP Range requests, with a cached tail."""

    def __init__(self, url: str, session: requests.Session, tail_bytes: int = 4 << 20):
        self.url, self.session, self.pos = url, session, 0
        head = session.get(url, headers={"Range": "bytes=0-0"}, timeout=60)
        head.raise_for_status()
        self.size = int(head.headers["Content-Range"].split("/")[1])
        self.tail_start = max(0, self.size - tail_bytes)
        self.tail = self._fetch(self.tail_start, self.size - 1)

    def _fetch(self, start: int, end: int) -> bytes:
        r = self.session.get(self.url, headers={"Range": f"bytes={start}-{end}"}, timeout=120)
        r.raise_for_status()
        return r.content

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=io.SEEK_SET):
        self.pos = {io.SEEK_SET: offset, io.SEEK_CUR: self.pos + offset, io.SEEK_END: self.size + offset}[whence]
        return self.pos

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.size - self.pos
        end = min(self.size, self.pos + n)
        if self.pos >= end:
            return b""
        if self.pos >= self.tail_start:
            data = self.tail[self.pos - self.tail_start : end - self.tail_start]
        else:
            data = self._fetch(self.pos, end - 1)
        self.pos = end
        return data


def word_of(path: str) -> str:
    """'Adjectives/1. loud/MVI_5177.MOV' -> 'loud'."""
    folder = path.split("/")[-2]
    head, _, rest = folder.partition(".")
    name = rest if rest and head.strip().isdigit() else folder
    return name.strip().lower()


def build_index() -> dict:
    files = requests.get(API, timeout=60).json()["files"]
    zips = sorted(f["key"] for f in files if f["key"].endswith(".zip"))
    entries = []

    def scan(key: str):
        url = f"{API}/files/{key}/content"
        zf = zipfile.ZipFile(HttpRangeFile(url, requests.Session()))
        return key, [
            {
                "zip": key,
                "path": i.filename,
                "offset": i.header_offset,
                "csize": i.compress_size,
                "size": i.file_size,
                "method": i.compress_type,
            }
            for i in zf.infolist()
            if not i.is_dir()
        ]

    with ThreadPoolExecutor(6) as pool:
        for fut in as_completed([pool.submit(scan, k) for k in zips]):
            key, got = fut.result()
            entries.extend(got)
            print(f"  {key}: {len(got)} files", flush=True)

    index = {"record": RECORD, "entries": sorted(entries, key=lambda e: e["path"])}
    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    INDEX_PATH.write_text(json.dumps(index))
    return index


def load_index() -> dict:
    return json.loads(INDEX_PATH.read_text()) if INDEX_PATH.exists() else build_index()


def videos(index: dict):
    return [e for e in index["entries"] if Path(e["path"]).suffix.lower() in VIDEO_EXTS]


def fetch_entry(entry: dict, session: requests.Session) -> bytes:
    """One Range request: local file header + (compressed) data of a single zip member."""
    url = f"{API}/files/{entry['zip']}/content"
    start = entry["offset"]
    # Local header is 30 bytes + name + extra field; 1 KB of slack covers the variable part.
    end = start + 30 + 1024 + entry["csize"]
    r = session.get(url, headers={"Range": f"bytes={start}-{end}"}, timeout=600)
    r.raise_for_status()
    blob = r.content
    sig, _, _, method, _, _, _, _, _, name_len, extra_len = struct.unpack("<IHHHHHIIIHH", blob[:30])
    if sig != 0x04034B50:
        raise ValueError(f"bad local header for {entry['path']}")
    body = blob[30 + name_len + extra_len : 30 + name_len + extra_len + entry["csize"]]
    if method == zipfile.ZIP_STORED:
        return body
    if method == zipfile.ZIP_DEFLATED:
        return zlib.decompressobj(-15).decompress(body)
    raise ValueError(f"unsupported compression {method}")


def download(words: set[str], workers: int):
    todo = [e for e in videos(load_index()) if word_of(e["path"]) in words]
    missing = words - {word_of(e["path"]) for e in todo}
    if missing:
        print("No videos for:", sorted(missing))
    todo = [e for e in todo if not (RAW_DIR / e["path"]).exists()]
    total = sum(e["csize"] for e in todo)
    print(f"{len(todo)} videos to fetch, {total / 1e9:.2f} GB", flush=True)

    def work(entry):
        out = RAW_DIR / entry["path"]
        out.parent.mkdir(parents=True, exist_ok=True)
        last = None
        for _ in range(4):
            try:
                data = fetch_entry(entry, requests.Session())
                if len(data) != entry["size"]:
                    raise ValueError("size mismatch")
                tmp = out.with_suffix(out.suffix + ".part")
                tmp.write_bytes(data)
                tmp.replace(out)
                return entry["csize"]
            except Exception as err:  # network hiccup: retry
                last = err
        print(f"FAILED {entry['path']}: {last}", flush=True)
        return 0

    done = 0
    with ThreadPoolExecutor(workers) as pool:
        for n, fut in enumerate(as_completed([pool.submit(work, e) for e in todo]), 1):
            done += fut.result()
            if n % 25 == 0 or n == len(todo):
                print(f"  {n}/{len(todo)} videos, {done / 1e9:.2f}/{total / 1e9:.2f} GB", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("index")
    sub.add_parser("words")
    dl = sub.add_parser("download")
    dl.add_argument("--words-file", type=Path, required=True)
    dl.add_argument("--workers", type=int, default=10)
    args = parser.parse_args()

    if args.cmd == "index":
        idx = build_index()
        print(len(idx["entries"]), "entries,", len(videos(idx)), "videos")
    elif args.cmd == "words":
        count, size, cat = Counter(), defaultdict(int), {}
        for e in videos(load_index()):
            w = word_of(e["path"])
            count[w] += 1
            size[w] += e["csize"]
            cat[w] = e["path"].split("/")[0]
        for w in sorted(count, key=lambda w: (cat[w], w)):
            print(f"{cat[w]:28s} {w:28s} {count[w]:3d} videos {size[w] / 1e6:7.0f} MB")
    else:
        lines = args.words_file.read_text().splitlines()
        words = {w.strip().lower() for w in lines if w.strip() and not w.startswith("#")}
        download(words, args.workers)


if __name__ == "__main__":
    sys.exit(main())
