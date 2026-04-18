FROM node:20-slim AS dashboard-builder
WORKDIR /app/dashboard
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

FROM python:3.11-slim AS final
WORKDIR /app

RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .

COPY --from=dashboard-builder /app/dashboard/.next /app/dashboard/.next
COPY --from=dashboard-builder /app/dashboard/node_modules /app/dashboard/node_modules
COPY --from=dashboard-builder /app/dashboard/package.json /app/dashboard/package.json

COPY agent/ ./agent/
COPY db/ ./db/

EXPOSE 3000 8000

CMD ["sh", "-c", "python agent/agent.py & cd dashboard && node_modules/.bin/next start -p 3000"]
