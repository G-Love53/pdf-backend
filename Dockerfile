FROM node:18-slim

# Tools for fetching and unpacking RPMs
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl rpm2cpio cpio file ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Known-good sources:
# - pdftk 2.02 from Fedora Copr archive
# - gcc6-libgcj runtime from Bennet's page
ARG PDFTK_RPM_URL=https://copr-be.cloud.fedoraproject.org/results/robert/pdftk/epel-7-x86_64/00152411-pdftk/pdftk-2.02-1.el7.x86_64.rpm
ARG LIBGCJ_RPM_URL=https://sandbox.mc.edu/~bennet/pdftk/gcc6-libgcj-6.5.0-2.el7.x86_64.rpm

# Fetch, validate, extract, install
RUN set -eux; \
  curl -fL -o /tmp/pdftk.rpm  "$PDFTK_RPM_URL"; \
  curl -fL -o /tmp/libgcj.rpm "$LIBGCJ_RPM_URL"; \
  file /tmp/pdftk.rpm  | grep -qi 'RPM' || (echo "pdftk.rpm not an RPM";  head -n5 /tmp/pdftk.rpm;  exit 9); \
  file /tmp/libgcj.rpm | grep -qi 'RPM' || (echo "libgcj.rpm not an RPM"; head -n5 /tmp/libgcj.rpm; exit 9); \
  cd /tmp; \
  rpm2cpio pdftk.rpm  | cpio -idmv; \
  rpm2cpio libgcj.rpm | cpio -idmv; \
  install -m 0755 /tmp/usr/bin/pdftk /usr/local/bin/pdftk; \
  mkdir -p /usr/local/lib/pdftk; \
  cp -a /tmp/usr/lib64/libgcj*.so* /usr/local/lib/pdftk/; \
  rm -rf /tmp/usr /tmp/*.rpm

# Ensure classic pdftk finds libgcj at runtime
ENV LD_LIBRARY_PATH="/usr/local/lib/pdftk:${LD_LIBRARY_PATH}"
ENV NODE_ENV=production

# Sanity check: should print "pdftk 2.02 ..."
RUN pdftk --version || (echo 'pdftk failed to run' && exit 1)

# Your app
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["node","index.js"]

