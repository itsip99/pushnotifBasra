import { Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import { logger } from '../../logger/logger';
import { saveToken, readToken, isTokenExpired } from '../../services/instagram/tokenStore';

// Exchange short-lived token (1 jam) → long-lived token (60 hari), simpan ke file
export const exchangeLongLivedToken = async (req: Request, res: Response): Promise<void> => {
    const { access_token, client_secret } = req.body;
    const secret = client_secret || process.env.INSTAGRAM_CLIENT_SECRET;

    if (!access_token) {
        res.status(400).json({
            meta: { status: 400, messages: 'access_token wajib diisi' },
        });
        return;
    }

    if (!secret) {
        res.status(400).json({
            meta: { status: 400, messages: 'client_secret wajib diisi (atau set INSTAGRAM_CLIENT_SECRET di .env)' },
        });
        return;
    }

    try {
        const response = await axios.get('https://graph.instagram.com/access_token', {
            params: {
                grant_type: 'ig_exchange_token',
                client_secret: secret,
                access_token,
            },
        });

        const { access_token: longLivedToken, token_type, expires_in } = response.data;
        const expiredAt = new Date(Date.now() + expires_in * 1000);

        saveToken({ access_token: longLivedToken, token_type, expires_in, expired_at: expiredAt.toISOString() });

        logger.info(`Instagram long-lived token disimpan | expired: ${expiredAt.toISOString()}`);

        res.status(200).json({
            meta: { status: 200, messages: 'Token berhasil diperbarui (60 hari) dan disimpan' },
            data: { access_token: longLivedToken, token_type, expires_in, expired_at: expiredAt.toISOString() },
        });
    } catch (error: any) {
        const errMsg = error.response?.data?.error?.message || error.message;
        logger.error(`Instagram exchange long-lived token gagal: ${errMsg}`);
        res.status(error.response?.status || 500).json({
            meta: { status: error.response?.status || 500, messages: `Gagal exchange token: ${errMsg}` },
        });
    }
};

// Ambil token yang tersimpan (untuk dipakai service lain)
export const getStoredToken = async (req: Request, res: Response): Promise<void> => {
    const token = readToken();

    if (!token) {
        res.status(404).json({ meta: { status: 404, messages: 'Token belum ada, panggil /long-lived-token dulu' } });
        return;
    }

    res.status(200).json({
        meta: { status: 200, messages: isTokenExpired() ? 'Token sudah expired!' : 'Token aktif' },
        data: { ...token, is_expired: isTokenExpired() },
    });
};

// Fetch media posts dari Instagram menggunakan token tersimpan
export const getInstagramMedia = async (req: Request, res: Response): Promise<void> => {
    const token = readToken();

    if (!token) {
        res.status(404).json({ meta: { status: 404, messages: 'Token belum ada, panggil /long-lived-token dulu' } });
        return;
    }

    if (isTokenExpired()) {
        res.status(401).json({ meta: { status: 401, messages: 'Token sudah expired, perbarui token dulu' } });
        return;
    }

    try {
        const response = await axios.get('https://graph.instagram.com/v25.0/me/media', {
            params: {
                fields: 'id,media_type,media_url,thumbnail_url,permalink,timestamp,caption',
                access_token: token.access_token,
            },
        });

        const media = response.data.data as any[];
        logger.info(`Instagram media fetched | total: ${media.length}`);

        res.status(200).json({
            meta: { status: 200, messages: 'Berhasil fetch media Instagram' },
            data: media,
            paging: response.data.paging ?? null,
        });
    } catch (error: any) {
        const errMsg = error.response?.data?.error?.message || error.message;
        logger.error(`Instagram fetch media gagal: ${errMsg}`);
        res.status(error.response?.status || 500).json({
            meta: { status: error.response?.status || 500, messages: `Gagal fetch media: ${errMsg}` },
        });
    }
};

export const instagramCallback = async (req: Request, res: Response): Promise<void> => {
    const { code, error, error_reason, error_description } = req.query;

    if (error) {
        logger.error(`Instagram OAuth error: ${error_reason} - ${error_description}`);
        res.status(400).json({
            meta: {
                status: 400,
                messages: `Instagram OAuth denied: ${error_description}`,
            },
        });
        return;
    }

    if (!code) {
        res.status(400).json({
            meta: {
                status: 400,
                messages: 'Authorization code tidak ditemukan',
            },
        });
        return;
    }

    try {
        const form = new FormData();
        form.append('client_id', process.env.INSTAGRAM_CLIENT_ID || '');
        form.append('client_secret', process.env.INSTAGRAM_CLIENT_SECRET || '');
        form.append('grant_type', 'authorization_code');
        form.append('redirect_uri', process.env.INSTAGRAM_REDIRECT_URI || '');
        form.append('code', code as string);

        const response = await axios.post('https://api.instagram.com/oauth/access_token', form, {
            headers: form.getHeaders(),
        });

        logger.info(`Instagram OAuth success | user_id: ${response.data.user_id}`);

        res.status(200).json({
            meta: {
                status: 200,
                messages: 'Instagram OAuth berhasil',
            },
            data: {
                access_token: response.data.access_token,
                user_id: response.data.user_id,
            },
        });
    } catch (error: any) {
        const errMsg = error.response?.data?.error_message || error.message;
        logger.error(`Instagram OAuth token exchange failed: ${errMsg}`);
        res.status(error.response?.status || 500).json({
            meta: {
                status: error.response?.status || 500,
                messages: `Gagal tukar token: ${errMsg}`,
            },
        });
    }
};
