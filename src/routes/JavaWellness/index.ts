import express from 'express';
import { modify } from './modify';

export const routesJavaWellness = express.Router();

routesJavaWellness.use(modify);
