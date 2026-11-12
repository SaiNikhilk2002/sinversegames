import * as T from "three";

/**
 * How each realistic athlete looks: a deterministic appearance per player, and
 * the materials that draw it (skin, eyes, hair, brows and lashes, kit).
 *
 * Every squad model already has its own face (MakeHuman targets and small
 * asymmetries chosen at build time), skin, eye colour, hair and build. On top of
 * that each player gets facial hair, a haircut, hair colour and a slightly
 * different skin tone, all drawn by these shaders from masks the build stores
 * per vertex (beard, moustache, scalp, chin; see scripts/cricket-characters).
 * So two players on one squad model still look like different people, and the
 * same player looks identical in every match and replay.
 *
 * Presentation only.
 */

export type FacialHair = "clean" | "stubble" | "short-beard" | "full-beard" | "moustache" | "goatee" | "chin-strap";
export type Haircut = "model" | "buzz" | "shaved";
export interface Appearance {
  /** Squad model index. */
  model: number;
  /** Multiplies the skin texture (subtle tone variation). */
  skinTint: [number, number, number];
  facialHair: FacialHair;
  /** 0-1: how dense the facial hair is. */
  facialDensity: number;
  haircut: Haircut;
  /** Hair colour for buzz cuts and facial hair, and the tint for modelled hair. */
  hairColour: [number, number, number];
  /** 0 keeps the modelled hair's own colour; 1 recolours it to `hairColour`. */
  recolour: number;
}

/** What each squad model is like, so appearances stay plausible for that person. */
export interface ModelTraits {
  /** Natural hair colour (linear RGB). */
  hair: [number, number, number];
  /** True if the model has modelled hair (otherwise it is close-cropped or shaved). */
  hasHair: boolean;
  /** Greying with age, 0-1. */
  grey: number;
  /** How much the skin tone may vary either way. */
  toneRange: number;
  /** Warm tint for the mixed-heritage models, to widen the tone range. */
  warm: number;
}
const DARK: [number, number, number] = [0.018, 0.014, 0.012],
  BROWN: [number, number, number] = [0.05, 0.03, 0.018],
  ASH: [number, number, number] = [0.09, 0.075, 0.06];
export const TRAITS: ModelTraits[] = [
  { hair: DARK, hasHair: true, grey: 0, toneRange: 0.1, warm: 0.6 },
  { hair: DARK, hasHair: false, grey: 0, toneRange: 0.06, warm: 0 },
  { hair: BROWN, hasHair: true, grey: 0, toneRange: 0.05, warm: 0 },
  { hair: DARK, hasHair: true, grey: 0.25, toneRange: 0.06, warm: 0.2 },
  { hair: DARK, hasHair: true, grey: 0, toneRange: 0.08, warm: 0.3 },
  { hair: DARK, hasHair: false, grey: 0.3, toneRange: 0.06, warm: 0 },
  { hair: ASH, hasHair: true, grey: 0.45, toneRange: 0.05, warm: 0 },
  { hair: DARK, hasHair: true, grey: 0, toneRange: 0.12, warm: 0.8 },
  { hair: DARK, hasHair: true, grey: 0, toneRange: 0.06, warm: 0.25 },
  { hair: BROWN, hasHair: false, grey: 0.15, toneRange: 0.07, warm: 0 },
];

/** A small deterministic generator from a seed string or number. */
export function seeded(seed: string | number) {
  let h = 2166136261 >>> 0;
  const text = String(seed);
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const pick = <V>(r: number, table: [V, number][]): V => {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [v, w] of table) if ((x -= w) < 0) return v;
  return table[table.length - 1]![0];
};

/**
 * The appearance for a player on squad model `model`, from a stable identity
 * (a player ID, or role/number/team for the generated duel squads).
 */
export function appearanceFor(identity: string, model: number, avoid?: Appearance): Appearance {
  const look = choose(identity, model);
  // A second player on the same model (a team's eleventh) must not look like a twin.
  if (avoid && avoid.model === model && avoid.facialHair === look.facialHair && avoid.haircut === look.haircut)
    for (let k = 1; k < 12; k++) {
      const other = choose(identity + "#" + k, model);
      if (other.facialHair !== avoid.facialHair || other.haircut !== avoid.haircut) return other;
    }
  return look;
}

