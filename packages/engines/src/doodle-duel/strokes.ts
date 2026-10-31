import { z } from "zod";

/**
 * Drawing is synchronised as small stroke chunks, never as images. The canvas
 * uses a fixed logical coordinate space (CANVAS_WIDTH × CANVAS_HEIGHT) so it
 * renders identically at any screen size. Each chunk repeats the previous
 * chunk's last point, so chunks render as independent polyline segments and the
 * result does not depend on arrival order.
 */
export const CANVAS_WIDTH = 1000;
export const CANVAS_HEIGHT = 750;

export const PALETTE = [
  "#1b1b1f",
  "#ffffff",
  "#868e96",
  "#e03131",
  "#f76707",
  "#fcc419",
  "#2f9e44",
  "#1c7ed6",
  "#7048e8",
  "#d6336c",
  "#8d5524",
  "#66d9e8",
] as const;
export const BRUSH_SIZES = [3, 6, 12, 20, 32] as const;
export const CANVAS_BACKGROUND = "#ffffff";

export const MAX_POINTS_PER_CHUNK = 64;
export const MAX_STROKES_PER_TURN = 1500;
export const MAX_POINTS_PER_TURN = 40_000;

export const strokeChunkSchema = z.object({
  strokeId: z.string().regex(/^[a-zA-Z0-9]{1,24}$/),
  seq: z.number().int().min(0).max(5000),
  tool: z.enum(["pen", "eraser"]),
  color: z.enum(PALETTE),
  size: z
    .number()
    .int()
    .refine((v) => (BRUSH_SIZES as readonly number[]).includes(v), "Invalid brush size"),
  points: z
    .array(z.tuple([z.number().int().min(0).max(CANVAS_WIDTH), z.number().int().min(0).max(CANVAS_HEIGHT)]))
    .min(1)
    .max(MAX_POINTS_PER_CHUNK),
});
export type StrokeChunk = z.infer<typeof strokeChunkSchema>;

export interface Stroke {
  id: string;
  tool: StrokeChunk["tool"];
  color: string;
  size: number;
  /** Chunks keyed by sequence number, so duplicates are ignored and gaps tolerated. */
  chunks: Record<number, [number, number][]>;
}

/** Stroke as sent for a full canvas sync: chunks in sequence order. */
export interface StrokeSnapshot {
  id: string;
  tool: StrokeChunk["tool"];
  color: string;
  size: number;
  chunks: [number, number][][];
}

export const snapshotStroke = (s: Stroke): StrokeSnapshot => ({
  id: s.id,
  tool: s.tool,
  color: s.color,
  size: s.size,
  chunks: Object.keys(s.chunks)
    .map(Number)
    .sort((a, b) => a - b)
    .map((k) => s.chunks[k]!),
});
