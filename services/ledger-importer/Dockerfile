# LibreOffice Calc with Python UNO, to edit the ledger headless. pytest is for the tests (README.md).
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-calc-nogui python3-uno python3-pytest ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV HOME=/tmp
WORKDIR /app
COPY importer.py ./
ENTRYPOINT ["python3", "/app/importer.py"]
