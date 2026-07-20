import app from './app';
import { config } from './config';
import { prisma } from './services/db.service';

const server = app.listen(config.PORT, async () => {
  console.log(`🚀 Server starting in ${config.NODE_ENV} mode...`);
  
  try {
    // Verify database connection at startup
    await prisma.$connect();
    console.log('✅ Database connection verified successfully.');
    console.log(`📡 Inbound Voice Webhooks listening at: http://localhost:${config.PORT}/api/v1/voice/webhook`);
  } catch (error) {
    console.error('❌ Failed to connect to the database during startup:', error);
    process.exit(1);
  }
});

// Handle graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n⚠️ Received ${signal}. Initiating graceful shutdown...`);
  
  server.close(async () => {
    console.log('🛑 Express HTTP server closed.');
    
    try {
      await prisma.$disconnect();
      console.log('🔌 Database connection closed.');
      process.exit(0);
    } catch (dbError) {
      console.error('Error during database disconnection:', dbError);
      process.exit(1);
    }
  });

  // Force exit after 10s if shutdown hangs
  setTimeout(() => {
    console.error('Forcefully shutting down...');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
