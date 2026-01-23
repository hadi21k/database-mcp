#!/usr/bin/env node

import { ConfigLoader } from './config/config-loader.js';
import { SqlServerMcpServer } from './server.js';

/**
 * Main entry point for SQL Server MCP Server
 */
async function main() {
  try {
    // Load configuration
    const config = ConfigLoader.load();
    ConfigLoader.validate(config);

    // Create and start server
    const server = new SqlServerMcpServer(config);

    // Handle shutdown signals
    const shutdown = async () => {
      await server.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Start server
    await server.start();
  } catch (error) {
    console.error('Failed to start SQL Server MCP Server:', error);
    process.exit(1);
  }
}

main();
