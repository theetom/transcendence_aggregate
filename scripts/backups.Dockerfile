FROM postgres:17-alpine

RUN apk add --no-cache python3
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY scripts/backups-worker.py scripts/shared-photos.py ./
# The Dockerfile-specific allowlist exposes only migration sources below backend.
COPY backend/ ./schema/
ENTRYPOINT ["python3", "/app/backups-worker.py"]
CMD ["daemon"]
