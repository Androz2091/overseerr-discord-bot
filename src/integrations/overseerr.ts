import { EmbedBuilder } from "discord.js";
import { SeasonData } from "../slash-commands/demande";

export type MediaType = 'movie' | 'tv';

export interface OverseerrSearchMediaData {
    id: number;
    mediaType: MediaType;
    releaseDate: string;
    releaseYear: string; // this is not included in Overseerr, gets added using the search method
    title: string;

    // tv stuff
    firstAirDate: string;
    name: string;
}

export interface OverseerrQualityProfile {
    id: number;
    name: string;
}

export interface OverseerrRootFolder {
    id: number;
    path: string;
}

export interface OverseerrMediaData {
    id: number;
    title: string;
    overview: string;
    releaseDate: string;
    thumbnailUrl: string;
    madeBy: string;
}

export interface OverseerrSeasonData {
    releaseYear: string;
    episodeCount: number;
    id: number;
}

export interface OverseerrTvData extends OverseerrMediaData {
    seasons: OverseerrSeasonData[];
}

export class OverseerrClient {

    private baseUrl: string;
    private apiKey: string;
    private softEmail: string;
    private softPassword: string;
    private softCookie: string;
    
    constructor (baseUrl: string, apiKey: string, softEmail: string, softPassword: string) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;

