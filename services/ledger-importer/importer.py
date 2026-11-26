#!/usr/bin/env python3
"""Puts receipts confirmed in the KAMO Services app into the KAMOTec expense ledger and files their photos.

Runs every 5 minutes inside the kamo-ledger-uno image (LibreOffice + Python UNO). Each run:
1. publishes the ledger's Projects, Categories and "Paid with" values as the CouchDB doc `lists`;
2. if confirmed receipts wait, the ledger is not open anywhere and Syncthing is settled, appends one
   Expenses row per receipt line, files the photo under Receipts/<year>/, and marks the receipt imported.
Every path and URL is a flag (or env var) so tests run against copies. --dry-run changes nothing.
"""
import argparse
import base64
import datetime as dt
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

FIRST_ROW, LAST_ROW = 6, 1005  # Expenses data rows, 1-based
# 0-based columns we write. L, N and O hold formulas and are never touched.
A, B, C, D, E, F, G, H, I, J, K, M, P, Q, R = 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 16, 17
COL_O = 14
USER_COLS = (A, B, C, D, E, F, G, H, I, J, K, M, P, Q, R)
KEEP_BACKUPS = 5


def log(*args):
    print(*args, flush=True)


# ---------- CouchDB ----------

class Couch:
    def __init__(self, url, db, env_file):
        vals = {}
        with open(env_file) as f:
            for line in f:
                key, _, value = line.strip().partition("=")
                vals[key] = value.strip("'\"")
        token = base64.b64encode(f"{vals['COUCHDB_USER']}:{vals['COUCHDB_PASSWORD']}".encode()).decode()
        self.auth = "Basic " + token
        self.base = f"{url}/{urllib.parse.quote(db, safe='')}"

    def call(self, method, path, body=None, raw=False):
        req = urllib.request.Request(
            self.base + path,
            method=method,
            data=None if body is None else json.dumps(body).encode(),
            headers={"Content-Type": "application/json", "Authorization": self.auth},
        )
        with urllib.request.urlopen(req) as res:
            return res.read() if raw else json.load(res)

    def get(self, doc_id):
        try:
            return self.call("GET", "/" + urllib.parse.quote(doc_id, safe=""))
        except urllib.error.HTTPError as err:
            if err.code == 404:
                return None
            raise

    def update(self, doc_id, change):
        """Applies change(doc) and saves, re-reading on a conflict. Stamps updatedAt like the app's saveDoc."""
        while True:
            doc = self.get(doc_id) or {"_id": doc_id}
            change(doc)
            doc["updatedAt"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
            try:
                return self.call("PUT", "/" + urllib.parse.quote(doc_id, safe=""), doc)
            except urllib.error.HTTPError as err:
                if err.code != 409:
                    raise

    def waiting_receipts(self):
        query = urllib.parse.urlencode({"include_docs": "true", "startkey": '"receipt:"', "endkey": '"receipt:\\ufff0"'})
        rows = self.call("GET", "/_all_docs?" + query)["rows"]
        docs = [r["doc"] for r in rows if r.get("doc")]
        return sorted(
            (d for d in docs if d.get("type") == "receipt" and d.get("status") == "confirmed" and not d.get("importedAt")),
            key=lambda d: (d["date"], d["createdAt"]),
        )

    def attachment(self, doc):
        name = next(iter(doc.get("_attachments") or {}), None)
        if not name:
            return None, None
        path = "/" + urllib.parse.quote(doc["_id"], safe="") + "/" + urllib.parse.quote(name)
        return name, self.call("GET", path, raw=True)


# ---------- reading the ledger without LibreOffice ----------

NS_TABLE = "{urn:oasis:names:tc:opendocument:xmlns:table:1.0}"


def read_sheet_columns(ods, sheet, cols, max_rows):
    """Text of the given 0-based columns of a sheet, row by row, straight from content.xml."""
    with zipfile.ZipFile(ods) as z:
        root = ET.fromstring(z.read("content.xml"))
    for table in root.iter(NS_TABLE + "table"):
        if table.get(NS_TABLE + "name") != sheet:
            continue
        rows = []
        for row in table.iter(NS_TABLE + "table-row"):
            values, c = {}, 0
            for cell in row:
                rep = int(cell.get(NS_TABLE + "number-columns-repeated", "1"))
                text = "".join(cell.itertext())
                for k in range(c, min(c + rep, max(cols) + 1)):
                    values[k] = text
                c += rep
                if c > max(cols):
                    break
            reps = int(row.get(NS_TABLE + "number-rows-repeated", "1"))
            rows.extend([[values.get(k, "") for k in cols]] * min(reps, max_rows - len(rows)))
            if len(rows) >= max_rows:
                break
        return rows
    raise SystemExit(f"No sheet {sheet!r} in the ledger")


def read_lists(ods):
    lists_rows = read_sheet_columns(ods, "Lists", [0, 1], 41)[1:]  # row 1 is the header
    paid_rows = read_sheet_columns(ods, "Expenses", [Q], LAST_ROW)[FIRST_ROW - 1:]
    distinct = lambda values: list(dict.fromkeys(v.strip() for v in values if v.strip()))
    return {
        "projects": distinct(r[0] for r in lists_rows),
        "categories": distinct(r[1] for r in lists_rows),
        "paidWith": sorted(distinct(r[0] for r in paid_rows)),
    }


def publish_lists(couch, ods, dry_run):
    lists = read_lists(ods)
    current = couch.get("lists") or {}
    if all(current.get(k) == v for k, v in lists.items()) and current.get("type") == "lists":
        return
    if dry_run:
        log("would publish lists:", json.dumps(lists))
        return
    couch.update("lists", lambda doc: doc.update(type="lists", **lists))
    log(f"published lists: {len(lists['projects'])} projects, {len(lists['categories'])} categories, {len(lists['paidWith'])} paid-with")


# ---------- is it safe to edit? ----------

def lock_path(ledger):
    return os.path.join(os.path.dirname(ledger), f".~lock.{os.path.basename(ledger)}#")


def syncthing_settled(url, config_xml, folder, device_name):
    """True when the laptop has all of the folder and CT100 has nothing left to pull or scan."""
    # Syncthing's own config.xml (root 0600 on CT100), not untrusted input
    config = ET.parse(config_xml).getroot()  # nosemgrep: python.lang.security.use-defused-xml-parse.use-defused-xml-parse
    key = config.findtext("gui/apikey")
    device = next((d.get("id") for d in config.iter("device") if d.get("name") == device_name), None)
    if not device:
        raise SystemExit(f"No Syncthing device named {device_name!r}")

    def get(path):
        req = urllib.request.Request(url + path, headers={"X-API-Key": key})
        with urllib.request.urlopen(req, timeout=10) as res:
            return json.load(res)

    completion = get(f"/rest/db/completion?folder={folder}&device={device}")
    status = get(f"/rest/db/status?folder={folder}")
    # remoteState "valid": the laptop is connected, so its 100% is current and not from before it went offline
    return (
        completion.get("completion") == 100
        and completion.get("remoteState") == "valid"
        and status.get("state") == "idle"
        and status.get("needTotalItems") == 0
        and status.get("receiveOnlyChangedFiles", 0) == 0
    )


# ---------- what goes in the ledger ----------

def money(cents):
    return f"${abs(cents) / 100:,.2f}" if cents >= 0 else f"-${abs(cents) / 100:,.2f}"


def first_line_note(r):
    parts = []
    if r.get("totalCents") is not None:
        breakdown = [f"subtotal {money(r['subtotalCents'])}" if r.get("subtotalCents") is not None else None,
                     f"tax {money(r['taxCents'])}" if r.get("taxCents") is not None else None]
        breakdown = " + ".join(b for b in breakdown if b)
        parts.append(f"Receipt total {money(r['totalCents'])}" + (f" ({breakdown})." if breakdown else "."))
    if r.get("notes", "").strip():
        parts.append(r["notes"].strip())
    return " ".join(parts)


def clean(text):
    return re.sub(r'[/\\:*?"<>|]+', "-", text).strip()


def photo_name(r, attachment_name, folder, taken):
    """Receipts/<YYYY>/<YYYY-MM-DD> <Vendor> <City>.<ext>, with " 2", " 3" on a clash. Never an existing name."""
    ext = attachment_name.rsplit(".", 1)[-1].lower()
    stem = " ".join(x for x in (r["date"], clean(r.get("vendor", "")), clean(r.get("storeCity", ""))) if x)
    n = 1
    while True:
        name = f"{stem}{'' if n == 1 else f' {n}'}.{ext}"
        if name not in taken and not os.path.exists(os.path.join(folder, name)):
            taken.add(name)
            return name
        n += 1


def ledger_rows(r):
    """The values for each Expenses row of a receipt, by column."""
    store = ", ".join(x for x in (r.get("storeCity", "").strip(), r.get("storeState", "").strip()) if x)
    rows = []
    for i, line in enumerate(r["lines"]):
        rows.append({
            A: dt.date.fromisoformat(r["date"]),
            B: line["project"], C: r.get("vendor", ""), D: store,
            F: line["item"], G: line["description"], H: line["sku"], I: line["category"],
            J: line["qty"], K: line["unitPriceCents"] / 100, M: line["taxRate"],
            P: "Yes" if line["billable"] else "No", Q: r.get("paidWith", ""),
            R: first_line_note(r) if i == 0 else "",
        })
    return rows


# ---------- LibreOffice ----------

NO_LOCKING = """<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema">
<item oor:path="/org.openoffice.Office.Common/Misc"><prop oor:name="UseLocking" oor:op="fuse"><value>false</value></prop></item>
</oor:items>
"""


class Office:
    def __init__(self):
        import uno  # only in the LibreOffice image
        from com.sun.star.connection import NoConnectException
        self.uno = uno
        pipe = f"kamo-ledger-{os.getpid()}"
        profile = f"/tmp/lo-profile-{os.getpid()}"
        os.makedirs(f"{profile}/user", exist_ok=True)
        # No lock file of our own: a lock file seen before saving can only be someone else's, and none syncs to the laptop
        with open(f"{profile}/user/registrymodifications.xcu", "w") as f:
            f.write(NO_LOCKING)
        self.proc = subprocess.Popen(
            ["soffice", "--headless", "--invisible", "--nologo", "--norestore", "--nodefault",
             f"-env:UserInstallation=file://{profile}", f"--accept=pipe,name={pipe};urp;"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
        for _ in range(120):
            try:
                ctx = resolver.resolve(f"uno:pipe,name={pipe};urp;StarOffice.ComponentContext")
                break
            except NoConnectException:
                time.sleep(0.5)
        else:
            self.proc.kill()
            raise SystemExit("LibreOffice did not start")
        self.desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)

    def prop(self, name, value):
        p = self.uno.createUnoStruct("com.sun.star.beans.PropertyValue")
        p.Name, p.Value = name, value
        return p

    def load(self, path):
        return self.desktop.loadComponentFromURL(self.file_url(path), "_blank", 0, (self.prop("Hidden", True),))

    def file_url(self, path):
        return self.uno.systemPathToFileUrl(os.path.abspath(path))

    def close(self):
        try:
            self.desktop.terminate()
        except Exception:  # the bridge drops as soffice exits
            pass
        try:
            self.proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            self.proc.kill()


def last_used_row(sheet):
    """1-based number of the last Expenses row with anything typed in it (formula columns do not count)."""
    last = FIRST_ROW - 1
    for row in range(FIRST_ROW - 1, LAST_ROW):
        if any(sheet.getCellByPosition(c, row).getString() != "" for c in USER_COLS):
            last = row + 1
    return last


def summary_total(doc):
    sheet = doc.Sheets.getByName("Summary")
    for row in range(0, 200):
        if sheet.getCellByPosition(0, row).getString() == "All projects":
            return sheet.getCellByPosition(4, row).getValue()
    raise SystemExit("No 'All projects' row on the Summary sheet")


def write_rows(doc, start_row, rows, link_url, link_text):
    """Writes rows from 1-based start_row. Number formats come from row 6, which the user formatted."""
    sheet = doc.Sheets.getByName("Expenses")
    template = {c: sheet.getCellByPosition(c, FIRST_ROW - 1).NumberFormat for c in (A, J, K, M)}
    for n, values in enumerate(rows):
        row = start_row - 1 + n
        for col, value in values.items():
            cell = sheet.getCellByPosition(col, row)
            if col in template:
                cell.NumberFormat = template[col]
            if col == A:
                cell.setValue((value - dt.date(1899, 12, 30)).days)
            elif col in (J, K, M):
                cell.setValue(value)
            elif value != "":
                cell.setString(value)
        if link_url:
            cell = sheet.getCellByPosition(E, row)
            field = doc.createInstance("com.sun.star.text.TextField.URL")
            field.URL, field.Representation = link_url, link_text
            cell.Text.insertTextContent(cell.Text.createTextCursor(), field, False)


def clear_rows(doc, start_row, count):
    sheet = doc.Sheets.getByName("Expenses")
    for row in range(start_row - 1, start_row - 1 + count):
        for c in USER_COLS:
            sheet.getCellByPosition(c, row).setString("")


def check_rows(doc, start_row, rows, summary_before):
    """None when every new row's Total is qty x unit x (1 + tax) and the Summary rose by their sum; else why not."""
    doc.calculateAll()
    sheet = doc.Sheets.getByName("Expenses")
    added = 0.0
    for n, values in enumerate(rows):
        total = sheet.getCellByPosition(COL_O, start_row - 1 + n).getValue()
        expected = values[J] * values[K] * (1 + values[M])
        # Exact up to float noise, which also makes round(total, 2) == round(expected, 2)
        if abs(total - expected) > 1e-6:
            return f"row {start_row + n}: Total {total} but {values[J]} x {values[K]} x (1 + {values[M]}) = {expected}"
        added += total
    rose = summary_total(doc) - summary_before
    if abs(rose - added) > 1e-6:
        return f"Summary total rose by {rose:.4f}, new rows add up to {added:.4f} (is every project on the Lists sheet?)"
    return None


# ---------- the run ----------

def run(args):
    couch = Couch(args.couch_url, args.db, args.env_file)
    publish_lists(couch, args.ledger, args.dry_run)
    receipts = couch.waiting_receipts()
    if not receipts:
        return 0
    lock = lock_path(args.ledger)
    blockers = []
    if os.path.exists(lock):
        blockers.append("the ledger is open (lock file)")
    if not syncthing_settled(args.syncthing_url, args.syncthing_config, args.syncthing_folder, args.laptop_device):
        blockers.append("Syncthing is not settled with the laptop")
    if blockers:
        if args.dry_run:
            log("a real run would wait:", "; ".join(blockers))
        else:
            return 0  # quiet: try again next run
    folder = os.path.dirname(os.path.abspath(args.ledger))
    mtime = os.stat(args.ledger).st_mtime_ns

    office = Office()
    try:
        doc = office.load(args.ledger)  # a dry run edits it in memory and never stores
        next_row = last_used_row(doc.Sheets.getByName("Expenses")) + 1
        taken, done = set(), []
        for r in receipts:
            rows = ledger_rows(r)
            if not rows:
                log(f"{r['_id']}: left out of the ledger: it has no lines")
                continue
            att_name, data = couch.attachment(r)
            year_dir = os.path.join(folder, "Receipts", r["date"][:4])
            name = photo_name(r, att_name, year_dir, taken) if att_name else None
            if next_row + len(rows) - 1 > LAST_ROW:
                log(f"{r['_id']}: no room left in Expenses rows {FIRST_ROW}-{LAST_ROW}")
                break
            link = office.file_url(os.path.join(year_dir, name)) if name else None
            before = summary_total(doc)
            write_rows(doc, next_row, rows, link, name.rsplit(".", 1)[0] if name else "")
            problem = check_rows(doc, next_row, rows, before)
            if args.dry_run:
                log(f"{r['_id']}: rows {next_row}-{next_row + len(rows) - 1}, photo Receipts/{r['date'][:4]}/{name}")
                for n, values in enumerate(rows):
                    shown = {chr(65 + c): (v.isoformat() if isinstance(v, dt.date) else v) for c, v in values.items() if v != ""}
                    log(f"  row {next_row + n}: {json.dumps(shown, ensure_ascii=False)}")
                log(f"  check: {problem or 'totals match'}")
            if problem:
                log(f"{r['_id']}: left out of the ledger: {problem}")
                clear_rows(doc, next_row, len(rows))
                doc.calculateAll()
                continue
            done.append((r, list(range(next_row, next_row + len(rows))), name, data, year_dir))
            next_row += len(rows)
        if args.dry_run or not done:
            doc.close(True)
            return 0
        # Someone saved or opened the ledger while it was being edited: drop the edit, next run tries again
        if os.stat(args.ledger).st_mtime_ns != mtime or os.path.exists(lock):
            log("the ledger changed while importing; trying again next run")
            doc.close(True)
            return 0
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copy2(args.ledger, os.path.join(folder, f".{os.path.basename(args.ledger)}.bak-{stamp}"))
        for old in sorted(glob.glob(os.path.join(folder, f".{glob.escape(os.path.basename(args.ledger))}.bak-*")))[:-KEEP_BACKUPS]:
            os.remove(old)
        doc.store()
        doc.close(True)
    finally:
        office.close()

    # shortcut: a crash between the ledger save and marking the receipt imports it again next run; fine for one
    # user every 5 minutes, check the ledger for the receipt's rows first if duplicates ever show up
    for r, rows, name, data, year_dir in done:
        if name:
            os.makedirs(year_dir, exist_ok=True)
            path = os.path.join(year_dir, name)
            with open(path, "xb") as f:  # x: never overwrite a photo
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            if os.path.getsize(path) != len(data):
                raise RuntimeError(f"{path} is short; keeping the photo in the app")
        now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

        def mark(doc, rows=rows, name=name, now=now):
            doc.update(importedAt=now, ledgerRows=rows, photoName=name)
            if name:
                doc.pop("_attachments", None)  # filed under Receipts/; every phone would otherwise keep a copy

        couch.update(r["_id"], mark)
        log(f"{r['_id']}: imported to rows {rows[0]}-{rows[-1]}" + (f", photo {name}" if name else ""))
    return 0


def main(argv=None):
    env = os.environ.get
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--ledger", default=env("LEDGER", "/opt/docker/syncthing/data/Documents/KAMOTec/KAMOTec Expenses.ods"))
    p.add_argument("--couch-url", default=env("COUCH_URL", "http://127.0.0.1:5984"))
    p.add_argument("--db", default=env("COUCH_DB", "kamotec-time"))
    p.add_argument("--env-file", default=env("COUCH_ENV_FILE", "/opt/beihl-ai/obsidian-livesync/.env"))
    p.add_argument("--syncthing-url", default=env("SYNCTHING_URL", "http://127.0.0.1:8384"))
    p.add_argument("--syncthing-config", default=env("SYNCTHING_CONFIG", "/opt/docker/syncthing/config/config.xml"))
    p.add_argument("--syncthing-folder", default=env("SYNCTHING_FOLDER", "kamo-documents"))
    p.add_argument("--laptop-device", default=env("LAPTOP_DEVICE", "hp-640-laptop"))
    p.add_argument("--dry-run", action="store_true", help="print what would be written; change nothing")
    return run(p.parse_args(argv))


if __name__ == "__main__":
    sys.exit(main())
