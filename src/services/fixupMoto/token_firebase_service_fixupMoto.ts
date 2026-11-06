const { JWT } = require('google-auth-library');
import _ from "lodash"


const scopes = 'https://www.googleapis.com/auth/firebase.messaging'

// URL FCM diambil dari project_id di service-account.json, supaya project
// tujuan selalu sama dengan credential (hindari "SenderId mismatch").
export const FIXUPMOTO_FCM_URL = `https://fcm.googleapis.com/v1/projects/${require("./service-account.json").project_id}/messages:send`;


export function getAccessTokenFixUpMoto() {
    return new Promise(async function (resolve, reject) {
        const key = require("./service-account.json");
        const jwtClient = new JWT(
            {
                email: key.client_email,
                key: key.private_key,
                scopes: scopes,
            }

        );
        jwtClient.authorize(function (err: any, tokens: any) {
            if (err) {
                reject(err);
                return;
            }
            resolve(tokens.access_token);
        });

    });
}