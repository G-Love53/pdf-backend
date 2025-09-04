# Classic PDFTK 2.02 (C/C++) + libgcj, on Node 18
FROM node:18-slim

# Tools to unpack RPMs
RUN apt-get update && apt-get install -y --no-install-recommends \
      rpm2cpio cpio wget ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Known-good RPMs for classic pdftk and matching libgcj
ARG PDFTK_RPM_URL=https://sandbox.mc.edu/~bennet/pdftk/pdftk-2.02-2.el7.x86_64.rpm
ARG LIBGCJ_RPM_URL=https://sandbox.mc.edu/~bennet/pdftk/gcc6-libgcj-6.5.0-2.el7.x86_64.rpm

# Fetch & extract
RUN wget -q -O /tmp/pdftk.rpm "$PDFTK_RPM_URL" \
 && wget -q -O /tmp/libgcj.rpm "$LIBGCJ_RPM_URL" \
 && cd /tmp \
 && rpm2cpio pdftk.rpm  | cpio -idmv \
 && rpm2cpio libgcj.rpm | cpio -idmv \
 # install pdftk
 && cp /tmp/usr/bin/pdftk /usr/local/bin/pdftk \
 && chmod +x /usr/local/bin/pdftk \
 # vendor the libgcj runtime
 && mkdir -p /usr/local/lib/pdftk \
 && cp -a /tmp/usr/lib64/libgcj*.so* /usr/local/lib/pdftk/ \
 && rm -rf /tmp/usr /tmp/*.rpm

# let pdftk find libgcj at runtime
ENV LD_LIBRARY_PATH="/usr/local/lib/pdftk:${LD_LIBRARY_PATH}"
ENV NODE_ENV=production

# sanity check: should print "pdftk 2.02 ..."
RUN pdftk --version || (echo 'pdftk failed to run' && exit 1)

# app deps & code
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
