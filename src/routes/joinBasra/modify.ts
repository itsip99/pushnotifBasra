import express, { Request, Response } from 'express';
import { sendNotificationbyDeviceToken, sendNotificationbyTopic } from '../../controller/SPKbasra/spkbasra';
import axios from 'axios';
var NodeRSA = require('node-rsa');


export const modify = express.Router();

function getFirstTenDigits(input: string): string {
    return input.substring(0, 10);
}

modify.post('/VerifyEmail', async (req: Request, res: Response): Promise<void> => {

    let decryptedData = '';

    try {
        const { ecrypt } = req.body; // Menerima parameter dari body permintaan

        const privateKey = new NodeRSA('-----BEGIN RSA PRIVATE KEY-----\n' +
        'MIIEnwIBAAKCAQCelN9jYi7D8Rq/ARGcyDPcgQvqKLta9I0nI5yxhkaDDd77Mj+u\n' +
        'CQ8KVHnaKVc8Ifct4yM4s1dMxLt+HBEeBuMsuTgmFavuG3y9klg339oWP+nOzICq\n' +
        'Gb3zpBhOVeTpFhor8q5UNm9TEnk2JdvauypeCX8lYinpUic63fZYNVHh8GlyptLQ\n' +
        'uyoH/FYzXRQlZup5c/eQUzSTCrbm5wsvMU/375h1DEBLefRFv1uRzX2EoRNC86AC\n' +
        '8MiD9OTN2po2qpsqijxBlLlAQxpMHKFua+H8RPOLJl/qDHH1Q1enwstQL3tbv6Rd\n' +
        'wqZvlxtu6DglWIhluJi+NcMo3c8Ep0VPxghVAgMBAAECggEAUcC58Uhah5UyjqmE\n' +
        'ZOkpI1I7zDm3bMqKQlUvoK1yiHmMLL/Y6GWvJUorj3akjFGOVk+0hrSeGuuJJRhf\n' +
        'ErXGQ/YwpiGiAxyUkD5z0EpM6g+E/6GZ6xdeP86m4SuS2T8VuvZfPPbbKV5qsqmN\n' +
        '0BORYe1PaPxUUv6RTt3C8/J5BhrUv1TijYJ+/D3D/XWaNnggjO5dGJ6Q4+govSmK\n' +
        'qwNZXGsHG5HOcbXZ+x5QZpiWdpOVnGpzoyn8cN2zEo3r48RJTRLysXAW5NVaVJmW\n' +
        'T5bWoDCWfQv+gFqjmh2voGMjkdXo0pvLZVDA0XE1EVB/qCn8chTyjgHsEhcpA+8+\n' +
        'nl5reQKBgND6nLmPN9ceFkU6zZFN73GOmtf9mZoPTo9JsnWJpfMeiVPAzWyEJX3N\n' +
        'RLIlrZWaBRmFSffwaSDS8LgQG9Ppcm4O6ezAAelRmGWlLzd2nnYTMsVvIuH2roCC\n' +
        'rHuaUimCjvRCNnogvjDjPCiLfYg/E0lt19GNQUwcTumDoodxyU87AoGAwkNSHMDo\n' +
        'DNXEqifQgo2eH3wA24IWl+9OhjoYQzvfvQzE8LcG4LlXIdt6tf5TLgLPaFI0KmLl\n' +
        'QBsj4LnMLsbvyqfoJK1sf/jB9WQkuEqJIpJJ8USfja2WnsaUTOuj6gkzwtGMdBON\n' +
        '7AW5oN6tQI54QBq0/iX2619lm6oVnof6ra8CgYAkqSJfZyGLqmqLwJIZgIuV50eA\n' +
        'xqtwnGjSuEIHXptvOBctSzB+bfxJwn3fpr559SgZ3wkn5tP6fybdk23eUiDR7+nX\n' +
        'r6NmM/tBMaZD25pW6m1It4NuEqFwR/xMPrlVMOM1NHxsFlxnJSYDktz1zuLqScvH\n' +
        'pjkjSgAJ9R7JFgwTywKBgG7M/xSvYquPcfCrbN5J8Bp9G/AXrtNSBzPABv6yM9cc\n' +
        'ZWf2vNGIZQ5GpSMQwFjJ+YrC+EYEykVaNYiD8NXtWe/4/QuObwg+1kIksFz9BmLV\n' +
        'lZ8rSOYCUJqXIRcOgBuIzCEebEH4tUYdrdb3q1Ha8PN/SCR9euydKNM0m8gkPvK5\n' +
        'AoGAHEQ0SPWbbYxt5TelmSZ5MeB36pd/cspPxdZrgJJ4EYA+lapCnXOM6PurLKfh\n' +
        'jEU/XVB7IAdZ7kruEPlw00f6F0U5MmSnA4AoLE6hIOg4pp2IejCsH2LPqaYoDT1x\n' +
        'DQv8bZwGnm3tyY5EDqvbqnV4MAOTatf2SSmzzz037IGDOAg=\n' +
        '-----END RSA PRIVATE KEY-----');

        decryptedData = privateKey.decrypt(ecrypt, 'utf8');

        const firstTenDigits = getFirstTenDigits(decryptedData);

        console.log(firstTenDigits);

        const applicant = {
            firstTenDigits: firstTenDigits,
        };

        const response = await axios.post('https://wsip.yamaha-jatim.co.id:2447/Applicant/Modify/KirimEmailVerifikasi', JSON.stringify(applicant), {
            headers: {
                'Content-Type': 'application/json',
            },
        });

        console.log(response.data);

         res.status(response.status).json({
            meta: {
                code: 100,
                status: 'Success',
            },
        });
    } catch (error: any) {
        // console.error('Error:', error);
         res.status(500).json({ error: `Request failed: ${error.message}` });
    }
        

   
    });


