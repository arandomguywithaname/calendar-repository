# zip-bomb-test

A small, mild **zip bomb** for testing decompression defenses.

## What's here

| file | description |
|------|-------------|
| `generate_zip_bomb.py` | Generator. Streams zero bytes through DEFLATE to build a flat (single-entry) archive. |
| `bomb-1gib.zip` | Pre-generated artifact: **1,043,638 bytes on disk → 1,073,741,824 bytes (1 GiB) decompressed** (≈1,029x). |

## What a zip bomb is (and what this one *isn't*)

A zip bomb is an archive whose compressed size is tiny but whose decompressed
size is large — it exists to stress code that unzips untrusted input.

This one is deliberately the **mildest** variant:

- **Flat**, not recursive — one archive, one file, one layer. Extracting it
  costs at most 1 GiB of disk, then stops. It does not contain nested zips and
  does not expand exponentially.
- **Small** — 1 GiB total, which modern machines handle without trouble.
- **Predictable** — the payload is all zero bytes, so it compresses right at
  DEFLATE's theoretical ceiling (~1032:1).

## Intended use

Testing that **your own** systems refuse or safely bound decompression:

- upload endpoints that cap decompressed payload size,
- archive scanners / antivirus zip-bomb guards,
- any code path that unzips untrusted input and should enforce a size limit.

Only use it against systems you are authorized to test. Do not send it to
services you do not own or operate — that is what turns a test artifact into a
denial-of-service attack.

## Regenerate / customize

```bash
# default: 1 GiB -> bomb-1gib.zip
python3 generate_zip_bomb.py

# custom size and name, e.g. 256 MiB
python3 generate_zip_bomb.py -o bomb-256mib.zip -s 256

# see all options
python3 generate_zip_bomb.py --help
```

## Inspect without extracting

List the entry and its true decompressed size straight from the archive
directory — no need to write 1 GiB to disk:

```bash
unzip -l bomb-1gib.zip
```
