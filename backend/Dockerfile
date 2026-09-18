FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 CONVEYOR_DATA=/data PYTHONPATH=/app/backend
WORKDIR /app
COPY backend/requirements.lock /app/backend/requirements.lock
RUN pip install --no-cache-dir -r backend/requirements.lock
COPY backend /app/backend
COPY artifacts /app/artifacts
RUN useradd --uid 10001 --create-home conveyor && mkdir /data && chown conveyor:conveyor /data
USER conveyor
CMD ["uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
