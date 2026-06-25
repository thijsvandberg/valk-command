#!/usr/bin/env python3
"""Summarise a Bridge production log (logs/prod-*.log) into a compact, structured
digest so an AI (or a human) can triage it fast instead of scrolling hundreds of
raw lines.

WHY: `next start` is teed to a timestamped file by tools/scripts/start-prod.sh. The
app logger writes lines like `YYYY-MM-DD HH:MM:SS LEVEL [tag] message ...`. This
script aggregates those into the things that matter for diagnosis: real errors,
slow queries/endpoints, integration warnings, and crash markers. It deliberately
does NOT judge or prioritise; the /prod-logs command layer does that.

Usage:
  python3 tools/scripts/prod-log-digest.py                 # newest log in logs/
  python3 tools/scripts/prod-log-digest.py path/to.log     # a specific file
  python3 tools/scripts/prod-log-digest.py --files 3       # merge the newest 3
  python3 tools/scripts/prod-log-digest.py --slow-ms 800   # access-slow threshold
"""
from __future__ import annotations
import argparse
import glob
import os
import re
import sys
from collections import defaultdict

LINE = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (DEBUG|INFO|WARN|ERROR) \[([^\]]+)\] (.*)$")
SLOW = re.compile(r"^(.*?): (\d+)ms")
ACCESS = re.compile(r"^(\S+) (\S+) (\d+) (\d+)ms")
# Collapse per-entity ids so routes group: /api/tickets/VPL-46256 -> /api/tickets/:key
ID_SEG = re.compile(r"/(?:[A-Z]+-\d+|\d+|[0-9a-f]{8}-[0-9a-f-]{27,})")
CRASH = re.compile(r"uncaughtException|unhandledRejection|failed to pipe response|ECONNRESET", re.I)


def newest_logs(dirpath: str, n: int) -> list[str]:
    files = sorted(glob.glob(os.path.join(dirpath, "prod-*.log")), key=os.path.getmtime)
    return files[-n:] if files else []


def norm(s: str, width: int = 90) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    return s if len(s) <= width else s[:width] + "..."


def route_of(path: str) -> str:
    return ID_SEG.sub("/:id", path)


