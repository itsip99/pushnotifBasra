import express from 'express';
import { modify } from './modify';


export const routesBasraMobile = express.Router();


routesBasraMobile.use(modify);

