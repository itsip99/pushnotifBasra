const { JWT } = require('google-auth-library');
import _ from "lodash"


const scopes = 'https://www.googleapis.com/auth/firebase.messaging'


export function getAccessTokenBasraMobile() {
    return new Promise(async function (resolve, reject) {
        const key = require("./basra-mobile-86f72-firebase-adminsdk-3nbag-ca009489f4.json");
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