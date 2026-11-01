FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
RUN ["mkdir", "/app/ca"]
RUN ["touch", "/app/ca/rootCA.pem"]
COPY server.py index.html styles.css app.js api-demo.js ./

USER 65534:65534
EXPOSE 8765
CMD ["python", "server.py"]
