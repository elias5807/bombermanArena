import { describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";

const PORT = 3000

describe("WebSocket server", () => {
    it("starts successfully", async () => {
        const wss = new WebSocketServer({ port: PORT });

        await new Promise<void>((resolve, reject) => {
            wss.once("listening", () => {
                resolve();
            });

            wss.once("error", reject);
        });

        expect(wss.address()).toBeTruthy();

        await new Promise<void>((resolve) => {
            wss.close(() => resolve());
        });
    });
});