import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import TypeORMAnalyzer from './typeorm-analyzer';
import { Connection } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class TypeORMAnalyzerService implements OnModuleInit, OnModuleDestroy {
    private analyzer: TypeORMAnalyzer;
    private logInterval: NodeJS.Timeout;

    constructor(
        private schedulerRegistry: SchedulerRegistry,
        private connection: Connection,
    ) {
        this.analyzer = new TypeORMAnalyzer();
    }

    async onModuleInit() {
        await this.analyzer.setupLogging(this.connection);
        
        this.logInterval = setInterval(() => {
            this.logAnalysis();
        }, 60 * 60 * 1000); // 1 hour

        this.schedulerRegistry.addInterval('typeorm-analysis', this.logInterval);
    }

    onModuleDestroy() {
        if (this.logInterval) {
            clearInterval(this.logInterval);
        }
    }

    public logAnalysis() {
        const analysis = this.analyzer.getAnalysis();
        const timestamp = new Date().toISOString();
        const logDir = path.join(process.cwd(), 'logs');
        
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir);
        }

        fs.appendFileSync(
            path.join(logDir, 'typeorm-analysis.log'),
            `\n--- Analysis at ${timestamp} ---\n${analysis}\n`
        );

        if (process.env.NODE_ENV === 'development') {
            console.log(`\n=== TypeORM Analysis at ${timestamp} ===\n${analysis}`);
        }
    }

    // Method to get analysis on demand
    getAnalysis(): string {
        return this.analyzer.getAnalysis();
    }
}