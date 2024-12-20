// src/app.ts
import { buildFramework } from './infrastructure/framework';

async function bootstrap() {
  try {
    const { appServer } = await buildFramework();

    await appServer.listen({ 
      port: Number(process.env.APP_PORT) || 3000, 
      host: '0.0.0.0' 
    });

    appServer.log.info(`App server listening on port ${process.env.APP_PORT || 3000}`);
    appServer.log.info(`Metrics available on port ${process.env.OPS_PORT || 9464}/metrics`);
  } catch (err) {
    console.error('Error starting servers:', err);
    process.exit(1);
  }
 }
 
 bootstrap();