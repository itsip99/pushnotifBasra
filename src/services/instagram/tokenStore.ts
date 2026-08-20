import fs from 'fs';
import path from 'path';

const TOKEN_FILE = path.resolve(__dirname, '../../../data/instagram_token.json');

interface TokenData {
    access_token: string;
    token_type: string;
    expires_in: number;
    expired_at: string;
    saved_at: string;
}

function ensureDir() {
    const dir = path.dirname(TOKEN_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function saveToken(data: Omit<TokenData, 'saved_at'>): void {
    ensureDir();
    const payload: TokenData = { ...data, saved_at: new Date().toISOString() };
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(payload, null, 2), 'utf-8');
}

export function readToken(): TokenData | null {
    if (!fs.existsSync(TOKEN_FILE)) return null;
    try {
        return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8')) as TokenData;
    } catch {
        return null;
    }
}

export function isTokenExpired(): boolean {
    const token = readToken();
    if (!token) return true;
    return new Date() >= new Date(token.expired_at);
}
