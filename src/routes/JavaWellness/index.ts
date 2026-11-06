import express from 'express';
import { modify } from './modify';
import { fetch } from './meta';
export const routesJavaWellness = express.Router();

routesJavaWellness.use(modify);
routesJavaWellness.use(fetch);