def main() -> int:
    ap = argparse.ArgumentParser(description="Digest a Bridge prod log.")
    ap.add_argument("file", nargs="?", help="log file (default: newest in --dir)")
    ap.add_argument("--dir", default="logs", help="log directory (default: logs)")
    ap.add_argument("--files", type=int, default=1, help="merge newest N logs (default: 1)")
    ap.add_argument("--slow-ms", type=int, default=500, help="access-slow threshold ms (default: 500)")
    args = ap.parse_args()

    paths = [args.file] if args.file else newest_logs(args.dir, args.files)
    paths = [p for p in paths if p and os.path.exists(p)]
    if not paths:
        print(f"No prod log found in {args.dir}/ (and no file given).", file=sys.stderr)
        return 1

    levels = defaultdict(int)
    tags_by_level = defaultdict(lambda: defaultdict(int))
    client_errs = defaultdict(int)         # endpoint -> count
    other_errs = []                        # full ERROR lines that are not [client]
    slow = {}                              # label -> {n, max, sum}
    access = defaultdict(lambda: {"n": 0, "max": 0, "sum": 0, "non200": 0})
    warn_samples = defaultdict(list)       # tag -> sample messages (integration warns)
    scheduler = []                         # task-ran summaries
    crashes = []
    first_ts = last_ts = None
    total_lines = 0

    for path in paths:
        for raw in open(path, errors="replace"):
            total_lines += 1
            line = raw.rstrip("\n")
            if CRASH.search(line) and not LINE.match(line):
                crashes.append(norm(line, 140))
                continue
            m = LINE.match(line)
            if not m:
                continue
            ts, level, tag, msg = m.groups()
            first_ts = first_ts or ts
            last_ts = ts
            levels[level] += 1
            tags_by_level[level][tag] += 1
            msg_noreq = re.sub(r"\s*reqId=\S+", "", msg).strip()

            if level == "ERROR":
                cm = re.search(r"\[(?:swr )?([^\]]+)\] Failed to fetch", msg)
                if "[client]" in (tag, f"[{tag}]") or tag == "client":
                    key = cm.group(1) if cm else norm(msg_noreq, 60)
                    client_errs[key] += 1
                else:
                    other_errs.append(f"[{tag}] {norm(msg_noreq, 130)}")
            if tag == "slow-query":
                sm = SLOW.match(msg_noreq)
                if sm:
                    label = norm(sm.group(1))
                    ms = int(sm.group(2))
                    d = slow.setdefault(label, {"n": 0, "max": 0, "sum": 0})
                    d["n"] += 1; d["max"] = max(d["max"], ms); d["sum"] += ms
            elif tag == "access":
                am = ACCESS.match(msg_noreq)
                if am:
                    method, p, status, ms = am.group(1), am.group(2), int(am.group(3)), int(am.group(4))
                    r = access[f"{method} {route_of(p)}"]
                    r["n"] += 1; r["max"] = max(r["max"], ms); r["sum"] += ms
                    if status != 200:
                        r["non200"] += 1
            elif tag == "scheduler" and "ran" in msg:
                scheduler.append(norm(msg_noreq, 80))
            elif level in ("WARN", "ERROR") and tag in ("agent-fetch", "bitbucket", "jira-client", "scheduled-tasks", "middleware", "db", "config"):
                if len(warn_samples[tag]) < 3:
                    warn_samples[tag].append(norm(msg_noreq, 110))

    out = []
    out.append("=" * 70)
    out.append(f"PROD LOG DIGEST  ({', '.join(os.path.basename(p) for p in paths)})")
    out.append(f"lines={total_lines}  span={first_ts or '?'} -> {last_ts or '?'}")
    out.append(f"levels: " + "  ".join(f"{k}={levels[k]}" for k in ("ERROR", "WARN", "INFO", "DEBUG")))
    out.append("=" * 70)

    out.append("\n## CRASH MARKERS (uncaught / pipe / reset)")
    out.append("\n".join(f"  {c}" for c in crashes[:10]) if crashes else "  (none)")

    out.append("\n## ERRORS — non-client (look here first)")
    if other_errs:
        seen = defaultdict(int)
        for e in other_errs:
            seen[e] += 1
        for e, c in sorted(seen.items(), key=lambda x: -x[1]):
            out.append(f"  {c:3d}x  {e}")
    else:
        out.append("  (none)")

    out.append("\n## ERRORS — [client] failed-fetch by endpoint (often restart/network noise)")
    if client_errs:
        for k, c in sorted(client_errs.items(), key=lambda x: -x[1]):
            out.append(f"  {c:3d}x  {k}")
    else:
        out.append("  (none)")

    out.append("\n## SLOW QUERIES (label  ->  count / max / avg ms)")
    if slow:
        for label, d in sorted(slow.items(), key=lambda x: -x[1]["max"]):
            out.append(f"  n={d['n']:3d}  max={d['max']:5d}  avg={d['sum']//max(d['n'],1):5d}   {label}")
    else:
        out.append("  (none over threshold)")

    out.append(f"\n## ACCESS by route (slowest first; flag >{args.slow_ms}ms or non-200)")
    if access:
        for r, d in sorted(access.items(), key=lambda x: -x[1]["max"])[:20]:
            flag = "  <-- SLOW" if d["max"] > args.slow_ms else ""
            flag += "  <-- has non-200" if d["non200"] else ""
            out.append(f"  n={d['n']:3d}  max={d['max']:5d}  avg={d['sum']//max(d['n'],1):5d}  {r}{flag}")
    else:
        out.append("  (no access lines — access logging added in BRDG-400; older logs lack it)")

    out.append("\n## INTEGRATION / SYSTEM WARNINGS (sampled)")
    if warn_samples:
        for tag, samples in warn_samples.items():
            out.append(f"  [{tag}]")
            for s in samples:
                out.append(f"      {s}")
    else:
        out.append("  (none)")

    out.append("\n## SCHEDULER TASKS THAT RAN (sampled)")
    out.append("\n".join(f"  {s}" for s in scheduler[:12]) if scheduler else "  (none)")

    print("\n".join(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
