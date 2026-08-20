import express from 'express';
import { modify } from './modify';

export const routesHIRS = express.Router();


routesHIRS.use(modify);

