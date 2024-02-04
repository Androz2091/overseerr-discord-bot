import { config } from 'dotenv';
config();

import './sentry';
import './server';

import { initialize as initializeDatabase } from './database';
import { loadContextMenus, loadMessageCommands, loadSlashCommands, synchronizeSlashCommands } from './handlers/commands';

import { getQualityMatchings, syncSheets } from './integrations/sheets';

import { Client, IntentsBitField } from 'discord.js';
import { loadTasks } from './handlers/tasks';
import { MediaType, OverseerrClient } from './integrations/overseerr';
export const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages
    ]
});

const { slashCommands, slashCommandsData } = loadSlashCommands(client);
const { contextMenus, contextMenusData } = loadContextMenus(client);
const messageCommands = loadMessageCommands(client);
loadTasks(client);

synchronizeSlashCommands(client, [...slashCommandsData, ...contextMenusData], {
    debug: true,
    guildId: process.env.GUILD_ID
});

export const overseerrClient = new OverseerrClient(process.env.OVERSEERR_BASE_URL, process.env.OVERSEERR_API_KEY, process.env.OVERSEERR_EMAIL, process.env.OVERSEERR_PASSWORD);

client.on('interactionCreate', async (interaction) => {

    if (interaction.isAutocomplete()) {

        if (interaction.commandName === 'demande') {

            const selectedOption = interaction.options.getFocused(true);

            if (selectedOption.name === 'titre') {

                const beginningInput = selectedOption.value;
                const movies = await overseerrClient.search(beginningInput);

                const options = movies.map((movie) => ({
                    name: '[' + movie.mediaType + '] ' + movie.title + ' (' + movie.releaseYear + ')',
                    value: movie.id.toString() + '_' + movie.mediaType
                }));

                return interaction.respond(options);

            }

            else if (selectedOption.name === 'type-de-media') {

                const selectedMediaData = interaction.options.get('titre')?.value;
                if (!selectedMediaData) {
                    return interaction.respond([]);
                } else {
                    const [_id, mediaType] = selectedMediaData.toString().split('_');
                    const rootFolders = await overseerrClient.getQualityProfilesAndRootFolders(mediaType as MediaType);
                    const options = rootFolders.rootFolders.map((folder) => ({
                        name: folder.path,
                        value: folder.id.toString()
                    }));
                    return interaction.respond(options);
                }

            } else if (selectedOption.name === 'saisons') {

                const beginningInput = selectedOption.value;
                const selectedMediaData = interaction.options.get('titre')?.value;
                if (!selectedMediaData) {
                    return interaction.respond([]);
                } else {
                    const [id, mediaType] = selectedMediaData.toString().split('_');
                    if (mediaType === 'tv') {
                        const tvData = await overseerrClient.resolveTvData(parseInt(id));
                        let options = new Array(tvData.seasons.length).fill(0).map((_, i) => ({
                            name: 'Saison ' + (i + 1),
                            value: i.toString()
                        }));
                        // if >= 24 seasons, gets only the one with the typed number
                        if (tvData.seasons.length >= 20) {
                            options = options.filter((option) => option.name.includes(beginningInput)).slice(0, 20);
                        }
                        options.push({
                            name: 'Toute la série',
                            value: 'all'
                        });
                        return interaction.respond(options);
                    } else {
                        return interaction.respond([{
                            name: 'le film complet',
                            value: 'all'
                        }]);
                    }
                }

            }

        }

    }

    if (interaction.isButton()) {

        if (interaction.customId.startsWith('confirm')) {
            
            const [_confirm, id, mediaType, rootFolder, _seasonId] = interaction.customId.split('_');


            const qualityProfiles = await overseerrClient.getQualityProfilesAndRootFolders(mediaType as MediaType);
            const rootFolderPath = qualityProfiles.rootFolders.find((folder) => folder.id === parseInt(rootFolder))?.path!;

            const qualityMatchings = await getQualityMatchings();
            const matching = qualityMatchings.find((match) => match.mediaType === mediaType && match.rootFolder === rootFolderPath);
            const qualityProfileId = qualityProfiles.profiles.find((profile) => profile.name === matching?.qualityProfile)?.id!;

            if (mediaType === 'tv') {

                const tvData = await overseerrClient.resolveTvData(parseInt(id));

                await overseerrClient.softRequestTv(parseInt(id), rootFolderPath, qualityProfileId, parseInt(_seasonId), tvData.seasons.length);
    
                return void interaction.update({
                    content: `La série **${tvData.title}** a bien été demandée !`,
                    components: []
                });
            } else if (mediaType === 'movie') {

                const movieData = await overseerrClient.resolveMovieData(parseInt(id));
                await overseerrClient.softRequestMovie(parseInt(id), rootFolderPath, qualityProfileId);
                return void interaction.update({
                    content: `Le film **${movieData.title}** a bien été demandé !`,
                    components: []
                });
            }
        }

        else if (interaction.customId === 'cancel') {
            return void interaction.update({
                content: 'La demande a bien été annulée.',
                components: []
            });
        }

        if (interaction.customId.startsWith('approve')) {
            const [_approve, id] = interaction.customId.split('_');

            if (interaction.user.id !== process.env.MANAGER_DISCORD_USER_ID) {
                return void interaction.reply({
                    content: 'Vous n\'avez pas la permission d\'approuver cette demande.',
                    ephemeral: true
                });
            }

            await overseerrClient.approveRequest(parseInt(id));

            return void interaction.update({
                content: 'La demande a bien été approuvée.',
                components: []
            });
        }

    }

    if (interaction.isCommand()) {

        const isContext = interaction.isContextMenuCommand();
        if (isContext) {
            const run = contextMenus.get(interaction.commandName);
            if (!run) return;
            run(interaction, interaction.commandName);
        } else {
            const run = slashCommands.get(interaction.commandName);
            if (!run) return;
            run(interaction, interaction.commandName);
        }
    }

});

client.on('messageCreate', (message) => {

    if (message.author.bot) return;

    if (!process.env.COMMAND_PREFIX) return;
    
    const args = message.content.slice(process.env.COMMAND_PREFIX.length).split(/ +/);
    const commandName = args.shift();

    if (!commandName) return;

    const run = messageCommands.get(commandName);
    
    if (!run) return;

    run(message, commandName);

});

client.on('ready', () => {
    console.log(`Logged in as ${client.user!.tag}. Ready to serve ${client.users.cache.size} users in ${client.guilds.cache.size} servers 🚀`);

    if (process.env.DB_NAME) {
        initializeDatabase().then(() => {
            console.log('Database initialized 📦');
        });
    } else {
        console.log('Database not initialized, as no keys were specified 📦');
    }

    if (process.env.SPREADSHEET_ID) {
        syncSheets();
    }
});

client.login(process.env.DISCORD_CLIENT_TOKEN);
