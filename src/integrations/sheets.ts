import { google } from 'googleapis';
import { parse } from 'date-format-parse';
import { join } from 'path';

const scopes = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

const auth = new google.auth.GoogleAuth({
    keyFilename: process.env.GOOGLE_CREDS_FILE_PATH,
    scopes
});

export interface QualityMatchingData {
    mediaType: string;
    rootFolder: string;
    qualityProfile: string;
}

export let qualityMatchings: QualityMatchingData[] = [];

export const getQualityMatchings = () => qualityMatchings;

export const syncSheets = () => {
    return new Promise((resolve) => {
        google.sheets('v4').spreadsheets.get({
            spreadsheetId: process.env.SPREADSHEET_ID,
            auth,
            includeGridData: true
        }).then((res) => {
            const qualityMatchingData = res.data.sheets![0]!.data![0].rowData;
            const newQualityMatchings: QualityMatchingData[] = [];
            for (let i = 1; i < qualityMatchingData!.length; i++) {
                const row = qualityMatchingData![i].values!;
                const mediaType = row[0].formattedValue!;
                if (!mediaType) continue;
                const rootFolder = row[1].formattedValue!;
                const qualityProfile = row[2].formattedValue!;
                newQualityMatchings.push({ mediaType, rootFolder, qualityProfile });
            }
            qualityMatchings = newQualityMatchings;
            const data = { newQualityMatchings };
            console.log(data);
            resolve(data);
        });
    });
};
