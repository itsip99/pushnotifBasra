"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callback = void 0;
const express_1 = __importDefault(require("express"));
const instagram_1 = require("../../controller/instagram/instagram");
exports.callback = express_1.default.Router();
// Instagram redirect ke sini setelah user authorize
exports.callback.get('/callback', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, instagram_1.instagramCallback)(req, res);
}));
// Exchange short-lived token → long-lived token (60 hari), simpan ke file
exports.callback.post('/long-lived-token', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, instagram_1.exchangeLongLivedToken)(req, res);
}));
// Cek token yang tersimpan
exports.callback.get('/token', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, instagram_1.getStoredToken)(req, res);
}));
// Fetch semua media posts
exports.callback.get('/media', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, instagram_1.getInstagramMedia)(req, res);
}));