        this.softEmail = softEmail;
        this.softPassword = softPassword;
        this.softCookie = '';
    }

    get authenticationHeader () {
        return {
            'X-Api-Key': this.apiKey
        };
    }

    get softAuthenticationHeader () {   
        return {
            'Cookie': this.softCookie
        };
    }

    private async refreshSoftCookie () {
        const response = await fetch(`${this.baseUrl}/api/v1/auth/local`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: this.softEmail,
                password: this.softPassword
            })
        });
        console.log(await response.text());
        this.softCookie = response.headers.get('set-cookie') || '';
        console.log(this.softCookie);
    }

    private buildImageUrl (path: string) {
        return `https://image.tmdb.org/t/p/w300_and_h450_face${path}`;
    }

    public buildDiscordEmbed (mediaData: OverseerrMediaData, rootDirectory?: string, seasonData?: SeasonData) {
        const embed = new EmbedBuilder()
            .setTitle(mediaData.title)
            .setDescription(mediaData.overview)
            .addFields([
                {
                    name: 'Sortie du média',
                    value: mediaData.releaseDate
                },
                {
                    name: 'Société de production',
                    value: mediaData.madeBy
                }
            ])
            .setImage(mediaData.thumbnailUrl)
            .setColor(process.env.EMBED_COLOR);
        if (rootDirectory) {
            embed.addFields([
                {
                    name: 'Dossier de stockage choisi',
                    value: rootDirectory
                }
            ]);
        }
        if (seasonData?.isValid) {
            embed.addFields([{
                name: 'Saison sélectionnée',
                value: 'Saison ' + seasonData.seasonId
            }]);
        }
        return embed;
    }

    public async search(titleName: string): Promise<OverseerrSearchMediaData[]> {
        const response = await fetch(`${this.baseUrl}/api/v1/search?query=${titleName}`, {
            headers: { ...this.authenticationHeader, ...{ 'Content-Type': 'application/json' } }
        });
        const data = await response.json();
        if (data.errors) {
            return []
        }
        return data?.results
            ?.filter((media: OverseerrSearchMediaData) => (media.releaseDate || media.firstAirDate) && (media.title || media.name))
            .map((media: OverseerrSearchMediaData) => {
                const releaseDate = media.releaseDate || media.firstAirDate;
                const title = media.title || media.name;
                return {
                    id: media.id,
                    mediaType: media.mediaType,
                    releaseDate: releaseDate,
                    title: title,
                    releaseYear: releaseDate.split('-')[0]
                }
            })
    }

    public async resolveMainRRId (serviceName: 'radarr' | 'sonarr') {
        const response = await fetch(`${this.baseUrl}/api/v1/service/${serviceName}`, {
            headers: { ...this.authenticationHeader, ...{ 'Content-Type': 'application/json' } }
        });
        const data = await response.json();
        return data?.[0]?.id;
    }

    public async getQualityProfilesAndRootFolders (mediaType: MediaType): Promise<{
        profiles: OverseerrQualityProfile[],
        rootFolders: OverseerrRootFolder[]
    }> {
        const serviceName = mediaType === 'tv' ? 'sonarr' : 'radarr';
        const RRId = await this.resolveMainRRId(serviceName);
        const response = await fetch(`${this.baseUrl}/api/v1/service/${serviceName}/${RRId}`, {
            headers: { ...this.authenticationHeader, ...{ 'Content-Type': 'application/json' } }
        });
        const data = await response.json();
        return {
            profiles: data.profiles,
            rootFolders: data.rootFolders
        };
    }

    public parseProductionCompanyName (productionCompanies: any[]) {
        return productionCompanies?.[0]?.name || 'Inconnu';
    }

    public async resolveMovieData (id: number): Promise<OverseerrMediaData> {
        const response = await fetch(`${this.baseUrl}/api/v1/movie/${id}`, {
            headers: { ...this.authenticationHeader, ...{ 'Content-Type': 'application/json' } }
        });
        const data = await response.json();
        return {
            id: data.id,
            title: data.title,
            overview: data.overview,
            releaseDate: data.releaseDate,
            thumbnailUrl: this.buildImageUrl(data.posterPath),
            madeBy: this.parseProductionCompanyName(data.productionCompanies)
        };
    }

    public async resolveTvData (id: number): Promise<OverseerrTvData> {
        const response = await fetch(`${this.baseUrl}/api/v1/tv/${id}`, {
            headers: { ...this.authenticationHeader, ...{ 'Content-Type': 'application/json' } }
        });
        const data = await response.json();
        return {
            id: data.id,
            title: data.name,
            overview: data.overview,
            releaseDate: data.firstAirDate,
            thumbnailUrl: this.buildImageUrl(data.posterPath),
            madeBy: this.parseProductionCompanyName(data.productionCompanies),
            seasons: data.seasons
        };
    }

    public async softRequestMovie (mediaId: number, rootFolder: string, qualityProfileId: number) {
        console.log('soft requesting movie');
        await this.refreshSoftCookie();
        console.log(mediaId);
        console.log(rootFolder);
        const body = {
            mediaType: "movie",
            mediaId: mediaId,
            tvdbId: mediaId,
            is4k: false,
            serverId: 0,
            rootFolder,
            profileId: qualityProfileId,
            userId: 0
        }
        const response = await fetch(`${this.baseUrl}/api/v1/request`, {
            method: 'POST',
            headers: { ...this.softAuthenticationHeader, ...{ 'Content-Type': 'application/json' } },
            body: JSON.stringify(body)
        });

        console.log(body);
        const data = await response.json();
        console.log(data);
    }

    public async softRequestTv (mediaId: number, rootFolder: string, qualityProfileId: number, seasonId: number, totalSeasonCount: number) {
        console.log('soft requesting tv');
        await this.refreshSoftCookie();
        console.log(mediaId);
        console.log(rootFolder);
        let body = {
            mediaType: "tv",
            mediaId: mediaId,
            tvdbId: mediaId,
            is4k: false,
            serverId: 0,
            rootFolder,
            profileId: qualityProfileId,
            userId: 0,
            seasons: isNaN(seasonId) ? new Array(totalSeasonCount).fill(0).map((_, i) => i + 1) : [seasonId + 1]
        }
        const response = await fetch(`${this.baseUrl}/api/v1/request`, {
            method: 'POST',
            headers: { ...this.softAuthenticationHeader, ...{ 'Content-Type': 'application/json' } },
            body: JSON.stringify(body)
        });

        console.log(body);
        const data = await response.json();
        console.log(data);
    }

    public async approveRequest (requestId: number) {
        const response = await fetch(`${this.baseUrl}/api/v1/request/${requestId}/approve`, {
            method: 'POST',
            headers: { ...this.authenticationHeader, ...{ 'Content-Type': 'application/json' } }
        });
        const data = await response.json();
        console.log(data);
    }

}
