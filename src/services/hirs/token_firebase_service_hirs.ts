
const { JWT } = require('google-auth-library');
import _ from "lodash"
import { logErrorBlock } from "../../logger/logger";


const scopes = 'https://www.googleapis.com/auth/firebase.messaging'


export function getAccessTokenHIRS() : Promise<string> {
    return new Promise(async function (resolve, reject) {
        let key: any;
        try {
            key = require("./hris-mobile-flutter-bba9799773f1.json");
        } catch (err: any) {
            logErrorBlock({ source: "getAccessTokenHIRS", type: "LOAD_JSON_FAIL", flow: ["GET_TOKEN", "LOAD_JSON", "FAIL"], error: err?.message || String(err) });
            reject(err);
            return;
        }

        const jwtClient = new JWT(
            {
                email: key.client_email,
                key: key.private_key,
                scopes: scopes,
            }

        );
        jwtClient.authorize(function (err: any, tokens: any) {
            if (err) {
                logErrorBlock({ source: "getAccessTokenHIRS", type: "JWT_AUTHORIZE_FAIL", flow: ["GET_TOKEN", "JWT_AUTHORIZE", "FAIL"], error: err?.message || String(err) });
                reject(err);
                return;
            }
            resolve(tokens.access_token);
        });

    });
}