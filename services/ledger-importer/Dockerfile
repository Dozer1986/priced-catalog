# LibreOffice Calc with Python UNO, to edit the ledger headless. pytest is for the tests (README.md).
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-calc-nogui python3-uno python3-pytest ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV HOME=/tmp
WORKDIR /app
COPY importer.py ./
# Root on purpose: Syncthing runs as PUID 0, so the ledger folder it syncs and its config.xml are root-owned,
# and the CouchDB .env is root 0600. A non-root user here needs those host files re-owned first.
# nosemgrep: dockerfile.security.missing-user-entrypoint.missing-user-entrypoint
ENTRYPOINT ["python3", "/app/importer.py"]
