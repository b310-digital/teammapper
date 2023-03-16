import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MapsService } from './maps.service';
import configService from '../../config.service';

/*
 * This service takes care of _very_ simple job scheduling. 
 * Note: Jobs might execute multiple times - depending on your deployment and the container count.
 * Do not schedule jobs, that can't be executed multiple times, e.g. sending mails. Use a different solution for these kind of tasks.
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private mapsService: MapsService,
  ) {}

  // every day midnight
  @Cron('0 0 * * *')
  async deleteOldMapsInInterval() {
    this.logger.log('--- Deleting old maps ... ---');
    const affected: Number = await this.mapsService.deleteOutdatedMaps(configService.deleteAfterDays());
    this.logger.log('Deleted rows: ' + affected);
    this.logger.log('--- Finished deleting maps ---');
  }
}