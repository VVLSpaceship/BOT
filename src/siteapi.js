import dotenv from 'dotenv';
dotenv.config();
const SITE_URL = (process.env.SITE_URL || 'https://vvleague.onrender.com').replace(/\/$/, '');
const BOT_API_KEY = process.env.BOT_API_KEY || '';
async function botFetch(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000); // 30s timeout
    try {
        const res = await fetch(`${SITE_URL}/api/bot${path}`, {
            ...options,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'x-bot-key': BOT_API_KEY,
                ...(options.headers || {}),
            },
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
    }
    catch (e) {
        if (e.name === 'AbortError')
            throw new Error('Site did not respond in time (is it online?)');
        throw e;
    }
    finally {
        clearTimeout(timer);
    }
}
export async function searchOrgs(query) {
    return botFetch(`/orgs?q=${encodeURIComponent(query)}`);
}
export async function getAllOrgs() {
    return botFetch('/orgs');
}
export async function searchPlayers(query) {
    return botFetch(`/players?q=${encodeURIComponent(query)}`);
}
export async function getAllPlayers() {
    return botFetch('/players');
}
export async function getMemberByDiscordId(discordId) {
    try {
        return await botFetch(`/member/${discordId}`);
    }
    catch {
        return null;
    }
}
export async function signMember(orgId, discordId, name, role = 'Player') {
    return botFetch('/sign', { method: 'POST', body: JSON.stringify({ org_id: orgId, discord_id: discordId, name, role }) });
}
export async function releaseMember(discordId) {
    return botFetch('/release', { method: 'POST', body: JSON.stringify({ discord_id: discordId }) });
}
export async function createOrg(tag, name, region, logoUrl) {
    return botFetch('/orgs', { method: 'POST', body: JSON.stringify({ tag, name, region, logo_url: logoUrl }) });
}
export async function deleteOrg(tag) {
    return botFetch(`/orgs/${encodeURIComponent(tag)}`, { method: 'DELETE' });
}
export async function setSigningOpen(tag, open) {
    await botFetch(`/orgs/${encodeURIComponent(tag)}/signing`, { method: 'PUT', body: JSON.stringify({ open }) });
}
export async function setOrgRole(tag, discordRoleId) {
    await botFetch(`/orgs/${encodeURIComponent(tag)}/role`, { method: 'PUT', body: JSON.stringify({ discord_role_id: discordRoleId }) });
}
//# sourceMappingURL=siteapi.js.map