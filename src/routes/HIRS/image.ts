import express, { Request, Response } from 'express';


export const fetch = express.Router();


fetch.get('/iconHIRS', (req, res) => {
    // Assuming you have an image stored locally with the name "image.jpg"
    // You can send the image as a response using res.sendFile()
    res.sendFile(__dirname + '/1.png');
  });