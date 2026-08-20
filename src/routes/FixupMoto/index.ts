import express from 'express';
import { modify } from './modify';


export const routesFixupMoto = express.Router();


routesFixupMoto.use(modify);

