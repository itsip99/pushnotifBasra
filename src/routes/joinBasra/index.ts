import express from 'express';
import { modify } from './modify';

export const routesBasraKarir= express.Router();


routesBasraKarir.use(modify);

