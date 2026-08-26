#!/usr/bin/env python3
"""
Generate a small, mild "zip bomb" test artifact.

WHAT THIS IS
------------
A zip bomb is an archive whose *compressed* size is tiny but whose
*decompressed* size is large. This generator produces the mildest variant:
a single-entry ("flat") DEFLATE archive whose one member decompresses to a
configurable total size (default: 1 GiB). Highly-repetitive input (zero
bytes) compresses at close to DEFLATE's theoretical ceiling, so the final
.zip is only a few hundred KB while the extracted file is ~1 GiB.

INTENDED USE
------------
Testing that YOUR OWN systems refuse or safely bound decompression:
  * upload endpoints that reject oversized decompressed payloads,
  * archive scanners / antivirus zip-bomb guards,
  * any code path that unzips untrusted input with a size cap.

It is deliberately "flat" (one layer, one file) and small (1 GiB). It is not
recursive and not exponential, so extracting it costs at most `--size-mib`
of disk — nothing that would harm a modern machine.

DO NOT feed this to systems you are not authorized to test.

The archive streams its payload through the compressor, so generating it
never holds the full uncompressed payload in memory or on disk.
"""

import argparse
import zipfile

# 1 MiB of zero bytes; reused for every chunk so we never allocate the
# full payload at once.
CHUNK = b"\x00" * (1024 * 1024)


def build_bomb(out_path: str, size_mib: int, entry_name: str) -> None:
    """Write a flat DEFLATE zip whose single entry decompresses to size_mib MiB."""
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        with zf.open(entry_name, "w") as member:
            for _ in range(size_mib):
                member.write(CHUNK)


def report(out_path: str) -> None:
    """Print compressed vs. decompressed sizes read from the zip's directory."""
    with zipfile.ZipFile(out_path) as zf:
        info = zf.infolist()[0]
        ratio = info.file_size / max(info.compress_size, 1)
        print(f"archive:          {out_path}")
        print(f"entry:            {info.filename}")
        print(f"compressed size:  {info.compress_size:,} bytes")
        print(f"decompressed size:{info.file_size:,} bytes "
              f"({info.file_size / 1024 / 1024:.0f} MiB)")
        print(f"compression ratio:{ratio:,.0f}x")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("-o", "--output", default="bomb-1gib.zip",
                        help="output .zip path (default: bomb-1gib.zip)")
    parser.add_argument("-s", "--size-mib", type=int, default=1024,
                        help="total decompressed size in MiB (default: 1024 = 1 GiB)")
    parser.add_argument("-n", "--entry-name", default="bomb.bin",
                        help="name of the single file inside the archive")
    args = parser.parse_args()

    if args.size_mib <= 0:
        parser.error("--size-mib must be positive")

    build_bomb(args.output, args.size_mib, args.entry_name)
    report(args.output)


if __name__ == "__main__":
    main()
