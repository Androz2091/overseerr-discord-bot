// ESM
import Fastify from 'fastify'
import { MediaType, OverseerrMediaData } from './integrations/overseerr';
import { client, overseerrClient } from '.';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from 'discord.js';
const fastify = Fastify({
  logger: true
});

// Declare a route
fastify.get('/', (request, reply) => {
    reply.send({ hello: 'world' });
});

interface OverseerrMediaPendingNotificationData {
    media: {
        media_type: MediaType;
        tmdbId: string;
        tvdbId: string;
    },
    request: {
        request_id: string;
    }
}

fastify.post('/overseerr', async (request, reply) => {
    const data = request.body as any;
    console.log(data);

    if (data.notification_type === 'MEDIA_PENDING') {
        const logsChannel = await client.channels.fetch(process.env.LOGS_CHANNEL_ID!) as TextChannel;
        
        const approveRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`approve_${data.request.request_id}`)
                    .setLabel('Approuver')
                    .setStyle(ButtonStyle.Success)
            );

        const pendingData = data as OverseerrMediaPendingNotificationData;
        if (pendingData.media.media_type === 'movie') {
            const movieData = await overseerrClient.resolveMovieData(parseInt(pendingData.media.tmdbId));
            const embed = overseerrClient.buildDiscordEmbed(movieData as OverseerrMediaData);
            logsChannel.send({ embeds: [embed], components: [approveRow] });
        } else if (pendingData.media.media_type === 'tv') {
            const tvData = await overseerrClient.resolveTvData(parseInt(pendingData.media.tvdbId));
            const embed = overseerrClient.buildDiscordEmbed(tvData as OverseerrMediaData);
            logsChannel.send({ embeds: [embed], components: [approveRow] });
        }

    }

    if (data.notification_type === 'MEDIA_APPROVED') {
        const logsChannel = await client.channels.fetch(process.env.LOGS_CHANNEL_ID!) as TextChannel;
        logsChannel.send(`La demande concernant **${data.subject}** a été approuvée.`);
    }

    reply.send({ hello: 'world' });
});

// Run the server!
fastify.listen({ port: process.env.WEB_SERVER_PORT }, (err, address) => {
    if (err) throw err
    console.log(`server listening on ${address}`);
});
