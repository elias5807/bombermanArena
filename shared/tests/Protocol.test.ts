import {expectTypeOf, it} from "vitest";
import {ClientMessage, ServerMessage} from "../src";


it("Messages serveur != Messages client", () => {
    expectTypeOf<ClientMessage['type'] & ServerMessage['type']>()
        .toEqualTypeOf<never>();
});
