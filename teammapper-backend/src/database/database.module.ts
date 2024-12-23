import { Module } from '@nestjs/common';
import { TypeORMAnalyzerService } from './typeorm-analyzer.service';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [ScheduleModule.forRoot(), TypeOrmModule],
  providers: [TypeORMAnalyzerService],
  exports: [TypeORMAnalyzerService],
})
export class DatabaseModule {}