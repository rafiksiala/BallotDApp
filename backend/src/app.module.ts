import { Module } from '@nestjs/common';
import { ConfigModule } from "@nestjs/config";
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { IndexerModule } from "./indexer/indexer.module";
import { BallotModule } from "./ballot/ballot.module";
import { StatsModule } from "./stats/stats.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    IndexerModule,
    BallotModule,
    StatsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
