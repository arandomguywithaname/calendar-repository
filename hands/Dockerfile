# Playwright's own image ships a matching Chromium + all system libs — no browser install step.
FROM mcr.microsoft.com/playwright/python:v1.62.0-jammy

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY hands ./hands

# Fly routes to this port; the app binds 0.0.0.0 inside the container.
ENV HANDS_HOST=0.0.0.0 \
    HANDS_PORT=8080 \
    HANDS_HEADLESS=1 \
    HANDS_DB=/data/hands.db \
    HANDS_RECIPES_DIR=/data/recipes
EXPOSE 8080

# Drop to the image's non-root user.
USER pwuser
CMD ["python", "-m", "hands.server"]
