
const { JWT } = require('google-auth-library');
import _ from "lodash"


const scopes = 'https://www.googleapis.com/auth/firebase.messaging'

// TODO: taruh service account JSON asli LSA di folder ini dengan nama file
// "lsa-firebase-adminsdk.json" (Firebase Console -> Project Settings ->
// Service Accounts -> Generate new private key), lalu sesuaikan nama file
// di require() di bawah kalau nama file aslinya berbeda.
export function getAccessTokenLSA(): Promise<string> {
    return new Promise(async function (resolve, reject) {
        const key = require("../lsa/lsamobile-firebase-adminsdk-fbsvc-ada2a5477d.json");
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
