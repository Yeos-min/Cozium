/** Subtle world-anchored pigment variation, before lighting and Kuwahara. */
export function addWallWash(material, settings) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.wallWashAmount = { value: settings.amount };
    shader.uniforms.wallWashScale = { value: settings.scale };
    material.userData.wallWashUniforms = shader.uniforms;
    shader.vertexShader = 'varying vec3 vWashPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vWashPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
    `);
    shader.fragmentShader = `
      varying vec3 vWashPosition;
      uniform float wallWashAmount;
      uniform float wallWashScale;
      float washHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float washNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(washHash(i), washHash(i + vec2(1, 0)), f.x),
                   mix(washHash(i + vec2(0, 1)), washHash(i + vec2(1, 1)), f.x), f.y);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec2 washUV = vec2(vWashPosition.x + vWashPosition.z, vWashPosition.y) * wallWashScale;
      float wash = 0.7 * washNoise(washUV) + 0.3 * washNoise(washUV * 3.1 + 4.7);
      vec3 pigment = mix(vec3(0.85, 0.90, 0.98), vec3(1.06, 1.025, 0.94), wash);
      diffuseColor.rgb *= mix(vec3(1.0), pigment, wallWashAmount);
    `);
  };
  material.customProgramCacheKey = () => 'wall-wash-v1';
}
