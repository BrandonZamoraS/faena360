import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_CAPABILITY_KEYS, getDefaultRoleCapabilityKeys } from "./default-role-bootstrap";

describe("default WhatsApp role bootstrap", () => {
  it("grants whatsapp.channel.access only to operative default roles", () => {
    expect(DEFAULT_ROLE_CAPABILITY_KEYS.operador).toContain("whatsapp.channel.access");
    expect(DEFAULT_ROLE_CAPABILITY_KEYS.mantenimiento).toContain("whatsapp.channel.access");
    expect(DEFAULT_ROLE_CAPABILITY_KEYS.repartidor_de_combustible).toContain("whatsapp.channel.access");
    expect(DEFAULT_ROLE_CAPABILITY_KEYS.administrador).not.toContain("whatsapp.channel.access");
    expect(DEFAULT_ROLE_CAPABILITY_KEYS.supervisor).not.toContain("whatsapp.channel.access");
  });

  it("publishes whatsapp.channel.access in the required capability contract", () => {
    expect(getDefaultRoleCapabilityKeys()).toContain("whatsapp.channel.access");
  });
});
