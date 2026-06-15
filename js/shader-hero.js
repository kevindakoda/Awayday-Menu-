/* =====================================================================
   Animated WebGL2 shader hero background. Vanilla port of the React
   "animated-shader-hero" component, recolored to the portal's navy ·
   teal · gold palette. Exposes window.ShaderHero.mount(canvas).

   Original shader by Matthias Hurrle (@atzedent); brand remap added here.
   ===================================================================== */
(function () {
  "use strict";

  let active = null; // only one hero animates at a time

  const VERT = `#version 300 es
precision highp float;
in vec4 position;
void main(){gl_Position=position;}`;

  // Fragment shader: flowing nebula remapped onto the brand palette.
  const FRAG = `#version 300 es
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x,R.y)
float rnd(vec2 p){p=fract(p*vec2(12.9898,78.233));p+=dot(p,p+34.56);return fract(p.x*p.y);}
float noise(in vec2 p){
  vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  float a=rnd(i),b=rnd(i+vec2(1,0)),c=rnd(i+vec2(0,1)),d=rnd(i+1.);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
float fbm(vec2 p){
  float t=.0,a=1.;mat2 m=mat2(1.,-.5,.2,1.2);
  for(int i=0;i<5;i++){t+=a*noise(p);p*=2.*m;a*=.5;}
  return t;
}
float clouds(vec2 p){
  float d=1.,t=.0;
  for(float i=.0;i<3.;i++){
    float a=d*fbm(i*10.+p.x*.2+.2*(1.+i)*p.y+d+i*i+p);
    t=mix(t,d,a);d=a;p*=2./(i+1.);
  }
  return t;
}
void main(void){
  vec2 uv=(FC-.5*R)/MN,st=uv*vec2(2,1);
  vec3 col=vec3(0);
  float bg=clouds(vec2(st.x+T*.5,-st.y));
  uv*=1.-.3*(sin(T*.2)*.5+.5);
  for(float i=1.;i<12.;i++){
    uv+=.1*cos(i*vec2(.1+.01*i,.8)+i*i+T*.5+.1*uv.x);
    vec2 p=uv;
    float d=length(p);
    col+=.00125/d*(cos(sin(i)*vec3(1,2,3))+1.);
    float b=noise(i+p+bg*1.731);
    col+=.002*b/length(max(p,vec2(b*p.x*.02,p.y)));
    // navy-blue haze instead of the original warm tone
    col=mix(col,vec3(bg*.05,bg*.14,bg*.22),d);
  }
  // Remap intensity onto navy -> teal -> gold brand ramp.
  float lum=dot(col,vec3(.299,.587,.114));
  vec3 navy=vec3(.055,.157,.251);
  vec3 teal=vec3(.110,.478,.549);
  vec3 gold=vec3(.851,.627,.400);
  vec3 tint=mix(navy,teal,smoothstep(.0,.35,lum));
  tint=mix(tint,gold,smoothstep(.45,.95,lum));
  col=mix(tint,col+tint*.5,.30);
  O=vec4(col,1.);
}`;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function stop() {
    if (active) { active.dispose(); active = null; }
  }

  // Attach the animation to a <canvas>. Sizes to its parent element so the
  // hero can be a banner rather than full-screen.
  function mount(canvas) {
    if (!canvas) return null;
    stop();

    const gl = canvas.getContext("webgl2");
    if (!gl) {
      // Graceful fallback: static brand gradient when WebGL2 is unavailable.
      canvas.style.background = "linear-gradient(120deg,#0e2840,#163a59 55%,#1C7A8C)";
      return null;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      canvas.style.background = "linear-gradient(120deg,#0e2840,#163a59 55%,#1C7A8C)";
      return null;
    }

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      canvas.style.background = "linear-gradient(120deg,#0e2840,#163a59 55%,#1C7A8C)";
      return null;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, "resolution");
    const uTime = gl.getUniformLocation(program, "time");

    function resize() {
      const dpr = Math.max(1, 0.5 * window.devicePixelRatio);
      const parent = canvas.parentElement || canvas;
      const w = Math.max(1, parent.clientWidth);
      const h = Math.max(1, parent.clientHeight);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    let raf = 0;
    function render(now) {
      if (!active) return;
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, now * 1e-3);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(render);
    }

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    function dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      try {
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        gl.deleteBuffer(buffer);
      } catch (_) { /* ignore */ }
    }

    active = { canvas, dispose };
    resize();
    raf = requestAnimationFrame(render);
    return active;
  }

  window.ShaderHero = { mount, stop };
})();
