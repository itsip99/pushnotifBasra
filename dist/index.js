"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const morgan_1 = __importDefault(require("morgan"));
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const FixupMoto_1 = require("./routes/FixupMoto");
const JavaYoga_1 = require("./routes/JavaYoga");
const HIRS_1 = require("./routes/HIRS");
const BasraMobile_1 = require("./routes/BasraMobile");
const joinBasra_1 = require("./routes/joinBasra");
const instagram_1 = require("./routes/instagram");
const LSA_1 = require("./routes/LSA");
const tokenRefresh_1 = require("./services/instagram/tokenRefresh");
const logger_1 = require("./logger/logger");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 8000;
// ?? sedikit lebih aman & ringan
app.disable('x-powered-by');
// ? cukup 2 parser ini saja
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// ??
app.use((0, cookie_parser_1.default)());
// ?? CORS — simple & fast
app.use((0, cors_1.default)());
// ?? logging (aktifkan di production saja kalau mau)
morgan_1.default.token('date', () => (0, moment_timezone_1.default)().tz("Asia/Jakarta").format());
morgan_1.default.format('myformat', '[:date] ":method :url" :status :res[content-length] - :response-time ms');
app.use((0, morgan_1.default)('myformat', { stream: { write: msg => logger_1.logger.info(msg.trim()) } }));
// health check
app.get('/', (_req, res) => res.json('ok'));
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        timestamp: (0, moment_timezone_1.default)().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss'),
    });
});
// Routes
app.use('/basramobile', BasraMobile_1.routesBasraMobile);
app.use('/javayoga', JavaYoga_1.routesJavaYoga);
app.use('/fixupmoto', FixupMoto_1.routesFixupMoto);
app.use('/hris', HIRS_1.routesHIRS);
app.use('/joinBasra', joinBasra_1.routesBasraKarir);
app.use('/instagram', instagram_1.routesInstagram);
app.use('/lsa', LSA_1.routesLSA);
// Error handler
app.use((error, req, res, _next) => {
    logger_1.logger.error(`[EXPRESS] unhandled_error | ${req.method} ${req.url} | ${error.message}`);
    res.status(error.status || 400).json({
        meta: {
            status: error.status || 400,
            messages: error.message,
        },
    });
});
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    (0, tokenRefresh_1.startInstagramTokenCron)();
});
