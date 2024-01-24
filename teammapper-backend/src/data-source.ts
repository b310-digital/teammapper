import { DataSource } from "typeorm";
import ConfigService from "./config.service";

const AppDataSource = new DataSource(ConfigService.getTypeOrmConfig());

export default AppDataSource;
