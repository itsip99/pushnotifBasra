
const { JWT } = require('google-auth-library');
import _ from "lodash"


const scopes = 'https://www.googleapis.com/auth/firebase.messaging'


export function getAccessTokenSPKbasra() {
    return new Promise(async function (resolve, reject) {
        const key = require("./spk-basra-7062ea7fea04.json");
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