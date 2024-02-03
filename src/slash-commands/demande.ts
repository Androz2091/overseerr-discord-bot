import { ActionRowBuilder, ApplicationCommandOptionType, ButtonBuilder, ButtonStyle } from "discord.js";
import { SlashCommandRunFunction } from "../handlers/commands";
import { overseerrClient } from "..";

export interface SeasonData {
    isValid: boolean;
    seasonId: number;
}

export const commands = [
    {
        name: "demande",
        description: "Demandez un nouveau film ou une nouvelle série.",
        options: [
            {
                name: "titre",
                description: "Le titre du film ou de la série.",
                type: ApplicationCommandOptionType.String,
                required: true,
                autocomplete: true
            },
            {
                name: "type-de-media",
                description: "Le type du média que vous demandez.",
                type: ApplicationCommandOptionType.String,
                required: true,
                autocomplete: true
            },
            {
                name: "saisons",
                description: "Les saisons à mettre en ligne.",
                type: ApplicationCommandOptionType.String,
                required: false,
                autocomplete: true
            }
        ]
    }
];

export const run: SlashCommandRunFunction = async (interaction) => {

    const mediaData = interaction.options.get('titre')!.value!;
    const rootDirectory = interaction.options.get('type-de-media')!.value! as string;
    let seasonId = interaction.options.get('saisons')?.value as string;

    const seasonData = {
        isValid: !isNaN(parseInt(seasonId)),
        seasonId: parseInt(seasonId) + 1
    }

    const [id, mediaType] = mediaData.toString().split('_');

    const confirmCancelComponents = [
        new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setLabel("C'est bien cette série !")
                    .setStyle(ButtonStyle.Success)
                    .setCustomId(`confirm_${id}_${mediaType}_${rootDirectory}`),
                new ButtonBuilder()
                    .setLabel('Annuler')
                    .setStyle(ButtonStyle.Danger)
                    .setCustomId('cancel')
            )
    ]

    if (mediaType === 'tv') {
        confirmCancelComponents[0].components[0].setCustomId(`confirm_${id}_${mediaType}_${rootDirectory}_${seasonId}`);

        const sonarrData = await overseerrClient.getQualityProfilesAndRootFolders(mediaType);
        const rootDirData = sonarrData.rootFolders.find((folder) => folder.id === parseInt(rootDirectory));
        const tvData = await overseerrClient.resolveTvData(parseInt(id));
        const embed = overseerrClient.buildDiscordEmbed(tvData, rootDirData?.path!, seasonData);

        return interaction.reply({ embeds: [embed], components: confirmCancelComponents, ephemeral: true });
    } else if (mediaType === 'movie') {
        confirmCancelComponents[0].components[0].setLabel("C'est bien ce film !");

        const radarrData = await overseerrClient.getQualityProfilesAndRootFolders(mediaType);
        const rootDirData = radarrData.rootFolders.find((folder) => folder.id === parseInt(rootDirectory));
        const movieData = await overseerrClient.resolveMovieData(parseInt(id));
        const embed = overseerrClient.buildDiscordEmbed(movieData, rootDirData?.path!);

        return interaction.reply({ embeds: [embed], components: confirmCancelComponents, ephemeral: true });
    }

}
