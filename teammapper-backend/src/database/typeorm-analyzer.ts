import { Injectable } from '@nestjs/common';
import { Connection } from 'typeorm';
import { Pool } from 'pg';
import { performance } from 'perf_hooks';

@Injectable()
export class TypeORMAnalyzer {
    private queryLog: Array<{
        query: string;
        parameters: any[];
        timestamp: number;
        duration: number;
        stack: string;
    }> = [];

    private connectionStats = {
        currentConnections: 0,
        maxConnections: 0,
        totalQueries: 0,
        totalSaveCalls: 0,
        totalTransactions: 0
    };

    async setupLogging(connection: Connection) {
        // Access PostgreSQL pool
        const pool = (connection.driver as any).postgres;
        
        if (pool instanceof Pool) {
            pool.on('connect', () => {
                this.connectionStats.currentConnections++;
                this.connectionStats.maxConnections = Math.max(
                    this.connectionStats.maxConnections,
                    this.connectionStats.currentConnections
                );
            });

            pool.on('remove', () => {
                this.connectionStats.currentConnections--;
            });
        }

        // Setup query logging
        connection.createQueryRunner().connection.logger = {
            logQuery: (query: string, parameters?: any[]) => {
                const stack = new Error().stack;
                const timestamp = Date.now();
                
                this.queryLog.push({
                    query,
                    parameters: parameters || [],
                    timestamp,
                    duration: performance.now(),
                    stack: stack || ''
                });

                this.connectionStats.totalQueries++;
                
                if (query.toLowerCase().includes('insert') || 
                    query.toLowerCase().includes('update')) {
                    this.connectionStats.totalSaveCalls++;
                }
            },
            logQueryError: () => {},
            logQuerySlow: () => {},
            logSchemaBuild: () => {},
            logMigration: () => {},
            log: () => {}
        };
    }

    getAnalysis(): string {
        let analysis = `Database Usage Analysis:
Connection Stats:
- Current Active Connections: ${this.connectionStats.currentConnections}
- Max Connections Reached: ${this.connectionStats.maxConnections}
- Total Queries Executed: ${this.connectionStats.totalQueries}
- Total Save Operations: ${this.connectionStats.totalSaveCalls}

Query Patterns:
`;

        // Analyze query patterns
        const queryPatterns = new Map<string, number>();
        this.queryLog.forEach(log => {            
            queryPatterns.set(log.query, (queryPatterns.get(log.query) || 0) + 1);
        });

        // Sort patterns by frequency
        const sortedPatterns = Array.from(queryPatterns.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        analysis += '\nTop 5 Query Patterns:\n';
        sortedPatterns.forEach(([pattern, count]) => {
            analysis += `- Count: ${count}\n  Pattern: ${pattern}\n`;
        });

        // Analyze potential N+1 queries
        const potentialNPlus1 = this.detectNPlus1Queries();
        if (potentialNPlus1.length > 0) {
            analysis += '\nPotential N+1 Query Patterns Detected:\n';
            potentialNPlus1.forEach(pattern => {
                analysis += `- ${pattern}\n`;
            });
        }

        return analysis;
    }

    private detectNPlus1Queries(): string[] {
        const patterns: string[] = [];
        const timeWindow = 100; // ms
        
        for (let i = 0; i < this.queryLog.length - 1; i++) {
            const currentQuery = this.queryLog[i];
            const nextQuery = this.queryLog[i + 1];
            
            if (nextQuery.timestamp - currentQuery.timestamp < timeWindow &&
                currentQuery.query.toLowerCase().includes('select') &&
                nextQuery.query.toLowerCase().includes('select')) {
                    patterns.push(`Possible N+1 at: ${currentQuery.stack}`);
            }
        }
        
        return [...new Set(patterns)];
    }
}

export default TypeORMAnalyzer;