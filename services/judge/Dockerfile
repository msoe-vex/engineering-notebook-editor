# Python LangGraph judge worker (ADR-007). Same /jobs contract as before.
FROM python:3.12-slim-bookworm

WORKDIR /app

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

COPY services/judge/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY services/judge/app ./app

ENV CORE_API_URL=http://core:8080
ENV PORT=8091
EXPOSE 8091

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8091}"]
