const { JWT } = require('google-auth-library');
import { logErrorBlock } from "../../logger/logger";

const scopes = 'https://www.googleapis.com/auth/firebase.messaging';

export function getAccessTokenJavaWellness(): Promise<string> {
    return new Promise(async function (resolve, reject) {
        let key: any;
        try {
            key = require("./javawellness-3c6ad-firebase-adminsdk-fbsvc-e32ce697c8.json");
        } catch (err: any) {
            logErrorBlock({ source: "getAccessTokenJavaWellness", type: "LOAD_JSON_FAIL", flow: ["GET_TOKEN", "LOAD_JSON", "FAIL"], error: err?.message || String(err) });
            reject(err);
            return;
        }

        const jwtClient = new JWT({
            email: key.client_email,
            key: key.private_key,
            scopes: scopes,
        });

        jwtClient.authorize(function (err: any, tokens: any) {
            if (err) {
                logErrorBlock({ source: "getAccessTokenJavaWellness", type: "JWT_AUTHORIZE_FAIL", flow: ["GET_TOKEN", "JWT_AUTHORIZE", "FAIL"], error: err?.message || String(err) });
                reject(err);
                return;
            }
            resolve(tokens.access_token);
        });
    });
}
