FROM node:20-bullseye

# System libs Chrome/Chromium needs + fonts + extract utils
RUN apt-get update && apt-get install -y \
    fonts-noto fonts-noto-cjk fonts-noto-color-emoji \
    libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
    libdrm2 libgbm1 libasound2 libnss3 libnspr4 \
    libatk-bridge2.0-0 libgtk-3-0 libpango-1.0-0 libpangocairo-1.0-0 \
    libcups2 libdbus-1-3 libxshmfence1 ca-certificates wget gnupg xz-utils \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Use ONE cache path consistently for install + runtime
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Install the exact Chrome version Puppeteer expects (from your logs)
RUN npx @puppeteer/browsers install chrome@123.0.6312.122

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY src ./src
COPY templates ./templates
COPY mapping ./mapping
COPY utils/ ./utils/   

# IMPORTANT: point to where @puppeteer/browsers actually put Chrome
# (since we set PUPPETEER_CACHE_DIR, Chrome lives under /app/.cache/puppeteer)
ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/app/.cache/puppeteer/chrome/linux-123.0.6312.122/chrome-linux64/chrome

EXPOSE 8080
CMD ["npm","start"]
