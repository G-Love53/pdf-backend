FROM node:20-bullseye

# Fonts so PDFs look the same everywhere (and render emojis if any)
RUN apt-get update && apt-get install -y \
    fonts-noto fonts-noto-cjk fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps from lockfile for reproducible builds
COPY package*.json ./
RUN npm ci --omit=dev

# Copy runtime code only
COPY src ./src
COPY templates ./templates
COPY mapping ./mapping  # keep this line only if you have the folder

ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm","start"]
