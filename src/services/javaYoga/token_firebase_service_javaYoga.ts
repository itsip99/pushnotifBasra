
const { JWT } = require('google-auth-library');
import _ from "lodash"


const scopes = 'https://www.googleapis.com/auth/firebase.messaging'


export function getAccessTokenJavaYoga():  Promise<string>  {
    return new Promise(async function (resolve, reject) {
        const key = require("../javaYoga/javayoga-f1963-firebase-adminsdk-lyt2d-9ebeeeacb7.json");
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