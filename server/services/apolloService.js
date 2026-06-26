// server/services/apolloService.js
import { getConfig } from '../configStore.js';
import { filterAndDeduplicateEmails } from '../utils/emailValidator.js';

export async function apolloDomainSearch(domain, onLog) {
  const apiKey = getConfig('APOLLO_API_KEY');

  if (!apiKey) {
    onLog(`[${domain}] Apollo skipped: APOLLO_API_KEY missing`);
    return [];
  }

  try {
    onLog(`[${domain}] Apollo: searching organization by domain...`);

    const orgRes = await fetch('https://api.apollo.io/v1/organizations/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        accept: 'application/json',
      },
      body: JSON.stringify({
        q_organization_domains: domain,
        page: 1,
        per_page: 10,
      }),
      signal: AbortSignal.timeout(12000),
    });

    const orgRaw = await orgRes.text();

    if (!orgRes.ok) {
      onLog(`[${domain}] Apollo organizations HTTP ${orgRes.status}: ${orgRaw.slice(0, 250)}`);
      return [];
    }

    let orgJson;
    try {
      orgJson = JSON.parse(orgRaw);
    } catch {
      onLog(`[${domain}] Apollo organizations invalid JSON`);
      return [];
    }

    const foundEmails = [];

    for (const org of orgJson?.organizations || []) {
      if (org?.primary_domain && org.primary_domain !== domain) {
        onLog(`[${domain}] Apollo org match primary_domain=${org.primary_domain}`);
      }

      if (org?.contact_email) foundEmails.push(org.contact_email);
    }

    onLog(`[${domain}] Apollo: searching people by domain...`);

    const peopleRes = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        accept: 'application/json',
      },
      body: JSON.stringify({
        q_organization_domains: domain,
        page: 1,
        per_page: 10,
      }),
      signal: AbortSignal.timeout(12000),
    });

    const peopleRaw = await peopleRes.text();

    if (!peopleRes.ok) {
      onLog(`[${domain}] Apollo people HTTP ${peopleRes.status}: ${peopleRaw.slice(0, 250)}`);
    } else {
      let peopleJson = null;

      try {
        peopleJson = JSON.parse(peopleRaw);
      } catch {
        onLog(`[${domain}] Apollo people invalid JSON`);
      }

      for (const person of peopleJson?.people || []) {
        if (person?.email) foundEmails.push(person.email);
      }
    }

    const result = filterAndDeduplicateEmails(foundEmails);

    onLog(`[${domain}] Apollo: ${result.length} valid emails`);
    return result;
  } catch (e) {
    onLog(`[${domain}] Apollo error: ${e.message}`);
    return [];
  }
}