import { Test, TestingModule } from "@nestjs/testing";
import { MapsService } from "./maps.service";
import { getRepositoryToken } from "@nestjs/typeorm";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MmpMap } from "../entities/mmpMap.entity";
import { MmpNode } from "../entities/mmpNode.entity";
import { Repository } from "typeorm";
import { ConfigModule } from "@nestjs/config";
import AppModule from "../../app.module";
import {
    createTestConfiguration,
    destroyWorkerDatabase,
} from "../../../test/db";
import { mapMmpNodeToClient } from "../utils/clientServerMapping";
import { truncateDatabase } from "test/helper";

describe("MapsController", () => {
    let mapsService: MapsService;
    let nodesRepo: Repository<MmpNode>;
    let mapsRepo: Repository<MmpMap>;
    let moduleFixture: TestingModule;

    beforeAll(async () => {
        moduleFixture = await Test.createTestingModule({
            imports: [
                ConfigModule,
                TypeOrmModule.forRoot(
                    await createTestConfiguration(process.env.JEST_WORKER_ID),
                ),
                AppModule,
            ],
        }).compile();

        mapsRepo = moduleFixture.get<Repository<MmpMap>>(
            getRepositoryToken(MmpMap),
        );
        nodesRepo = moduleFixture.get<Repository<MmpNode>>(
            getRepositoryToken(MmpNode),
        );
        mapsService = new MapsService(nodesRepo, mapsRepo);
    });

    afterAll(async () => {
        // close connection:
        await destroyWorkerDatabase(
            mapsRepo.manager.connection,
            process.env.JEST_WORKER_ID,
        );
        await moduleFixture.close();
    });

    beforeEach(async () => {
        await truncateDatabase(mapsRepo.manager.connection);
    });

    const createNode = async (map: MmpMap, lastModified: Date) => {
        return nodesRepo.save({
            nodeMapId: map.id,
            coordinatesX: 3,
            coordinatesY: 1,
            lastModified: lastModified,
        });
    };

    describe("updateNode", () => {
        it("does update the lastModified value on update", async () => {
            const map: MmpMap = await mapsRepo.save({
                lastModified: new Date("2019-01-01"),
            });

            const oldDate = new Date("2019-01-01");
            const node: MmpNode = await createNode(map, oldDate);

            const clientNode = mapMmpNodeToClient(node);
            clientNode.name = "new";

            // we save the time before the update to be able to compare the lastModified date and make sure it's newer than this:
            const timeBeforeUpdate = new Date();
            await mapsService.updateNode(map.id, clientNode);
            const updatedNode = await nodesRepo.findOne({
                where: { id: node.id },
            });

            expect(updatedNode.lastModified).not.toEqual(oldDate);
            expect(updatedNode.lastModified.getTime()).toBeGreaterThan(
                timeBeforeUpdate.getTime(),
            );
        });
    });

    describe("exportMapToClient", () => {
        it("returns null when no map is available", async () => {
            expect(
                await mapsService.exportMapToClient(
                    "78a2ae85-1815-46da-a2bc-a41de6bdd5ab",
                ),
            ).toBeNull();
        });
    });

    describe("deleteOutdatedMaps", () => {
        it("does not delete a new map", async () => {
            const map: MmpMap = await mapsRepo.save({});

            await mapsService.deleteOutdatedMaps(30);
            const foundMap: MmpMap = await mapsService.findMap(map.id);
            expect(foundMap.id).toEqual(map.id);
        });

        it("does delete a map that contains only outdated nodes", async () => {
            const map: MmpMap = await mapsRepo.save({
                lastModified: new Date("2019-01-01"),
            });

            const node: MmpNode = await createNode(map, new Date("2019-01-01"));

            await mapsService.deleteOutdatedMaps(30);
            expect(await mapsService.findMap(map.id)).toEqual(null);
            expect(await nodesRepo.findOne({ where: { id: node.id } })).toEqual(
                null,
            );
        });

        it("does not delete a map that contains a recent node", async () => {
            // map itself is old, but node is not:
            const map: MmpMap = await mapsRepo.save({
                lastModified: new Date("2019-01-01"),
            });

            const node: MmpNode = await createNode(map, new Date());

            await mapsService.deleteOutdatedMaps(30);
            expect(await mapsService.findMap(map.id)).not.toBeNull();
            expect(
                await nodesRepo.findOne({ where: { id: node.id } }),
            ).not.toBeNull();
        });

        it("does not delete a map that contains outdated and recent nodes", async () => {
            // map itself is old, but node is not:
            const map: MmpMap = await mapsRepo.save({
                lastModified: new Date("2019-01-01"),
            });

            const outdatedNode: MmpNode = await createNode(
                map,
                new Date("2019-01-01"),
            );
            const recentNode: MmpNode = await createNode(map, new Date());

            await mapsService.deleteOutdatedMaps(30);
            expect(await mapsService.findMap(map.id)).not.toBeNull();
            expect(
                await nodesRepo.findOne({ where: { id: outdatedNode.id } }),
            ).not.toBeNull();
            expect(
                await nodesRepo.findOne({ where: { id: recentNode.id } }),
            ).not.toBeNull();
        });

        it("does delete outdated empty maps", async () => {
            const map: MmpMap = await mapsRepo.save({
                lastModified: new Date("2019-01-01"),
            });

            await mapsService.deleteOutdatedMaps(30);
            expect(await mapsService.findMap(map.id)).toBeNull();
        });
    });

    describe("getDeletedAt", () => {
        it("does not crash when map is null or undefined", async () => {
            expect(await mapsService.getDeletedAt(null, 5));
        });

        it("calculates the correct date based on the newest node", async () => {
            const map: MmpMap = await mapsRepo.save({
                lastModified: new Date("2018-02-02"),
            });

            await createNode(map, new Date("2022-01-01"));
            await createNode(map, new Date("2020-02-05"));

            expect(await mapsService.getDeletedAt(map, 5)).toEqual(
                new Date("2022-01-06"),
            );
        });

        it("calculates the date based on the map when no node is present", async () => {
            const map: MmpMap = await mapsRepo.save({
                lastModified: new Date("2018-02-02"),
            });

            expect(await mapsService.getDeletedAt(map, 5)).toEqual(
                new Date("2018-02-07"),
            );
        });
    });

    describe("removeNode", () => {
        it("remove all nodes connected together", async () => {
            const map: MmpMap = await mapsRepo.save({});

            const node: MmpNode = await nodesRepo.save({
                nodeMapId: map.id,
                coordinatesX: 3,
                coordinatesY: 1,
            });

            const nodeTwo: MmpNode = await nodesRepo.save({
                nodeMapId: map.id,
                nodeParent: node,
                coordinatesX: 3,
                coordinatesY: 1,
            });

            await mapsService.removeNode(mapMmpNodeToClient(node), map.id);
            expect(
                await nodesRepo.findOne({ where: { id: nodeTwo.id } }),
            ).toEqual(null);
        });
    });
});
