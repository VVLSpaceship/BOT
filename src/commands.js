import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
export async function registerCommands(token, clientId) {
    const commands = [];
    const commandsPath = join(__dirname, 'commands');
    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js') && !file.endsWith('.map'));
    for (const file of commandFiles) {
        const filePath = join(commandsPath, file);
        const command = await import(pathToFileURL(filePath).href);
        if (command.data && command.execute) {
            commands.push(command.data.toJSON());
        }
    }
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        console.log(`Registering ${commands.length} commands...`);
        const ROOT_GUILD_ID = process.env.GUILD_ID || '1452090364675493962';
        const guildId = ROOT_GUILD_ID || process.env.TEST_GUILD_ID || process.env.GUILD_ID;
        if (guildId) {
            // Clear global commands to avoid duplicate entries in the UI, then register guild commands
            try {
                await rest.put(Routes.applicationCommands(clientId), { body: [] });
                console.log('✅ Global commands cleared');
            }
            catch (e) {
                console.warn('Failed to clear global commands (continuing):', e);
            }
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
            console.log(`✅ Commands registered for guild ${guildId}`);
        }
        else {
            await rest.put(Routes.applicationCommands(clientId), { body: commands });
            console.log('✅ Commands registered globally (may take up to 1 hour)');
        }
    }
    catch (error) {
        console.error('❌ Error registering commands:', error);
    }
}
export async function loadCommands() {
    const commands = new Map();
    const commandsPath = join(__dirname, 'commands');
    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js') && !file.endsWith('.map'));
    for (const file of commandFiles) {
        const filePath = join(commandsPath, file);
        const command = await import(pathToFileURL(filePath).href);
        if (command.data && command.execute) {
            commands.set(command.data.name, command);
            console.log(`Loaded command: ${command.data.name} (from ${file})`);
        }
    }
    return commands;
}
//# sourceMappingURL=commands.js.map