# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies (including pdftk)
# We add build-essential for some Node.js packages (like node-gyp for native modules)
# Fix for old Debian Buster repos
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    pdftk \
    build-essential \
    && sed -i 's|deb.debian.org|archive.debian.org|g' /etc/apt/sources.list && \
    sed -i 's|security.debian.org|archive.debian.org|g' /etc/apt/sources.list \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy package.json and package-lock.json (if you have it)
# to install dependencies first, leveraging Docker cache
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy the rest of your application code
COPY . .

# Expose port 3000 (common Node.js port)
EXPOSE 3000

# Start the Node.js application
# `node index.js` runs the main server file
CMD ["node", "index.js"]