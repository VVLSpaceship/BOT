import { EmbedBuilder } from 'discord.js';
const ROLE_LABELS = {
    CO_LEADER: 'Co-Leader',
    MANAGER: 'Manager Guild',
    MAIN: 'Main Roster',
    SUB: 'Sub Roster',
};
const ROLE_LIMITS = {
    CO_LEADER: 1,
    MANAGER: 2,
    MAIN: 5,
    SUB: 5,
};
export function setupDatabase(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS Guilds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      leaderId TEXT NOT NULL,
      coLeaderId TEXT,
      imageUrl TEXT,
      panelMessageId TEXT,
      panelChannelId TEXT,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      region TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS Managers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guildId TEXT NOT NULL,
      userId TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (guildId) REFERENCES Guilds(id),
      UNIQUE(guildId, userId)
    );

    CREATE TABLE IF NOT EXISTS MainRosters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guildId TEXT NOT NULL,
      userId TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (guildId) REFERENCES Guilds(id),
      UNIQUE(guildId, userId)
    );

    CREATE TABLE IF NOT EXISTS SubRosters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guildId TEXT NOT NULL,
      userId TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (guildId) REFERENCES Guilds(id),
      UNIQUE(guildId, userId)
    );

    CREATE TABLE IF NOT EXISTS Invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guildId TEXT NOT NULL,
      targetUserId TEXT NOT NULL,
      roleType TEXT NOT NULL CHECK(roleType IN ('CO_LEADER', 'MANAGER', 'MAIN', 'SUB')),
      inviterId TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'ACCEPTED', 'DECLINED')),
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME,
      FOREIGN KEY (guildId) REFERENCES Guilds(id)
    );

    CREATE TABLE IF NOT EXISTS Wars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openerGuildId TEXT NOT NULL,
      opponentGuildId TEXT NOT NULL,
      channelId TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'ACCEPTED', 'FINISHED', 'DODGED')),
      createdByUserId TEXT NOT NULL,
      acceptedByUserId TEXT,
      acceptedByGuildId TEXT,
      resultGuildId TEXT,
      winnerScore INTEGER,
      loserScore INTEGER,
      clipsLink TEXT,
      panelMessageId TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME,
      closedAt DATETIME,
      FOREIGN KEY (openerGuildId) REFERENCES Guilds(id),
      FOREIGN KEY (opponentGuildId) REFERENCES Guilds(id)
    );

    CREATE TABLE IF NOT EXISTS Wagers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('1V1', '2V2')),
      channelId TEXT NOT NULL,
      challenger1Id TEXT NOT NULL,
      challenger2Id TEXT,
      challenged1Id TEXT NOT NULL,
      challenged2Id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'ACCEPTED', 'DODGED', 'CLOSED')),
      acceptedByUserIds TEXT NOT NULL DEFAULT '[]',
      dodgedByUserId TEXT,
      panelMessageId TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME,
      closedAt DATETIME
    );
  `);
    ensureInviteColumns(db);
    ensureGuildColumns(db);
    ensureWarColumns(db);
    ensureWagerColumns(db);
    setupBotTables(db);
}
function setupBotTables(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS bot_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS signing_requests (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      org_tag          TEXT NOT NULL,
      org_id           INTEGER NOT NULL,
      inviter_discord_id TEXT NOT NULL,
      target_discord_id  TEXT NOT NULL,
      target_name      TEXT NOT NULL,
      role             TEXT NOT NULL DEFAULT 'Player',
      status           TEXT NOT NULL DEFAULT 'PENDING_PLAYER',
      log_message_id   TEXT,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cooldowns (
      discord_id   TEXT PRIMARY KEY,
      released_at  TEXT NOT NULL
    );
  `);
}
export function getSetting(db, key) {
    return db.prepare('SELECT value FROM bot_settings WHERE key = ?').get(key)?.value || '';
}
export function setSetting(db, key, value) {
    db.prepare('INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, ?)').run(key, value);
}
export function getSigningRequest(db, id) {
    return db.prepare('SELECT * FROM signing_requests WHERE id = ?').get(id) || null;
}
export function createSigningRequest(db, data) {
    const r = db.prepare(`INSERT INTO signing_requests (org_tag,org_id,inviter_discord_id,target_discord_id,target_name,role) VALUES (?,?,?,?,?,?)`)
        .run(data.org_tag, data.org_id, data.inviter_discord_id, data.target_discord_id, data.target_name, data.role);
    return Number(r.lastInsertRowid);
}
export function updateSigningStatus(db, id, status, logMessageId) {
    if (logMessageId) {
        db.prepare('UPDATE signing_requests SET status=?, log_message_id=? WHERE id=?').run(status, logMessageId, id);
    }
    else {
        db.prepare('UPDATE signing_requests SET status=? WHERE id=?').run(status, id);
    }
}
export function getCooldown(db, discordId) {
    const row = db.prepare('SELECT released_at FROM cooldowns WHERE discord_id = ?').get(discordId);
    return row ? new Date(row.released_at) : null;
}
export function setCooldown(db, discordId) {
    db.prepare('INSERT OR REPLACE INTO cooldowns (discord_id, released_at) VALUES (?, ?)').run(discordId, new Date().toISOString());
}
export function clearCooldown(db, discordId) {
    db.prepare('DELETE FROM cooldowns WHERE discord_id = ?').run(discordId);
}
function ensureInviteColumns(db) {
    const columns = db.prepare('PRAGMA table_info(Invites)').all();
    const existing = new Set(columns.map((c) => c.name));
    if (!existing.has('inviterId')) {
        db.exec('ALTER TABLE Invites ADD COLUMN inviterId TEXT');
    }
}
function ensureGuildColumns(db) {
    const columns = db.prepare('PRAGMA table_info(Guilds)').all();
    const existing = new Set(columns.map((c) => c.name));
    if (!existing.has('wins')) {
        db.exec('ALTER TABLE Guilds ADD COLUMN wins INTEGER NOT NULL DEFAULT 0');
    }
    if (!existing.has('losses')) {
        db.exec('ALTER TABLE Guilds ADD COLUMN losses INTEGER NOT NULL DEFAULT 0');
    }
}
function ensureWarColumns(db) {
    const columns = db.prepare('PRAGMA table_info(Wars)').all();
    const existing = new Set(columns.map((c) => c.name));
    if (!existing.has('winnerScore')) {
        db.exec('ALTER TABLE Wars ADD COLUMN winnerScore INTEGER');
    }
    if (!existing.has('loserScore')) {
        db.exec('ALTER TABLE Wars ADD COLUMN loserScore INTEGER');
    }
    if (!existing.has('clipsLink')) {
        db.exec('ALTER TABLE Wars ADD COLUMN clipsLink TEXT');
    }
    if (!existing.has('expiresAt')) {
        db.exec('ALTER TABLE Wars ADD COLUMN expiresAt DATETIME');
    }
}
function ensureWagerColumns(db) {
    const columns = db.prepare('PRAGMA table_info(Wagers)').all();
    if (!columns.length)
        return;
    const existing = new Set(columns.map((c) => c.name));
    if (!existing.has('acceptedByUserIds')) {
        db.exec("ALTER TABLE Wagers ADD COLUMN acceptedByUserIds TEXT NOT NULL DEFAULT '[]'");
    }
    if (!existing.has('dodgedByUserId')) {
        db.exec('ALTER TABLE Wagers ADD COLUMN dodgedByUserId TEXT');
    }
    if (!existing.has('panelMessageId')) {
        db.exec('ALTER TABLE Wagers ADD COLUMN panelMessageId TEXT');
    }
    if (!existing.has('expiresAt')) {
        db.exec('ALTER TABLE Wagers ADD COLUMN expiresAt DATETIME');
    }
}
export function getRoleLabel(roleType) {
    return ROLE_LABELS[roleType];
}
export function getRoleLimit(roleType) {
    return ROLE_LIMITS[roleType];
}
export function getGuildByLeaderId(db, leaderId) {
    return db.prepare('SELECT * FROM Guilds WHERE leaderId = ?').get(leaderId) || null;
}
export function getGuildById(db, guildId) {
    return db.prepare('SELECT * FROM Guilds WHERE id = ?').get(guildId) || null;
}
export function getRoleMemberCount(db, guildId, roleType) {
    if (roleType === 'CO_LEADER') {
        const guild = getGuildById(db, guildId);
        return guild?.coLeaderId ? 1 : 0;
    }
    if (roleType === 'MANAGER') {
        return db.prepare('SELECT COUNT(*) as count FROM Managers WHERE guildId = ?').get(guildId)?.count || 0;
    }
    if (roleType === 'MAIN') {
        return db.prepare('SELECT COUNT(*) as count FROM MainRosters WHERE guildId = ?').get(guildId)?.count || 0;
    }
    return db.prepare('SELECT COUNT(*) as count FROM SubRosters WHERE guildId = ?').get(guildId)?.count || 0;
}
export function isUserInRole(db, guildId, userId, roleType) {
    if (roleType === 'CO_LEADER') {
        const guild = getGuildById(db, guildId);
        return guild?.coLeaderId === userId;
    }
    if (roleType === 'MANAGER') {
        return !!db.prepare('SELECT 1 FROM Managers WHERE guildId = ? AND userId = ?').get(guildId, userId);
    }
    if (roleType === 'MAIN') {
        return !!db.prepare('SELECT 1 FROM MainRosters WHERE guildId = ? AND userId = ?').get(guildId, userId);
    }
    return !!db.prepare('SELECT 1 FROM SubRosters WHERE guildId = ? AND userId = ?').get(guildId, userId);
}
export function canAddUserToRole(db, guildId, roleType) {
    return getRoleMemberCount(db, guildId, roleType) < getRoleLimit(roleType);
}
export function addMemberToRole(db, guildId, userId, roleType) {
    if (!canAddUserToRole(db, guildId, roleType))
        return false;
    if (isUserInRole(db, guildId, userId, roleType))
        return false;
    if (roleType === 'CO_LEADER') {
        db.prepare('UPDATE Guilds SET coLeaderId = ? WHERE id = ?').run(userId, guildId);
        return true;
    }
    if (roleType === 'MANAGER') {
        db.prepare('INSERT OR IGNORE INTO Managers (guildId, userId) VALUES (?, ?)').run(guildId, userId);
        return true;
    }
    if (roleType === 'MAIN') {
        db.prepare('INSERT OR IGNORE INTO MainRosters (guildId, userId) VALUES (?, ?)').run(guildId, userId);
        return true;
    }
    db.prepare('INSERT OR IGNORE INTO SubRosters (guildId, userId) VALUES (?, ?)').run(guildId, userId);
    return true;
}
export function removeMemberFromRole(db, guildId, userId, roleType) {
    if (roleType === 'CO_LEADER') {
        const guild = getGuildById(db, guildId);
        if (!guild?.coLeaderId || guild.coLeaderId !== userId)
            return false;
        db.prepare('UPDATE Guilds SET coLeaderId = NULL WHERE id = ?').run(guildId);
        return true;
    }
    if (roleType === 'MANAGER') {
        const result = db.prepare('DELETE FROM Managers WHERE guildId = ? AND userId = ?').run(guildId, userId);
        return result.changes > 0;
    }
    if (roleType === 'MAIN') {
        const result = db.prepare('DELETE FROM MainRosters WHERE guildId = ? AND userId = ?').run(guildId, userId);
        return result.changes > 0;
    }
    const result = db.prepare('DELETE FROM SubRosters WHERE guildId = ? AND userId = ?').run(guildId, userId);
    return result.changes > 0;
}
export function getMembersByRole(db, guildId, roleType) {
    if (roleType === 'CO_LEADER') {
        const guild = getGuildById(db, guildId);
        return guild?.coLeaderId ? [guild.coLeaderId] : [];
    }
    if (roleType === 'MANAGER') {
        return db.prepare('SELECT userId FROM Managers WHERE guildId = ? ORDER BY createdAt ASC').all(guildId).map((row) => row.userId);
    }
    if (roleType === 'MAIN') {
        return db.prepare('SELECT userId FROM MainRosters WHERE guildId = ? ORDER BY createdAt ASC').all(guildId).map((row) => row.userId);
    }
    return db.prepare('SELECT userId FROM SubRosters WHERE guildId = ? ORDER BY createdAt ASC').all(guildId).map((row) => row.userId);
}
export function createInvite(db, guildId, targetUserId, roleType, inviterId, expiresAt) {
    const result = db
        .prepare(`INSERT INTO Invites (guildId, targetUserId, roleType, inviterId, status, expiresAt)
       VALUES (?, ?, ?, ?, 'PENDING', ?)`)
        .run(guildId, targetUserId, roleType, inviterId, expiresAt);
    return Number(result.lastInsertRowid);
}
export function getInviteById(db, inviteId) {
    return db.prepare('SELECT * FROM Invites WHERE id = ?').get(inviteId) || null;
}
export function getPendingInviteForTarget(db, guildId, targetUserId, roleType) {
    db.prepare(`UPDATE Invites
      SET status = 'DECLINED'
      WHERE guildId = ?
        AND targetUserId = ?
        AND roleType = ?
        AND status = 'PENDING'
        AND expiresAt IS NOT NULL
        AND datetime(expiresAt) <= datetime('now')`).run(guildId, targetUserId, roleType);
    return (db
        .prepare(`SELECT * FROM Invites
         WHERE guildId = ?
           AND targetUserId = ?
           AND roleType = ?
           AND status = 'PENDING'
           AND (expiresAt IS NULL OR datetime(expiresAt) > datetime('now'))
         ORDER BY createdAt DESC
         LIMIT 1`)
        .get(guildId, targetUserId, roleType) || null);
}
export function setInviteStatus(db, inviteId, status) {
    db.prepare('UPDATE Invites SET status = ? WHERE id = ?').run(status, inviteId);
}
function isInviteExpired(invite) {
    if (!invite?.expiresAt)
        return false;
    return Date.now() > new Date(invite.expiresAt).getTime();
}
export function validateInviteForAction(db, inviteId) {
    const invite = getInviteById(db, inviteId);
    if (!invite)
        return { invite: null, reason: 'Invitation not found.' };
    if (invite.status !== 'PENDING')
        return { invite: null, reason: 'This invitation has already been finalized.' };
    if (isInviteExpired(invite)) {
        setInviteStatus(db, inviteId, 'DECLINED');
        return { invite: null, reason: 'This invitation has expired.' };
    }
    return { invite };
}
export function formatGuildPanelDescription(db, guildId) {
    const guild = db.prepare('SELECT * FROM Guilds WHERE id = ?').get(guildId);
    if (!guild)
        return 'Guild not found.';
    const managers = db.prepare('SELECT userId FROM Managers WHERE guildId = ?').all(guildId);
    const mains = db.prepare('SELECT userId FROM MainRosters WHERE guildId = ?').all(guildId);
    const subs = db.prepare('SELECT userId FROM SubRosters WHERE guildId = ?').all(guildId);
    let description = `# <:guildleader:1471171042520334477> ${guild.name}\n\n`;
    description += `### <:guildleader:1471171042520334477> Leader\n<@${guild.leaderId}>\n`;
    description += `### <:topentrosa:1471116715264970762> Co-Leader\n${guild.coLeaderId ? `<@${guild.coLeaderId}>` : 'None'}\n`;
    description += `<:topplayericon:1470815685503352883> **Managers**\n`;
    description += managers.length > 0 ? `${managers.map((m) => `<@${m.userId}>`).join(' ')}\n\n` : 'None\n\n';
    description += `:globe_with_meridians: **Region Stats: ${guild.region}**\n`;
    description += `**Regions:** ${guild.region}\n`;
    description += `:signal_strength: **W/L:** ${guild.wins || 0}/${guild.losses || 0}\n`;
    description += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    description += `:crossed_swords: **Main Roster (${guild.region})**\n`;
    description += mains.length > 0 ? `${mains.map((m) => `<@${m.userId}>`).join('\n')}\n\n` : 'None\n\n';
    description += `:dagger: **Sub Roster (${guild.region})**\n`;
    description += subs.length > 0 ? subs.map((s) => `<@${s.userId}>`).join('\n') : 'None';
    return description;
}
export function buildGuildPanelEmbed(db, guildId, thumbnailUrl = null) {
    return new EmbedBuilder()
        .setDescription(formatGuildPanelDescription(db, guildId))
        .setColor('#2a8900')
        .setThumbnail(thumbnailUrl);
}
async function tryEditPanelMessage(thread, panelMessageId, embed) {
    const message = await thread.messages.fetch(panelMessageId).catch(() => null);
    if (message) {
        await message.edit({ embeds: [embed] });
        return true;
    }
    if (panelMessageId === thread.id) {
        const starter = await thread.fetchStarterMessage().catch(() => null);
        if (starter) {
            await starter.edit({ embeds: [embed] });
            return true;
        }
    }
    return false;
}
export async function refreshGuildPanel(client, db, guildId) {
    const guild = getGuildById(db, guildId);
    if (!guild?.panelChannelId || !guild?.panelMessageId)
        return false;
    const discordGuild = await client.guilds.fetch(guild.id.split('-')[0]).catch(() => null);
    const embed = buildGuildPanelEmbed(db, guildId, discordGuild?.iconURL() || null);
    const panelChannel = await client.channels.fetch(guild.panelChannelId).catch(() => null);
    if (panelChannel?.isThread()) {
        return tryEditPanelMessage(panelChannel, guild.panelMessageId, embed);
    }
    const maybeThread = await client.channels.fetch(guild.panelMessageId).catch(() => null);
    if (maybeThread?.isThread()) {
        return tryEditPanelMessage(maybeThread, guild.panelMessageId, embed);
    }
    return false;
}
export function createWar(db, openerGuildId, opponentGuildId, channelId, createdByUserId, panelMessageId) {
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days from now
    const result = db
        .prepare(`INSERT INTO Wars (openerGuildId, opponentGuildId, channelId, createdByUserId, panelMessageId, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?)`)
        .run(openerGuildId, opponentGuildId, channelId, createdByUserId, panelMessageId, expiresAt);
    return Number(result.lastInsertRowid);
}
export function createWager(db, type, channelId, challenger1Id, challenger2Id, challenged1Id, challenged2Id, panelMessageId) {
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days from now
    const result = db
        .prepare(`INSERT INTO Wagers (type, channelId, challenger1Id, challenger2Id, challenged1Id, challenged2Id, panelMessageId, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(type, channelId, challenger1Id, challenger2Id, challenged1Id, challenged2Id, panelMessageId, expiresAt);
    return Number(result.lastInsertRowid);
}
export function getWagerById(db, wagerId) {
    return db.prepare('SELECT * FROM Wagers WHERE id = ?').get(wagerId) || null;
}
export function getWagerByChannelId(db, channelId) {
    return db.prepare('SELECT * FROM Wagers WHERE channelId = ? ORDER BY id DESC LIMIT 1').get(channelId) || null;
}
export function recordWagerAcceptance(db, wagerId, userId) {
    const wager = getWagerById(db, wagerId);
    if (!wager)
        return [];
    let accepted = [];
    try {
        accepted = JSON.parse(wager.acceptedByUserIds || '[]');
        if (!Array.isArray(accepted))
            accepted = [];
    }
    catch {
        accepted = [];
    }
    if (!accepted.includes(userId))
        accepted.push(userId);
    db.prepare('UPDATE Wagers SET acceptedByUserIds = ? WHERE id = ?').run(JSON.stringify(accepted), wagerId);
    return accepted;
}
export function markWagerAccepted(db, wagerId) {
    db.prepare(`UPDATE Wagers
     SET status = 'ACCEPTED'
     WHERE id = ? AND status = 'PENDING'`).run(wagerId);
}
export function dodgeWager(db, wagerId, dodgedByUserId) {
    db.prepare(`UPDATE Wagers
     SET status = 'DODGED', dodgedByUserId = ?, closedAt = CURRENT_TIMESTAMP
     WHERE id = ? AND status IN ('PENDING', 'ACCEPTED')`).run(dodgedByUserId, wagerId);
}
export function closeWager(db, wagerId) {
    db.prepare(`UPDATE Wagers
     SET status = 'CLOSED', closedAt = CURRENT_TIMESTAMP
     WHERE id = ? AND status IN ('PENDING', 'ACCEPTED')`).run(wagerId);
}
export function getWarById(db, warId) {
    return db.prepare('SELECT * FROM Wars WHERE id = ?').get(warId) || null;
}
export function getWarByChannelId(db, channelId) {
    return db.prepare('SELECT * FROM Wars WHERE channelId = ? ORDER BY id DESC LIMIT 1').get(channelId) || null;
}
export function acceptWar(db, warId, acceptedByUserId, acceptedByGuildId) {
    db.prepare(`UPDATE Wars
     SET status = 'ACCEPTED', acceptedByUserId = ?, acceptedByGuildId = ?
     WHERE id = ? AND status = 'PENDING'`).run(acceptedByUserId, acceptedByGuildId, warId);
}
export function finishWar(db, warId, resultGuildId, winnerScore, loserScore, clipsLink = null) {
    db.prepare(`UPDATE Wars
     SET status = 'FINISHED', resultGuildId = ?, winnerScore = ?, loserScore = ?, clipsLink = ?, closedAt = CURRENT_TIMESTAMP
     WHERE id = ? AND status IN ('PENDING', 'ACCEPTED')`).run(resultGuildId, winnerScore, loserScore, clipsLink, warId);
}
export function dodgeWar(db, warId) {
    db.prepare(`UPDATE Wars
     SET status = 'DODGED', closedAt = CURRENT_TIMESTAMP
     WHERE id = ? AND status IN ('PENDING', 'ACCEPTED')`).run(warId);
}
export function addGuildWin(db, guildId) {
    db.prepare('UPDATE Guilds SET wins = COALESCE(wins, 0) + 1 WHERE id = ?').run(guildId);
}
export function addGuildLoss(db, guildId) {
    db.prepare('UPDATE Guilds SET losses = COALESCE(losses, 0) + 1 WHERE id = ?').run(guildId);
}
export function renderGuildPanel(db, guildId) {
    const guild = db.prepare('SELECT * FROM Guilds WHERE id = ?').get(guildId);
    if (!guild)
        return null;
    const managers = db.prepare('SELECT COUNT(*) as count FROM Managers WHERE guildId = ?').get(guildId);
    const mainRosters = db.prepare('SELECT COUNT(*) as count FROM MainRosters WHERE guildId = ?').get(guildId);
    const subRosters = db.prepare('SELECT COUNT(*) as count FROM SubRosters WHERE guildId = ?').get(guildId);
    return {
        guild,
        managers: managers.count,
        mainRosters: mainRosters.count,
        subRosters: subRosters.count,
    };
}
export function checkExpiredTickets(db) {
    const now = new Date().toISOString();
    const expiredWars = db.prepare('SELECT * FROM Wars WHERE status = ? AND expiresAt < ?').all('PENDING', now);
    const expiredWagers = db.prepare('SELECT * FROM Wagers WHERE status = ? AND expiresAt < ?').all('PENDING', now);
    return { wars: expiredWars, wagers: expiredWagers };
}
export function autoDodgeWar(db, warId) {
    db.prepare('UPDATE Wars SET status = ?, closedAt = CURRENT_TIMESTAMP WHERE id = ?').run('DODGED', warId);
}
export function autoDodgeWager(db, wagerId) {
    db.prepare('UPDATE Wagers SET status = ?, closedAt = CURRENT_TIMESTAMP WHERE id = ?').run('DODGED', wagerId);
}
export function getPendingTicketsForReminder(db) {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const pendingWars = db.prepare('SELECT * FROM Wars WHERE status = ? AND createdAt < ? AND expiresAt > ?').all('PENDING', twoHoursAgo, now.toISOString());
    const pendingWagers = db.prepare('SELECT * FROM Wagers WHERE status = ? AND createdAt < ? AND expiresAt > ?').all('PENDING', twoHoursAgo, now.toISOString());
    return { wars: pendingWars, wagers: pendingWagers };
}
//# sourceMappingURL=database.js.map