// src/app.ts
import { buildFramework } from './infrastructure/framework';

async function bootstrap() {
  try {
    const app = await buildFramework();

    await app.listen({ port: 3000, host: '0.0.0.0' });
    
    app.log.info('Server is running on port 3000');
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  bootstrap();
}