function choose(identity: string, model: number): Appearance {
  const t = TRAITS[model % TRAITS.length]!,
    r = seeded("look:" + identity);
  const facialHair = pick<FacialHair>(r(), [
    ["clean", 30],
    ["stubble", 28],
    ["short-beard", 16],
    ["full-beard", 8],
    ["moustache", 5],
    ["goatee", 7],
    ["chin-strap", 6],
  ]);
  const tone = 1 + (r() * 2 - 1) * t.toneRange,
    warm = t.warm * (r() * 2 - 1) * 0.08;
  // Hair: mostly the model's own; some players crop it or shave it.
  const haircut: Haircut = t.hasHair ? pick<Haircut>(r(), [["model", 70], ["buzz", 22], ["shaved", 8]]) : pick<Haircut>(r(), [["buzz", 55], ["shaved", 45]]);
  const grey = t.grey * (0.5 + r() * 0.5);
  const base = t.hair.map((c, i) => c * (0.8 + r() * 0.4) * (1 - grey) + grey * [0.32, 0.31, 0.3][i]!) as [number, number, number];
  return {
    model,
    skinTint: [tone * (1 + warm), tone * (1 + warm * 0.15), tone * (1 - warm * 0.6)],
    facialHair,
    facialDensity: facialHair === "stubble" ? 0.45 + r() * 0.3 : 0.75 + r() * 0.25,
    haircut,
    hairColour: base,
    recolour: grey > 0.15 ? grey : 0,
  };
}

/** Mask weights (beard, moustache, chin) a facial hair style uses, and how full it is. */
function facialWeights(a: Appearance): [number, number, number, number] {
  switch (a.facialHair) {
    case "clean":
      return [0.06, 0.06, 0.06, 0.2];
    case "stubble":
      return [1, 1, 1, 0.45];
    case "short-beard":
      return [1, 1, 1, 0.8];
    case "full-beard":
      return [1, 1, 1, 1];
    case "moustache":
      return [0.08, 1, 0.08, 0.95];
    case "goatee":
      return [0.08, 1, 1, 0.9];
    case "chin-strap":
      return [0.65, 0.06, 1, 0.85];
  }
}

// ---- shared shader pieces -----------------------------------------------------------

const HASH = /* glsl */ `
float lookHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float lookNoise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p );
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( lookHash( i ), lookHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( lookHash( i + vec2( 0.0, 1.0 ) ), lookHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
`;

/** Diffuse wrap lighting for skin: light bleeds past the terminator, red furthest. */
function skinLighting(chunk: string) {
  const from = "reflectedLight.directDiffuse += irradiance * diffuseBRDF * ( 1.0 - F );";
  if (!chunk.includes(from)) throw new Error("three.js lighting chunk changed; update the skin shader");
  return chunk.replace(
    from,
    `#ifdef SKIN_SCATTER
	float skinNdl = dot( geometryNormal, directLight.direction );
	vec3 skinWrap = clamp( ( vec3( skinNdl ) + vec3( 0.42, 0.2, 0.14 ) ) / vec3( 1.42, 1.2, 1.14 ), 0.0, 1.0 );
	vec3 skinIrr = mix( vec3( dotNL ), skinWrap * skinWrap, skinScatter ) * directLight.color;
	reflectedLight.directDiffuse += skinIrr * diffuseBRDF * ( 1.0 - F );
#else
	${from}
#endif`,
  );
}

export interface SkinOptions {
  /** Close-up detail (pores); off for the light athletes. */
  pores: boolean;
}

/**
 * The skin material for one player: the model's texture, the player's tone,
 * facial hair and haircut, wrap-lit for a soft, translucent look, with fine
 * pores that fade out with distance. The body geometry's `faceMask` attribute
 * (renamed from the glTF COLOR_0) holds the beard, moustache, scalp and chin masks.
 */
