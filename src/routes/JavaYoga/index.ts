import express from 'express';
import { modify } from './modify';


export const routesJavaYoga = express.Router();


routesJavaYoga.use(modify);

