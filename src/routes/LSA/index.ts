import express from 'express';
import { modify } from './modify';


export const routesLSA = express.Router();


routesLSA.use(modify);
