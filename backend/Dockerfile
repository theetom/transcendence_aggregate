FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN pip install --no-cache-dir "Django>=6.1,<7.0" djangorestframework
RUN python -m pip install Pillow
RUN python -m pip install gunicorn
RUN python -m pip install "psycopg[binary]>=3.1.12,<4"

COPY manage.py ./
COPY config/*.py ./config/
COPY recipes/*.py ./recipes/
COPY recipes/migrations/*.py ./recipes/migrations/
COPY reviews/*.py ./reviews/
COPY reviews/migrations/*.py ./reviews/migrations/
COPY users/*.py ./users/
COPY users/migrations/*.py ./users/migrations/

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000"]
