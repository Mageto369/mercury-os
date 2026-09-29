export const DEFAULT_SEC_USER_AGENT =
  "MercuryOS/0.4 personal-research https://github.com/Mageto369/mercury-os";

const CONTACT_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export interface SecIdentityStatus {
  agent: string | null;
  accepted: boolean;
  reason: string | null;
}

export function secIdentityStatus(env: Record<string, string | undefined> = process.env): SecIdentityStatus {
  const configured = env.SEC_USER_AGENT?.trim() ?? "";
  if (!configured) {
    return {
      agent: null,
      accepted: false,
      reason: "Set SEC_USER_AGENT to a contact string that includes an email address. SEC rejects an agent without one.",
    };
  }
  if (!CONTACT_EMAIL.test(configured)) {
    return {
      agent: configured,
      accepted: false,
      reason: "SEC_USER_AGENT must include a contact email. SEC rejects an agent without one.",
    };
  }
  return { agent: configured, accepted: true, reason: null };
}

export function getSecUserAgent() {
  return secIdentityStatus().agent ?? DEFAULT_SEC_USER_AGENT;
}
