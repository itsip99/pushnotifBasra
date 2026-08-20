import express, { Request, Response } from 'express';
import { instagramCallback, exchangeLongLivedToken, getStoredToken, getInstagramMedia } from '../../controller/instagram/instagram';

export const callback = express.Router();

// Instagram redirect ke sini setelah user authorize
callback.get('/callback', async (req: Request, res: Response): Promise<void> => {
    await instagramCallback(req, res);
});

// Exchange short-lived token → long-lived token (60 hari), simpan ke file
callback.post('/long-lived-token', async (req: Request, res: Response): Promise<void> => {
    await exchangeLongLivedToken(req, res);
});

// Cek token yang tersimpan
callback.get('/token', async (req: Request, res: Response): Promise<void> => {
    await getStoredToken(req, res);
});

// Fetch semua media posts
callback.get('/media', async (req: Request, res: Response): Promise<void> => {
    await getInstagramMedia(req, res);
});
