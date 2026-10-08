import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { signMessage, verifyMessage } from "../src/signature.js";

// Test vector from SEP-53 (https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md)
const SEED = "SAKICEVQLYWGSOJS4WW7HZJWAHZVEEBS527LHK5V4MLJALYKICQCJXMW";
const SIG = "fO5dbYhXUhBMhe6kId/cuVq/AfEnHRHEvsP8vXh03M1uLpi5e46yO2Q8rEBzu3feXQewcQE5GArp88u6ePK6BA==";

describe("SEP-53 spec vector", () => {
  it("matches the published signature for 'Hello, World!'", () => {
    const kp = Keypair.fromSecret(SEED);
    expect(signMessage(SEED, "Hello, World!")).toBe(SIG);
    expect(verifyMessage(kp.publicKey(), "Hello, World!", SIG)).toBe(true);
  });
});