export function skinMaterial(base: T.MeshStandardMaterial, a: Appearance, o: SkinOptions) {
  const m = new T.MeshPhysicalMaterial({
    map: base.map,
    normalMap: base.normalMap ?? null,
    roughness: 0.52,
    metalness: 0,
    specularIntensity: 0.5,
    sheen: 0.25,
    sheenRoughness: 0.6,
    sheenColor: new T.Color(0.55, 0.32, 0.26),
  });
  m.name = base.name || "body";
  const [beard, tash, chin, density] = facialWeights(a);
  const uniforms = {
    skinTint: { value: new T.Vector3(...a.skinTint) },
    skinScatter: { value: 0.85 },
    facial: { value: new T.Vector4(beard, tash, chin, a.facialHair === "clean" ? 0.18 : density * a.facialDensity) },
    facialStyle: { value: a.facialHair === "stubble" || a.facialHair === "clean" ? 0 : 1 },
    // Buzz cuts and shaved heads are drawn on the scalp. Modelled hair is left to its
    // own cards: shading the scalp in front of them reads as a painted headband.
    scalpCut: { value: a.haircut === "shaved" ? 0.4 : a.haircut === "buzz" ? 0.95 : 0 },
    hairTone: { value: new T.Vector3(...a.hairColour) },
    pores: { value: o.pores ? 1 : 0 },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 faceMask;\nvarying vec4 vFaceMask;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFaceMask = faceMask;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
#define SKIN_SCATTER
uniform vec3 skinTint; uniform float skinScatter; uniform vec4 facial; uniform float facialStyle; uniform float scalpCut; uniform vec3 hairTone; uniform float pores;
varying vec4 vFaceMask;
${HASH}`,
      )
      .replace("#include <lights_physical_pars_fragment>", skinLighting(T.ShaderChunk.lights_physical_pars_fragment))
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
	diffuseColor.rgb *= skinTint;
	float hairCover = 0.0;
	{
		// Hair in texture space: fine follicle dots (stubble, buzz cuts) and ~1 mm
		// clumps (beards), each averaged out where it would only shimmer. Region
		// edges are broken up by the same noise, so nothing has a painted outline.
		vec2 fuv = vMapUv * vec2( 2600.0 );
		float dots = smoothstep( 0.35, 0.85, lookNoise( fuv ) );
		dots = mix( dots, 0.45, smoothstep( 0.6, 1.6, length( fwidth( fuv ) ) ) );
		vec2 cuv = vMapUv * vec2( 700.0 );
		float clump = lookNoise( cuv ) * 0.55 + lookNoise( cuv * 2.7 + 11.0 ) * 0.45;
		clump = mix( clump, 0.5, smoothstep( 0.5, 1.5, length( fwidth( cuv ) ) ) );
		float region = clamp( vFaceMask.r * facial.x + vFaceMask.g * facial.y + vFaceMask.a * facial.z, 0.0, 1.0 );
		float edge = smoothstep( 0.18, 0.6, region + ( clump - 0.5 ) * 0.45 );
		float face = edge * facial.w * mix( 0.55 + 0.45 * dots, 0.62 + 0.38 * smoothstep( 0.2, 0.8, clump ), facialStyle );
		// Starts low in the mask so the paler scalp painted into the skin textures never shows at the hairline.
		float scalpEdge = smoothstep( 0.04, 0.42, vFaceMask.b + ( clump - 0.5 ) * 0.5 );
		float scalp = scalpEdge * scalpCut * ( 0.7 + 0.3 * dots );
		hairCover = clamp( max( face, scalp ), 0.0, 1.0 );
		vec3 strands = hairTone * ( 0.75 + 0.6 * clump ) + diffuseColor.rgb * 0.1;
		diffuseColor.rgb = mix( diffuseColor.rgb, strands, hairCover * 0.95 );
	}`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
	roughnessFactor = mix( roughnessFactor, 0.78, hairCover );`,
      )
      .replace(
        "#include <lights_physical_fragment>",
        `#include <lights_physical_fragment>
	material.sheenColor *= 1.0 - hairCover;`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
	if ( pores > 0.5 ) {
		// Pores and fine skin texture as a screen-space bump, only up close.
		vec2 puv = vMapUv * vec2( 1900.0 );
		// Fade out before the pattern is finer than a pixel, where it would only shimmer.
		float strength = 0.00011 * ( 1.0 - smoothstep( 0.3, 0.8, length( fwidth( puv ) ) ) );
		if ( strength > 0.0 ) {
			float h = lookNoise( puv ) * 0.6 + lookNoise( puv * 2.3 ) * 0.4;
			vec2 dHdxy = vec2( dFdx( h ), dFdy( h ) ) * strength;
			vec3 vSigmaX = dFdx( - vViewPosition );
			vec3 vSigmaY = dFdy( - vViewPosition );
			vec3 R1 = cross( vSigmaY, normal );
			vec3 R2 = cross( normal, vSigmaX );
			float fDet = dot( vSigmaX, R1 ) * faceDirection;
			vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
			normal = normalize( abs( fDet ) * normal - vGrad );
		}
	}`,
      );
  };
  m.customProgramCacheKey = () => "sinverse-skin";
  return m;
}

/** Eyes: glossy, so they catch a highlight; the cornea's transparent part is cut out. */
export function eyeMaterial(base: T.MeshStandardMaterial) {
  // A touch darker and less saturated than the texture, which reads red under the tone mapping.
  const m = new T.MeshPhysicalMaterial({ map: base.map, color: new T.Color(0.8, 0.76, 0.75), roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, alphaTest: 0.5, transparent: false });
  m.name = base.name;
  return m;
}

