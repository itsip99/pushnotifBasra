import cron from 'node-cron';
import axios from 'axios';
import { readToken, saveToken } from './tokenStore';
import { logger } from '../../logger/logger';

const REFRESH_BEFORE_DAYS = 10; // refresh kalau sisa < 10 hari

async function refreshInstagramToken(): Promise<void> {
    const token = readToken();

    if (!token) {
        logger.warn('[INSTAGRAM CRON] Token belum ada, skip refresh');
        return;
    }

    const expiredAt = new Date(token.expired_at);
    const diffMs = expiredAt.getTime() - Date.now();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > REFRESH_BEFORE_DAYS) {
        logger.info(`[INSTAGRAM CRON] Token masih aman | sisa: ${diffDays} hari`);
        return;
    }

    logger.info(`[INSTAGRAM CRON] Token hampir expired (${diffDays} hari lagi), mulai refresh...`);

    try {
        const response = await axios.get('https://graph.instagram.com/refresh_access_token', {
            params: {
                grant_type: 'ig_refresh_token',
                access_token: token.access_token,
            },
        });

        const { access_token, token_type, expires_in } = response.data;
        const newExpiredAt = new Date(Date.now() + expires_in * 1000);

        saveToken({ access_token, token_type, expires_in, expired_at: newExpiredAt.toISOString() });

        logger.info(`[INSTAGRAM CRON] Token berhasil diperbarui | expired baru: ${newExpiredAt.toISOString()}`);
    } catch (error: any) {
        const errMsg = error.response?.data?.error?.message || error.message;
        logger.error(`[INSTAGRAM CRON] Gagal refresh token: ${errMsg}`);
    }
}

// Jalankan setiap hari pukul 01:00
export function startInstagramTokenCron(): void {
    cron.schedule('0 1 * * *', async () => {
        await refreshInstagramToken();
    }, { timezone: 'Asia/Jakarta' });

    logger.info('[INSTAGRAM CRON] Scheduler aktif — cek token setiap hari pukul 01:00 WIB');
}
