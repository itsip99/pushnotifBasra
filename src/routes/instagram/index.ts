import express from 'express';
import { callback } from './callback';

export const routesInstagram = express.Router();

routesInstagram.use(callback);
