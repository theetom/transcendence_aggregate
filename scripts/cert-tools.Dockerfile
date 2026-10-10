FROM debian:bookworm-slim

# Packages belong to this tooling image; nothing is installed on the host.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates libnss3-tools openssl python3 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1

COPY install-mkcert.py /opt/local-tools/install-mkcert.py
RUN python3 /opt/local-tools/install-mkcert.py /usr/local/bin

COPY bootstrap-local-ca.py prepare-local-cert.py install-browser-trust.py /opt/local-tools/
WORKDIR /opt/local-tools

# The launcher supplies the host account's appropriate UID/GID mapping.
CMD ["python3"]
