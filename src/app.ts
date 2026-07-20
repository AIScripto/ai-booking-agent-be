import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { apiRouter } from './routes';
import { errorMiddleware } from './middlewares/error.middleware';

const app = express();

// Standard middleware stack
app.use(helmet());
app.use(cors());
app.use(express.json());

// Request logging based on environment
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Register API Routes
app.use('/api/v1', apiRouter);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Wildcard fallback for 404 Not Found errors
app.use((req, res, next) => {
  const error: any = new Error(`Route not found: ${req.method} ${req.path}`);
  error.statusCode = 404;
  next(error);
});

// Global Error Handler
app.use(errorMiddleware);

export default app;
