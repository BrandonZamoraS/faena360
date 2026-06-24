/** @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Ferrofluid from "./Ferrofluid";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("ogl", () => ({
  Renderer: class {
    dpr = 1;
    gl = {
      canvas: document.createElement("canvas"),
      clearColor: vi.fn(),
      drawingBufferWidth: 320,
      drawingBufferHeight: 180,
    };

    setSize = vi.fn();
    render = vi.fn();
    destroy = vi.fn();
  },
  Program: class {
    remove = vi.fn();
  },
  Mesh: class {
    remove = vi.fn();
  },
  Triangle: class {
    remove = vi.fn();
  },
}));

class ResizeObserverStub {
  observe = vi.fn();
  disconnect = vi.fn();
}

describe("Ferrofluid", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1)
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts a three-color palette without requiring all eight slots", () => {
    const host = document.createElement("div");
    const root = createRoot(host);

    expect(() => {
      act(() => {
        root.render(<Ferrofluid colors={["#4F46E5", "#06B6D4", "#E0F2FE"]} />);
      });
    }).not.toThrow();

    act(() => {
      root.unmount();
    });
  });
});
