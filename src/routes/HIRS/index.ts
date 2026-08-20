import express from 'express';
import { modify } from './modify';
import { fetch } from './image';

export const routesHIRS = express.Router();


routesHIRS.use(modify);

routesHIRS.use(fetch);


