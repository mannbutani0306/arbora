FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860 \
    PYTHONPATH=/app/ml/src

WORKDIR /app
COPY ml/serve/requirements.txt /app/ml/serve/requirements.txt
RUN pip install --no-cache-dir -r /app/ml/serve/requirements.txt
COPY ml/src/arbora_ml /app/ml/src/arbora_ml
COPY ml/serve /app/ml/serve
RUN useradd --create-home --uid 10001 arbora && chown -R arbora:arbora /app
USER arbora

EXPOSE 7860
CMD ["uvicorn", "ml.serve.app:app", "--host", "0.0.0.0", "--port", "7860"]
