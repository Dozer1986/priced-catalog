"""Runs in the kamo-ledger-uno image (see README.md): a copy of the ledger, a throwaway CouchDB database, a fake Syncthing."""
import base64
import http.server
import json
import os
import secrets
import shutil
import threading
import urllib.request
import zipfile

import pytest

import importer

SOURCE = os.environ["LEDGER_SOURCE"]  # a copy of the real ledger; this test copies it again
ENV_FILE = os.environ.get("COUCH_ENV_FILE", "/run/couch.env")
COUCH = os.environ.get("COUCH_URL", "http://127.0.0.1:5984")
LEDGER = "KAMOTec Expenses.ods"
PHOTO = b"\xff\xd8 fake jpeg"


class FakeSyncthing(http.server.BaseHTTPRequestHandler):
    completion = 100

    def do_GET(self):
        assert self.headers["X-API-Key"] == "test-key"
        if self.path.startswith("/rest/db/completion"):
            assert "device=LAPTOPID" in self.path
            body = {"completion": FakeSyncthing.completion, "remoteState": "valid"}
        else:
            body = {"state": "idle", "needTotalItems": 0, "receiveOnlyChangedFiles": 0}
        data = json.dumps(body).encode()
        self.send_response(200)
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


@pytest.fixture(scope="session")
def syncthing():
    server = http.server.HTTPServer(("127.0.0.1", 0), FakeSyncthing)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()


@pytest.fixture
def setup(tmp_path, syncthing):
    folder = tmp_path / "KAMOTec"
    (folder / "Receipts" / "2026").mkdir(parents=True)
    shutil.copy(SOURCE, folder / LEDGER)
    config = tmp_path / "config.xml"
    config.write_text('<configuration><device id="LAPTOPID" name="hp-640-laptop"/><gui><apikey>test-key</apikey></gui></configuration>')
    db = f"kamotec-test-{secrets.token_hex(4)}"
    couch = importer.Couch(COUCH, db, ENV_FILE)
    couch.call("PUT", "")
    FakeSyncthing.completion = 100
    args = ["--ledger", str(folder / LEDGER), "--couch-url", COUCH, "--db", db, "--env-file", ENV_FILE,
            "--syncthing-url", syncthing, "--syncthing-config", str(config)]
    yield folder, couch, args
    couch.call("DELETE", "")


def add_receipt(couch, n, project="Smith's", date="2026-11-14", lines=None):
    doc = {
        "_id": f"receipt:{n}", "type": "receipt", "status": "confirmed", "createdAt": f"2026-11-20T10:00:0{n}Z",
        "date": date, "vendor": "Menards", "storeCity": "Carmel", "storeState": "IN", "paidWith": "Visa 6270",
        "subtotalCents": 1500, "taxCents": 105, "totalCents": 1605, "notes": "Date from the return slip.",
        "lines": lines if lines is not None else [
            {"item": "SCREWS 50CT", "description": "Screws", "sku": "2302134", "qty": 2, "unitPriceCents": 1000,
             "taxRate": 0.07, "category": "Fasteners & Anchors", "project": project, "billable": True},
            {"item": "RTN SILL", "description": "Return: sill", "sku": "", "qty": -1, "unitPriceCents": 500,
             "taxRate": 0.07, "category": "Doors & Hardware", "project": project, "billable": True},
        ],
        "_attachments": {"original.jpg": {"content_type": "image/jpeg", "data": base64.b64encode(PHOTO).decode()}},
    }
    couch.call("PUT", f"/receipt:{n}", doc)


def snapshot(folder):
    path = folder / LEDGER
    return os.stat(path).st_mtime_ns, path.read_bytes()


def test_lock_present_means_no_write_but_lists_publish(setup):
    folder, couch, args = setup
    add_receipt(couch, 1)
    (folder / f".~lock.{LEDGER}#").write_text("someone,laptop")
    before = snapshot(folder)
    importer.main(args)
    assert snapshot(folder) == before
    assert "importedAt" not in couch.get("receipt:1")
    assert not list(folder.glob(".*.bak-*"))
    lists = couch.get("lists")
    assert "Smith's" in lists["projects"] and "Tools" in lists["categories"] and "Visa 6270" in lists["paidWith"]


def test_syncthing_behind_means_no_write(setup):
    folder, couch, args = setup
    add_receipt(couch, 1)
    FakeSyncthing.completion = 97
    before = snapshot(folder)
    importer.main(args)
    assert snapshot(folder) == before
    assert "importedAt" not in couch.get("receipt:1")


def test_ledger_saved_meanwhile_means_no_write(setup, monkeypatch):
    folder, couch, args = setup
    add_receipt(couch, 1)
    original = importer.write_rows

    def write_then_laptop_saves(*a):
        original(*a)
        os.utime(folder / LEDGER, ns=(1, 1))

    monkeypatch.setattr(importer, "write_rows", write_then_laptop_saves)
    content = (folder / LEDGER).read_bytes()
    importer.main(args)
    assert (folder / LEDGER).read_bytes() == content
    assert "importedAt" not in couch.get("receipt:1")
    assert not list((folder / "Receipts" / "2026").iterdir())
    assert not list(folder.glob(".*.bak-*"))


