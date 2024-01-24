import { Test } from "@nestjs/testing";
import { EditGuard } from "./edit.guard";
import { MapsService } from "../services/maps.service";
import { MmpMap } from "../entities/mmpMap.entity";
import { createMock } from "@golevelup/ts-jest";
import { ExecutionContext } from "@nestjs/common";

describe("EditGuard", () => {
    let guard: EditGuard;
    let mapsService: MapsService;

    beforeEach(() => {
        guard = new EditGuard(mapsService);
    });

    describe("canActivate", () => {
        describe("with modificationSecret", () => {
            const map: MmpMap = new MmpMap();
            map.id = "123";
            map.modificationSecret = "abc";

            beforeAll(async () => {
                mapsService = createMock<MapsService>({
                    findMap: (_uuid: string) =>
                        new Promise((resolve, _reject) => {
                            resolve(map);
                        }),
                });
                await Test.createTestingModule({
                    providers: [
                        { provide: MapsService, useValue: mapsService },
                    ],
                }).compile();
            });

            it("should return true when user provides correct credentials", async () => {
                const mockContext = createMock<ExecutionContext>({
                    switchToWs: () => ({
                        getData: () => ({
                            modificationSecret: "abc",
                            mapId: "123",
                        }),
                    }),
                });
                const canActivate = await guard.canActivate(mockContext);

                expect(canActivate).toBe(true);
            });

            it("should return false when user is not provided correct credentials", async () => {
                const mockContext = createMock<ExecutionContext>({
                    switchToWs: () => ({
                        getData: () => ({
                            modificationSecret: "wrong",
                            mapId: "123",
                        }),
                    }),
                });
                const canActivate = await guard.canActivate(mockContext);

                expect(canActivate).toBe(false);
            });
        });

        describe("without modificationSecret", () => {
            const map: MmpMap = new MmpMap();
            map.id = "123";

            beforeAll(async () => {
                mapsService = createMock<MapsService>({
                    findMap: (_uuid: string) =>
                        new Promise((resolve, _reject) => {
                            resolve(map);
                        }),
                });
                await Test.createTestingModule({
                    providers: [
                        { provide: MapsService, useValue: mapsService },
                    ],
                }).compile();
            });

            it("should return true when map has no modification secret", async () => {
                const mockContext = createMock<ExecutionContext>({
                    switchToWs: () => ({
                        getData: () => ({ mapId: "123" }),
                    }),
                });
                const canActivate = await guard.canActivate(mockContext);

                expect(canActivate).toBe(true);
            });
        });
    });
});