modify.post('/VerifyPassword', async (req: Request, res: Response): Promise<void> => {

    let decryptedData = '';

    try {
        const { ecrypt } = req.body; // Menerima parameter dari body permintaan

        const privateKey = new NodeRSA('-----BEGIN RSA PRIVATE KEY-----\n' +
        'MIIEnwIBAAKCAQCelN9jYi7D8Rq/ARGcyDPcgQvqKLta9I0nI5yxhkaDDd77Mj+u\n' +
        'CQ8KVHnaKVc8Ifct4yM4s1dMxLt+HBEeBuMsuTgmFavuG3y9klg339oWP+nOzICq\n' +
        'Gb3zpBhOVeTpFhor8q5UNm9TEnk2JdvauypeCX8lYinpUic63fZYNVHh8GlyptLQ\n' +
        'uyoH/FYzXRQlZup5c/eQUzSTCrbm5wsvMU/375h1DEBLefRFv1uRzX2EoRNC86AC\n' +
        '8MiD9OTN2po2qpsqijxBlLlAQxpMHKFua+H8RPOLJl/qDHH1Q1enwstQL3tbv6Rd\n' +
        'wqZvlxtu6DglWIhluJi+NcMo3c8Ep0VPxghVAgMBAAECggEAUcC58Uhah5UyjqmE\n' +
        'ZOkpI1I7zDm3bMqKQlUvoK1yiHmMLL/Y6GWvJUorj3akjFGOVk+0hrSeGuuJJRhf\n' +
        'ErXGQ/YwpiGiAxyUkD5z0EpM6g+E/6GZ6xdeP86m4SuS2T8VuvZfPPbbKV5qsqmN\n' +
        '0BORYe1PaPxUUv6RTt3C8/J5BhrUv1TijYJ+/D3D/XWaNnggjO5dGJ6Q4+govSmK\n' +
        'qwNZXGsHG5HOcbXZ+x5QZpiWdpOVnGpzoyn8cN2zEo3r48RJTRLysXAW5NVaVJmW\n' +
        'T5bWoDCWfQv+gFqjmh2voGMjkdXo0pvLZVDA0XE1EVB/qCn8chTyjgHsEhcpA+8+\n' +
        'nl5reQKBgND6nLmPN9ceFkU6zZFN73GOmtf9mZoPTo9JsnWJpfMeiVPAzWyEJX3N\n' +
        'RLIlrZWaBRmFSffwaSDS8LgQG9Ppcm4O6ezAAelRmGWlLzd2nnYTMsVvIuH2roCC\n' +
        'rHuaUimCjvRCNnogvjDjPCiLfYg/E0lt19GNQUwcTumDoodxyU87AoGAwkNSHMDo\n' +
        'DNXEqifQgo2eH3wA24IWl+9OhjoYQzvfvQzE8LcG4LlXIdt6tf5TLgLPaFI0KmLl\n' +
        'QBsj4LnMLsbvyqfoJK1sf/jB9WQkuEqJIpJJ8USfja2WnsaUTOuj6gkzwtGMdBON\n' +
        '7AW5oN6tQI54QBq0/iX2619lm6oVnof6ra8CgYAkqSJfZyGLqmqLwJIZgIuV50eA\n' +
        'xqtwnGjSuEIHXptvOBctSzB+bfxJwn3fpr559SgZ3wkn5tP6fybdk23eUiDR7+nX\n' +
        'r6NmM/tBMaZD25pW6m1It4NuEqFwR/xMPrlVMOM1NHxsFlxnJSYDktz1zuLqScvH\n' +
        'pjkjSgAJ9R7JFgwTywKBgG7M/xSvYquPcfCrbN5J8Bp9G/AXrtNSBzPABv6yM9cc\n' +
        'ZWf2vNGIZQ5GpSMQwFjJ+YrC+EYEykVaNYiD8NXtWe/4/QuObwg+1kIksFz9BmLV\n' +
        'lZ8rSOYCUJqXIRcOgBuIzCEebEH4tUYdrdb3q1Ha8PN/SCR9euydKNM0m8gkPvK5\n' +
        'AoGAHEQ0SPWbbYxt5TelmSZ5MeB36pd/cspPxdZrgJJ4EYA+lapCnXOM6PurLKfh\n' +
        'jEU/XVB7IAdZ7kruEPlw00f6F0U5MmSnA4AoLE6hIOg4pp2IejCsH2LPqaYoDT1x\n' +
        'DQv8bZwGnm3tyY5EDqvbqnV4MAOTatf2SSmzzz037IGDOAg=\n' +
        '-----END RSA PRIVATE KEY-----');

        decryptedData = privateKey.decrypt(ecrypt, 'utf8');

        const firstTenDigits = getFirstTenDigits(decryptedData);

        console.log(firstTenDigits);

        const applicant = {
            firstTenDigits: firstTenDigits,
        };

        const response = await axios.post('https://wsip.yamaha-jatim.co.id:2447/Applicant/Modify/KirimEmailResetPassword', JSON.stringify(applicant), {
            headers: {
                'Content-Type': 'application/json',
            },
        });

        console.log(response.data);

         res.status(response.status).json({
            meta: {
                code: 100,
                status: 'Success',
            },
        });
    } catch (error: any) {
        // console.error('Error:', error);
         res.status(500).json({ error: `Request failed: ${error.message}` });
    }
        

   
    });
    











