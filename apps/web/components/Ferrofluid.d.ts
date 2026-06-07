import * as React from "react";

declare const Ferrofluid: React.ComponentType<{
  className?: string;
  dpr?: number;
  paused?: boolean;
  colors?: string[];
  color1?: string;
  color2?: string;
  color3?: string;
  speed?: number;
  scale?: number;
  turbulence?: number;
  fluidity?: number;
  rimWidth?: number;
  sharpness?: number;
  shimmer?: number;
  glow?: number;
  flowDirection?: string;
  opacity?: number;
  mouseInteraction?: boolean;
  mouseStrength?: number;
  mouseRadius?: number;
  mouseDampening?: number;
  mixBlendMode?: string;
}>;

export default Ferrofluid;
