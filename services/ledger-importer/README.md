# ledger-importer

Every 5 minutes: publishes the ledger's Projects, Categories and "Paid with" values to the CouchDB doc
`lists`, then, when confirmed receipts wait, the ledger has no `.~lock` file and Syncthing shows the laptop
(`hp-640-laptop`, connected) at 100% with nothing pending on CT100, appends one Expenses row per receipt line,
files the photo under `Receipts/<year>/` and sets `importedAt`, `ledgerRows`, `photoName` on the receipt.

It edits the ledger in place with LibreOffice (so receipt links stay relative), after copying it to
`.KAMOTec Expenses.ods.bak-<time>` (newest 5 kept). It saves only if the file's mtime and lock are unchanged
and every new row's Total and the Summary total check out; a receipt that fails the check (usually a project
missing from the Lists sheet) is left out and logged, and the others still go in.

    docker build -t kamo-ledger-importer .
    docker run --rm --network host ... kamo-ledger-importer --dry-run   # see kamo-ledger-importer.service for the mounts

Tests (a copy of the ledger, a throwaway `kamotec-test-*` database, a fake Syncthing):

    cp "/opt/docker/syncthing/data/Documents/KAMOTec/KAMOTec Expenses.ods" /root/ledger-copy.ods
    docker run --rm --network host --entrypoint python3 -v "$PWD":/app \
      -v /root/ledger-copy.ods:/src/ledger.ods:ro -v /opt/beihl-ai/obsidian-livesync/.env:/run/couch.env:ro \
      -e LEDGER_SOURCE=/src/ledger.ods kamo-ledger-importer -m pytest -q -p no:cacheprovider /app/test_importer.py
