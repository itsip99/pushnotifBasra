"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTokenExpired = exports.readToken = exports.saveToken = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const TOKEN_FILE = path_1.default.resolve(__dirname, '../../../data/instagram_token.json');
function ensureDir() {
    const dir = path_1.default.dirname(TOKEN_FILE);
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
}
function saveToken(data) {
    ensureDir();
    const payload = Object.assign(Object.assign({}, data), { saved_at: new Date().toISOString() });
    fs_1.default.writeFileSync(TOKEN_FILE, JSON.stringify(payload, null, 2), 'utf-8');
}
exports.saveToken = saveToken;
function readToken() {
    if (!fs_1.default.existsSync(TOKEN_FILE))
        return null;
    try {
        return JSON.parse(fs_1.default.readFileSync(TOKEN_FILE, 'utf-8'));
    }
    catch (_a) {
        return null;
    }
}
exports.readToken = readToken;
function isTokenExpired() {
    const token = readToken();
    if (!token)
        return true;
    return new Date() >= new Date(token.expired_at);
}
exports.isTokenExpired = isTokenExpired;
