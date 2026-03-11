FROM python:3.12-slim
WORKDIR /app

COPY requirements-prod.txt ./
RUN pip install --no-cache-dir -r requirements-prod.txt

COPY . .

EXPOSE 5100
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5100"]
