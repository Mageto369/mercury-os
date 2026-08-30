export const DEFAULT_SEC_USER_AGENT =
  "MercuryOS/0.4 personal-research https://github.com/Mageto369/mercury-os";

export function getSecUserAgent() {
  return process.env.SEC_USER_AGENT?.trim() || DEFAULT_SEC_USER_AGENT;
}
