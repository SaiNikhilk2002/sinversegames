import { afterEach, describe, expect, it, vi } from "vitest";
// Import the server configuration functions without executing a Next request.
// No provider endpoint, storage service or local server is started by this test.
vi.mock("../../web/node_modules/server-only/index.js", () => ({}));
import { googleConfig, localIdentityFixture } from "../../web/src/lib/server/account";

afterEach(() => vi.unstubAllEnvs());
describe("Identity configuration fails closed", () => {
  it("disables Google when credentials are absent and rejects unsafe or non-exact origins", () => {
    vi.stubEnv("AUTH_ORIGIN", "http://localhost:3200");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect(googleConfig()).toBeNull();
    vi.stubEnv("GOOGLE_CLIENT_ID", "configuration-test-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "configuration-test-secret");
    for (const origin of ["http://public.example", "https://public.example/", "https://user:password@public.example", "not-a-url"]) {
      vi.stubEnv("AUTH_ORIGIN", origin);
      expect(googleConfig()).toBeNull();
    }
  });
  it("uses fixed Google HTTPS endpoints outside the guarded local fixture", () => {
    vi.stubEnv("AUTH_ORIGIN", "https://sinversegames.com");
    vi.stubEnv("GOOGLE_CLIENT_ID", "configuration-test-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "configuration-test-secret");
    vi.stubEnv("IDENTITY_TEST_MODE", "1");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/configuration_test");
    expect(localIdentityFixture()).toBe(false);
    expect(googleConfig()).toMatchObject({issuer:"https://accounts.google.com",authorization:"https://accounts.google.com/o/oauth2/v2/auth",token:"https://oauth2.googleapis.com/token",jwks:"https://www.googleapis.com/oauth2/v3/certs"});
  });
  it("requires all three explicit loopback origin, local test DB and fixture flag", () => {
    vi.stubEnv("AUTH_ORIGIN", "http://localhost:3200");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/configuration_test");
    vi.stubEnv("IDENTITY_TEST_MODE", "1");
    expect(localIdentityFixture()).toBe(true);
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/ordinary_database");
    expect(localIdentityFixture()).toBe(false);
    vi.stubEnv("DATABASE_URL", "postgresql://remote.example/configuration_test");
    expect(localIdentityFixture()).toBe(false);
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/configuration_test");
    vi.stubEnv("IDENTITY_TEST_MODE", "");
    expect(localIdentityFixture()).toBe(false);
  });
});
