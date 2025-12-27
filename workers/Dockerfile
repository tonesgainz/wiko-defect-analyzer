FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DEFAULT_TIMEOUT=100 \
    PIP_RETRIES=10 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app

WORKDIR /app

COPY workers/requirements.txt /app/workers/requirements.txt
RUN pip install --upgrade pip && \
    pip install -r /app/workers/requirements.txt

COPY agents/ /app/agents/
COPY workers/ /app/workers/

CMD ["python", "workers/defect_worker.py"]