def test_receipt_with_no_lines_is_left_out_and_others_go_in(setup, capsys):
    folder, couch, args = setup
    add_receipt(couch, 1, lines=[])
    add_receipt(couch, 2)
    importer.main(args)
    assert "importedAt" not in couch.get("receipt:1")
    assert couch.get("receipt:2")["importedAt"]
    assert "receipt:1: left out of the ledger: it has no lines" in capsys.readouterr().out


def test_nothing_to_save_means_no_backup(setup):
    folder, couch, args = setup
    add_receipt(couch, 1, project="Not on the Lists sheet")
    before = snapshot(folder)
    importer.main(args)
    assert snapshot(folder) == before
    assert "importedAt" not in couch.get("receipt:1")
    assert not list(folder.glob(".*.bak-*"))


def read_ledger(path):
    office = importer.Office()
    try:
        doc = office.load(str(path))
        sheet = doc.Sheets.getByName("Expenses")
        last = importer.last_used_row(sheet)
        cell = lambda col, row: sheet.getCellByPosition(col, row - 1)
        rows = {r: {c: (cell(c, r).getString(), cell(c, r).getValue(), cell(c, r).getFormula()) for c in range(18)}
                for r in range(importer.FIRST_ROW, last + 1)}
        doc.calculateAll()
        total = importer.summary_total(doc)
        doc.close(True)
        return rows, total
    finally:
        office.close()


def test_import_two_receipts_with_photo_name_clash_and_a_return(setup, capsys):
    folder, couch, args = setup
    year = folder / "Receipts" / "2026"
    (year / "2026-11-14 Menards Carmel.jpg").write_bytes(b"older photo")
    add_receipt(couch, 1)
    add_receipt(couch, 2)
    add_receipt(couch, 3, project="Not on the Lists sheet")  # the Summary would not count it
    rows_before, total_before = read_ledger(folder / LEDGER)
    first = max(rows_before) + 1

    importer.main(args)

    r1, r2, r3 = (couch.get(f"receipt:{n}") for n in (1, 2, 3))
    assert r1["photoName"] == "2026-11-14 Menards Carmel 2.jpg" and r1["ledgerRows"] == [first, first + 1]
    assert r2["photoName"] == "2026-11-14 Menards Carmel 3.jpg" and r2["ledgerRows"] == [first + 2, first + 3]
    assert r1["importedAt"] and r2["importedAt"] and "importedAt" not in r3
    assert (year / "2026-11-14 Menards Carmel.jpg").read_bytes() == b"older photo"
    assert (year / "2026-11-14 Menards Carmel 2.jpg").read_bytes() == PHOTO
    assert "receipt:3: left out of the ledger" in capsys.readouterr().out
    assert len(list(folder.glob(f".{LEDGER}.bak-*"))) == 1

    rows, total = read_ledger(folder / LEDGER)
    assert max(rows) == first + 3  # receipt 3 was rolled back
    buy, ret = rows[first], rows[first + 1]
    assert buy[importer.A][0] == "11/14/2026" and buy[importer.B][0] == "Smith's" and buy[importer.D][0] == "Carmel, IN"
    assert buy[importer.E][0] == "2026-11-14 Menards Carmel 2"
    assert buy[importer.R][0] == "Receipt total $16.05 (subtotal $15.00 + tax $1.05). Date from the return slip."
    assert ret[importer.R][0] == "" and ret[importer.P][0] == "Yes"
    assert ret[importer.J][1] == -1 and round(ret[importer.COL_O][1], 2) == -5.35
    assert round(buy[importer.COL_O][1], 2) == 21.40
    assert ret[importer.COL_O][2].startswith("=IF(")  # the formulas are still there
    assert abs(total - total_before - 2 * (21.40 - 5.35)) < 1e-6
    with zipfile.ZipFile(folder / LEDGER) as z:
        content = z.read("content.xml").decode()
    # relative like the hand-entered links, so they work on the laptop
    assert 'xlink:href="../Receipts/2026/2026-11-14%20Menards%20Carmel%202.jpg"' in content


def test_dry_run_prints_rows_and_changes_nothing(setup, capsys):
    folder, couch, args = setup
    add_receipt(couch, 1)
    before = snapshot(folder)
    importer.main(args + ["--dry-run"])
    out = capsys.readouterr().out
    assert "would publish lists" in out and '"F": "SCREWS 50CT"' in out and '"J": -1' in out and "totals match" in out
    assert snapshot(folder) == before
    assert couch.get("lists") is None and "importedAt" not in couch.get("receipt:1")
    assert not list((folder / "Receipts" / "2026").iterdir()) and not list(folder.glob(".*.bak-*"))
