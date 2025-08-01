# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies (including pdftk)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    pdftk \
    build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Set NODE_ENV to production for smaller image
ENV NODE_ENV=production

# Copy package.json and package-lock.json (if present)
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --unsafe-perm

# Copy the rest of your application code
COPY . .

# Expose port 3000 (common Node.js port)
EXPOSE 3000

# Start the Node.js application
CMD ["node", "index.js"]