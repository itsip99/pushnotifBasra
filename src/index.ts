import express, { Application } from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import moment from 'moment-timezone';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import { routesFixupMoto } from './routes/FixupMoto';
import { routesJavaYoga } from './routes/JavaYoga';
import { routesHIRS } from './routes/HIRS';
import { routesBasraMobile } from './routes/BasraMobile';
import { routesBasraKarir } from './routes/joinBasra';
import { routesInstagram } from './routes/instagram';
import { routesLSA } from './routes/LSA';
import { routesJavaWellness } from './routes/JavaWellness';
import { startInstagramTokenCron } from './services/instagram/tokenRefresh';

import { logger } from './logger/logger';

dotenv.config();

const app: Application = express();
const port = process.env.PORT || 8000;

// ?? sedikit lebih aman & ringan
app.disable('x-powered-by');

// ? cukup 2 parser ini saja
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ??
app.use(cookieParser());

// ?? CORS — simple & fast
app.use(cors());

// ?? logging (aktifkan di production saja kalau mau)
morgan.token('date', () => moment().tz("Asia/Jakarta").format());
morgan.format(
  'myformat',
  '[:date] ":method :url" :status :res[content-length] - :response-time ms'
);
app.use(morgan('myformat', { stream: { write: msg => logger.info(msg.trim()) } }));

// health check
app.get('/', (_req, res) => res.json('ok'));
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: moment().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss'),
  });
});

// Routes
app.use('/basramobile', routesBasraMobile);
app.use('/javayoga', routesJavaYoga);
app.use('/fixupmoto', routesFixupMoto);
app.use('/HRIS', routesHIRS);
app.use('/joinBasra', routesBasraKarir);
app.use('/instagram', routesInstagram);
app.use('/LSA', routesLSA);
app.use('/WELLNESS', routesJavaWellness);

// Error handler
app.use((error: any, req: any, res: any, _next: any) => {
  logger.error(`[EXPRESS] unhandled_error | ${req.method} ${req.url} | ${error.message}`);
  res.status(error.status || 400).json({
    meta: {
      status: error.status || 400,
      messages: error.message,
    },
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  startInstagramTokenCron();
});
