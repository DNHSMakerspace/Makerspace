FROM python:3.12-slim

WORKDIR /app

# Build context is makerspace_backend/ (Render rootDir).
COPY server.py ./server.py
RUN mkdir -p /app/data

ENV MAKERSPACE_API_PORT=8787
ENV MAKERSPACE_API_HOST=0.0.0.0
EXPOSE 8787

CMD ["python3", "server.py"]
