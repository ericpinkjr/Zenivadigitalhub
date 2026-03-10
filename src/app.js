import express from 'express';
import cors from 'cors';
import { FRONTEND_URL } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// CORS — allow frontend origins
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:4173',
    FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
}));

// Parse JSON bodies
app.use(express.json());

// Mount all routes under /api
app.use('/api', routes);

// Central error handler (must be last)
app.use(errorHandler);

export default app;