/**
 * Hair, brows and lashes: cut-out cards, recoloured towards the player's hair
 * colour (for greying), with a soft sheen. Alpha-to-coverage smooths the strand
 * edges where the renderer has multisampling.
 */
export function hairMaterial(base: T.MeshStandardMaterial, a: Appearance, antialias: boolean, kind: "hair" | "brow" | "lash") {
  // Matte strands: a wet-look highlight is what makes card hair read as plastic.
  const m = new T.MeshPhysicalMaterial({
    map: base.map,
    roughness: kind === "hair" ? 0.78 : 0.85,
    specularIntensity: 0.3,
    metalness: 0,
    // Hair is a cut-out (it overlaps itself, so it can't be sorted). Brows and lashes are
    // thin single layers on the face: blended, so they feather like real hair instead of
    // reading as hard drawn lines.
    alphaTest: kind === "hair" ? 0.42 : 0.04,
    alphaToCoverage: kind === "hair" && antialias,
    transparent: kind !== "hair",
    depthWrite: kind === "hair",
    opacity: kind === "brow" ? 0.85 : kind === "lash" ? 0.7 : 1,
    side: T.DoubleSide,
  });
  m.name = base.name;
  const uniforms = { hairTone: { value: new T.Vector3(...a.hairColour) }, recolour: { value: kind === "lash" ? 0 : a.recolour }, darken: { value: kind === "lash" ? 0.6 : kind === "brow" ? 0.95 : 0.95 } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 hairTone; uniform float recolour; uniform float darken;").replace(
      "#include <map_fragment>",
      `#include <map_fragment>
	float lum = dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) );
	diffuseColor.rgb = mix( diffuseColor.rgb, hairTone * ( 0.55 + lum * 3.2 ), recolour ) * darken;`,
    );
  };
  m.customProgramCacheKey = () => "sinverse-hair";
  return m;
}

// ---- the kit --------------------------------------------------------------------------

export interface KitColours {
  shirt: string;
  trousers: string;
  shoes: string;
  /** Collar, cuffs and waistband. */
  trim: string;
}

/**
 * The kit: shirt, trousers and shoes in one skinned mesh. `kitInfo` per vertex
 * holds (trim, baked occlusion, part); part is 0 trousers, 1 shirt, 2 shoes.
 * Cloth is a sheen material (soft at grazing angles, like sports fabric), with
 * the build's compression folds in the geometry and its occlusion in the folds.
 */
export function kitMaterial(shoeMap: T.Texture | null, c: KitColours) {
  const m = new T.MeshPhysicalMaterial({ side: T.DoubleSide, map: shoeMap, roughness: 0.78, metalness: 0, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new T.Color(c.shirt).lerp(new T.Color("#ffffff"), 0.35), specularIntensity: 0.3 });
  m.name = "kit";
  const colour = (hex: string) => new T.Color(hex);
  const uniforms = { kitShirt: { value: colour(c.shirt) }, kitTrousers: { value: colour(c.trousers) }, kitShoes: { value: colour(c.shoes) }, kitTrim: { value: colour(c.trim) } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 kitInfo;\nvarying vec3 vKitInfo;\nvarying vec3 vKitPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvKitInfo = kitInfo;\nvKitPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vKitInfo;\nvarying vec3 vKitPos;\nuniform vec3 kitShirt; uniform vec3 kitTrousers; uniform vec3 kitShoes; uniform vec3 kitTrim;\n${HASH}`)
      .replace(
        "#include <map_fragment>",
        `float part = vKitInfo.z;
	vec3 cloth = part < 0.5 ? kitTrousers : kitShirt;
	// Collar and cuffs in the team's trim; the waistband stays the trouser colour.
	if ( part > 0.5 ) cloth = mix( cloth, kitTrim, smoothstep( 0.35, 0.75, vKitInfo.x ) );
	// A fine knit, faded out where it would shimmer.
	float knit = lookNoise( vKitPos.xy * 900.0 ) * 0.5 + lookNoise( vKitPos.zy * 900.0 ) * 0.5;
	float fwk = length( fwidth( vKitPos.xy * 900.0 ) );
	cloth *= mix( 0.94 + 0.08 * knit, 0.98, smoothstep( 0.4, 1.2, fwk ) );
	if ( part > 1.5 ) {
		cloth = kitShoes;
		#ifdef USE_MAP
			cloth *= texture2D( map, vMapUv ).rgb;
		#endif
	}
	diffuseColor.rgb *= cloth * mix( 0.45, 1.0, vKitInfo.y );`,
      )
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= mix( 0.55, 1.0, vKitInfo.y );`,
      );
  };
  m.customProgramCacheKey = () => "sinverse-kit-2";
  return m;
}
