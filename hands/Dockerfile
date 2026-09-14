# Hands v0.3: an HTTP reader, no browser. A slim Python image is all it needs.
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY hands ./hands

# Fly routes to this port; the app binds 0.0.0.0 inside the container.
ENV HANDS_HOST=0.0.0.0 \
    HANDS_PORT=8080 \
    HANDS_DB=/data/hands.db \
    HANDS_RECIPES_DIR=/data/recipes
EXPOSE 8080

# Run as a non-root user; /data is the mounted volume and must be writable.
RUN useradd --create-home --uid 10001 hands \
    && mkdir -p /data && chown hands:hands /data
USER hands
CMD ["python", "-m", "hands.server"]
