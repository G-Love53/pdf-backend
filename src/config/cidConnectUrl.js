/** Public insured portal origin (Connect PWA). */
const DEFAULT_CID_CONNECT_URL =
  "https://connect.commercialinsurance-direct.com";

/** @returns {string} Origin without trailing slash or query string. */
function getCidConnectUrl() {
  const raw = process.env.CID_APP_URL || DEFAULT_CID_CONNECT_URL;
  return raw.split("?")[0].replace(/\/$/, "");
}

module.exports = {
  DEFAULT_CID_CONNECT_URL,
  getCidConnectUrl,
};
