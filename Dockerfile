FROM node:18-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl rpm2cpio cpio file ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Classic pdftk (C/C++) from Fedora Copr
ARG PDFTK_RPM_URL=https://copr-be.cloud.fedoraproject.org/results/robert/pdftk/epel-7-x86_64/00152411-pdftk/pdftk-2.02-1.el7.x86_64.rpm
# libgcj fallbacks: EL7 (preferred), then FC30, then CentOS 6 vault
ARG LIBGCJ_EL7=https://sandbox.mc.edu/~bennet/pdftk/gcc6-libgcj-6.5.0-2.el7.x86_64.rpm
ARG LIBGCJ_FC30=https://sandbox.mc.edu/~bennet/pdftk/gcc6-libgcj-6.5.0-2.fc30.x86_64.rpm
ARG LIBGCJ_C6=https://ftp.iij.ad.jp/pub/linux/centos-vault/centos/6/os/x86_64/Packages/libgcj-4.4.7-23.el6.x86_64.rpm

# Fetch, validate, extract, install
RUN set -eux; \
  # --- pdftk ---
  curl -fL -o /tmp/pdftk.rpm  "$PDFTK_RPM_URL"; \
  file /tmp/pdftk.rpm  | grep -qi 'RPM' || (echo "pdftk.rpm not an RPM"; head -n5 /tmp/pdftk.rpm; exit 9); \
  cd /tmp; rpm2cpio pdftk.rpm | cpio -idmv; \
  install -m 0755 /tmp/usr/bin/pdftk /usr/local/bin/pdftk; \
  # --- libgcj (try 3 mirrors) ---
  for url in "$LIBGCJ_EL7" "$LIBGCJ_FC30" "$LIBGCJ_C6"; do \
    echo "Trying $url"; \
    if curl -fsSL -o /tmp/libgcj.rpm "$url"; then \
      if file /tmp/libgcj.rpm | grep -qi 'RPM'; then \
        echo "Got libgcj RPM from $url"; break; \
      fi; \
    fi; \
  done; \
  file /tmp/libgcj.rpm | grep -qi 'RPM' || (echo "Failed to download a valid libgcj rpm"; exit 9); \
  cd /tmp; rpm2cpio libgcj.rpm | cpio -idmv || true; \
  mkdir -p /usr/local/lib/pdftk; \
  if [ -d /tmp/usr/lib64 ]; then cp -a /tmp/usr/lib64/libgcj*.so* /usr/local/lib/pdftk/ || true; fi; \
  if [ -d /tmp/usr/lib   ]; then cp -a /tmp/usr/lib/libgcj*.so*   /usr/local/lib/pdftk/ || true; fi; \
  rm -rf /tmp/usr /tmp/*.rpm

# Let pdftk find libgcj
ENV LD_LIBRARY_PATH="/usr/local/lib/pdftk:${LD_LIBRARY_PATH}"
ENV NODE_ENV=production

# Sanity checks (should print "pdftk 2.02 ...")
RUN ldd /usr/local/bin/pdftk || true \
 && pdftk --version

# --- your app below ---
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["node","index.js"]

