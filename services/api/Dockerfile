FROM python:3.12-slim
WORKDIR /app

RUN pip install --no-cache-dir poetry && \
    poetry config virtualenvs.create false

COPY pyproject.toml poetry.lock ./
RUN poetry install --only main --no-interaction --no-ansi

COPY . .

RUN addgroup --gid 1001 appgroup && adduser --uid 1001 --gid 1001 --disabled-password --gecos "" appuser
USER appuser

EXPOSE 5100
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5100"]
